"use client";

import { useEffect, useRef } from "react";
import type { AEDLocation } from "@/app/api/aed/route";
import type { RankedAED } from "@/lib/distance";

interface Props {
  aeds: AEDLocation[];
  userLat: number | null;
  userLng: number | null;
  topAEDs?: RankedAED[];
}

const RANK_COLORS = ["#ef4444", "#f97316", "#3b82f6"];

// Group AEDs whose coordinates round to the same 4-decimal value (~11m precision)
function groupByCoord(aeds: AEDLocation[]): Map<string, AEDLocation[]> {
  const map = new Map<string, AEDLocation[]>();
  for (const aed of aeds) {
    const key = `${aed.lat.toFixed(4)},${aed.lng.toFixed(4)}`;
    const arr = map.get(key) ?? [];
    arr.push(aed);
    map.set(key, arr);
  }
  return map;
}

// Spiral offset so overlapping markers don't stack
function spiralOffset(index: number, total: number): { dlat: number; dlng: number } {
  if (total === 1 || index === 0) return { dlat: 0, dlng: 0 };
  const angle = ((index - 1) / Math.max(total - 1, 1)) * 2 * Math.PI;
  const r = 0.00009; // ~10m radius
  return { dlat: Math.sin(angle) * r, dlng: Math.cos(angle) * r };
}

function aedPopupHtml(aed: AEDLocation, rankLabel?: string, rankColor?: string): string {
  const accessColor = aed.accessible ? "#16a34a" : "#dc2626";
  const accessText = aed.accessible ? "✅ 今すぐ使用可能" : "🔒 現在施錠中";

  return `
    <div style="min-width:210px;font-family:system-ui,-apple-system,sans-serif;line-height:1.4">
      ${rankLabel ? `<div style="background:${rankColor};color:#fff;padding:4px 10px;border-radius:20px;font-weight:700;font-size:12px;display:inline-block;margin-bottom:8px">${rankLabel}</div>` : ""}
      <div style="font-weight:700;font-size:14px;color:#111;margin-bottom:4px">${aed.name}</div>
      ${aed.installLocation
        ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:6px 10px;margin-bottom:6px">
             <span style="font-size:13px;font-weight:700;color:#92400e">📌 ${aed.installLocation}</span>
           </div>`
        : ""}
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${aed.address}</div>
      <div style="font-size:12px;font-weight:600;color:${accessColor}">${accessText}</div>
      ${aed.availableDays ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${aed.availableDays} ${aed.startTime}〜${aed.endTime}</div>` : ""}
    </div>
  `;
}

export default function AEDMap({ aeds, userLat, userLng, topAEDs = [] }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const centerLat = userLat ?? 35.670;
      const centerLng = userLng ?? 139.772;

      const map = L.map(mapRef.current!, { zoomControl: false }).setView([centerLat, centerLng], 15);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // User marker
      if (userLat && userLng) {
        L.circleMarker([userLat, userLng], {
          radius: 10, fillColor: "#3b82f6", color: "#fff", weight: 3, fillOpacity: 1,
        }).addTo(map).bindPopup("📍 現在地");
      }

      const topIdSet = new Set(topAEDs.map((a) => a.id));
      const rankMap = new Map(topAEDs.map((a) => [a.id, a]));

      // Group all AEDs by location for offset calculation
      const coordGroups = groupByCoord(aeds);

      // Track per-coord index for offset
      const coordIndex = new Map<string, number>();

      // --- Background AEDs (not top3) ---
      aeds.forEach((aed) => {
        if (topIdSet.has(aed.id)) return;

        const key = `${aed.lat.toFixed(4)},${aed.lng.toFixed(4)}`;
        const group = coordGroups.get(key) ?? [aed];
        const idx = coordIndex.get(key) ?? 0;
        coordIndex.set(key, idx + 1);
        const { dlat, dlng } = spiralOffset(idx, group.length);

        const lat = aed.lat + dlat;
        const lng = aed.lng + dlng;
        const color = aed.accessible ? "#22c55e" : "#f87171";
        const borderColor = aed.accessible ? "#15803d" : "#b91c1c";

        const icon = L.divIcon({
          html: `<div style="
            background:${color};
            width:18px;height:18px;
            border-radius:50%;
            border:2.5px solid ${borderColor};
            box-shadow:0 1px 4px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;
            font-size:9px;line-height:1;
          ">⚡</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: "",
        });

        L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(aedPopupHtml(aed));
      });

      // --- Top 3 AEDs — prominent numbered markers ---
      topAEDs.forEach((aed) => {
        const key = `${aed.lat.toFixed(4)},${aed.lng.toFixed(4)}`;
        const group = coordGroups.get(key) ?? [aed];
        const idx = coordIndex.get(key) ?? 0;
        coordIndex.set(key, idx + 1);
        const { dlat, dlng } = spiralOffset(idx, group.length);

        const lat = aed.lat + dlat;
        const lng = aed.lng + dlng;
        const color = RANK_COLORS[(aed.rank ?? 1) - 1] ?? "#ef4444";
        const size = aed.rank === 1 ? 40 : 32;

        const icon = L.divIcon({
          html: `<div style="
            background:${color};
            width:${size}px;height:${size}px;
            border-radius:50%;
            border:3px solid white;
            box-shadow:0 3px 10px rgba(0,0,0,0.5);
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:800;font-size:${aed.rank === 1 ? 18 : 14}px;
            font-family:system-ui;
          ">${aed.rank}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          className: "",
        });

        const ranked = rankMap.get(aed.id)!;
        const rankLabel = `第${aed.rank}位 · ${ranked.distanceM}m`;

        L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(aedPopupHtml(aed, rankLabel, color), { maxWidth: 260 });

        // Route line from user to top3
        if (userLat && userLng) {
          L.polyline([[userLat, userLng], [lat, lng]], {
            color,
            weight: aed.rank === 1 ? 3 : 1.5,
            opacity: aed.rank === 1 ? 0.85 : 0.45,
            dashArray: aed.rank === 1 ? undefined : "6,5",
          }).addTo(map);
        }
      });
    };

    initMap();
  }, [aeds, userLat, userLng, topAEDs]);

  return <div ref={mapRef} className="w-full h-full" />;
}

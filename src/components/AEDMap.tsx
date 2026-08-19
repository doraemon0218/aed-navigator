"use client";

import { useEffect, useRef } from "react";
import type { AEDLocation } from "@/app/api/aed/route";
import type { RankedAED } from "@/lib/distance";

interface CircleRange {
  radius: number;
  label: string;
  color: string;
}

interface Props {
  aeds: AEDLocation[];
  userLat: number | null;
  userLng: number | null;
  topAEDs?: RankedAED[];
  circleRanges?: CircleRange[];
  selectedId?: string;
  onAEDSelect?: (aedId: string) => void;
  patientLat?: number;
  patientLng?: number;
}

const RANK_COLORS = ["#ef4444", "#f97316", "#3b82f6"];

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

function spiralOffset(index: number, total: number): { dlat: number; dlng: number } {
  if (total === 1 || index === 0) return { dlat: 0, dlng: 0 };
  const angle = ((index - 1) / Math.max(total - 1, 1)) * 2 * Math.PI;
  const r = 0.00018;
  return { dlat: Math.sin(angle) * r, dlng: Math.cos(angle) * r };
}

function aedPopupHtml(aed: AEDLocation, rankLabel?: string, rankColor?: string): string {
  const accessColor = aed.accessible ? "#16a34a" : "#dc2626";
  const accessText = aed.accessible ? "✅ 今すぐ使用可能" : "🔒 現在施錠中";
  // installLocation may have multiple locations separated by ";"
  const locations = aed.installLocation
    ? aed.installLocation.split(";").map((s) => s.trim()).filter(Boolean)
    : [];
  return `
    <div style="min-width:220px;font-family:system-ui,-apple-system,sans-serif;line-height:1.4">
      ${rankLabel ? `<div style="background:${rankColor};color:#fff;padding:4px 10px;border-radius:20px;font-weight:700;font-size:12px;display:inline-block;margin-bottom:8px">${rankLabel}</div>` : ""}
      <div style="font-weight:800;font-size:15px;color:#111;margin-bottom:4px">🏢 ${aed.name}</div>
      ${locations.length > 0
        ? locations.map((loc) =>
            `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:5px 10px;margin-bottom:4px">
               <span style="font-size:13px;font-weight:700;color:#92400e">📌 ${loc}</span>
             </div>`
          ).join("")
        : ""}
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${aed.address}</div>
      <div style="font-size:12px;font-weight:600;color:${accessColor}">${accessText}</div>
      ${aed.availableDays ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${aed.availableDays} ${aed.startTime}〜${aed.endTime}</div>` : ""}
    </div>
  `;
}

export default function AEDMap({
  aeds,
  userLat,
  userLng,
  topAEDs = [],
  circleRanges = [],
  selectedId,
  onAEDSelect,
  patientLat,
  patientLng,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      const centerLat = userLat ?? 35.670;
      const centerLng = userLng ?? 139.772;

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([centerLat, centerLng], 17);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Inject tooltip label styles once
      if (!document.getElementById("aed-label-style")) {
        const style = document.createElement("style");
        style.id = "aed-label-style";
        style.textContent = `
          .aed-name-label {
            background: rgba(255,255,255,0.92) !important;
            border: 1.5px solid rgba(0,0,0,0.18) !important;
            border-radius: 6px !important;
            padding: 2px 7px !important;
            box-shadow: 0 1px 5px rgba(0,0,0,0.25) !important;
            pointer-events: none !important;
          }
          .aed-name-label::before { display: none !important; }
        `;
        document.head.appendChild(style);
      }

      // Concentric range circles (behind markers)
      if (userLat && userLng && circleRanges.length > 0) {
        [...circleRanges].reverse().forEach(({ radius, label, color }) => {
          L.circle([userLat, userLng], {
            radius,
            color,
            fillColor: color,
            fillOpacity: 0.05,
            weight: 1.5,
            dashArray: "8,6",
          }).addTo(map).bindTooltip(label, { permanent: false, direction: "top" });
        });
      }

      // User marker
      if (userLat && userLng) {
        L.circleMarker([userLat, userLng], {
          radius: 10, fillColor: "#3b82f6", color: "#fff", weight: 3, fillOpacity: 1,
        }).addTo(map).bindPopup("📍 現在地");
      }

      // Patient marker (respond page only — distinct from user position)
      const hasPatient = patientLat != null && patientLng != null;
      const patientDistinct = hasPatient &&
        (Math.abs((patientLat ?? 0) - (userLat ?? 0)) > 0.0001 ||
         Math.abs((patientLng ?? 0) - (userLng ?? 0)) > 0.0001);

      if (hasPatient && patientLat != null && patientLng != null) {
        const patientIcon = L.divIcon({
          html: `<div style="
            background:#ef4444;width:28px;height:28px;border-radius:50%;
            border:3px solid white;box-shadow:0 0 0 4px rgba(239,68,68,0.35),0 3px 10px rgba(0,0,0,0.45);
            display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;
          ">🏃</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          className: "",
        });
        L.marker([patientLat, patientLng], { icon: patientIcon })
          .addTo(map)
          .bindPopup(`<div style="font-weight:700;font-size:13px;color:#dc2626">🏃 患者発生場所</div>`);
      }

      const topIdSet = new Set(topAEDs.map((a) => a.id));
      const rankMap = new Map(topAEDs.map((a) => [a.id, a]));
      const coordGroups = groupByCoord(aeds);
      const coordIndex = new Map<string, number>();

      // Background AEDs
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
            background:${color};width:18px;height:18px;border-radius:50%;
            border:2.5px solid ${borderColor};box-shadow:0 1px 4px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;
          ">⚡</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: "",
        });

        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(aedPopupHtml(aed));

        marker.on("click", () => onAEDSelect?.(aed.id));
        markersRef.current.set(aed.id, marker);
      });

      // Top N AEDs — prominent numbered markers
      topAEDs.forEach((aed) => {
        const key = `${aed.lat.toFixed(4)},${aed.lng.toFixed(4)}`;
        const group = coordGroups.get(key) ?? [aed];
        const idx = coordIndex.get(key) ?? 0;
        coordIndex.set(key, idx + 1);
        const { dlat, dlng } = spiralOffset(idx, group.length);

        const lat = aed.lat + dlat;
        const lng = aed.lng + dlng;
        const color = RANK_COLORS[(aed.rank ?? 1) - 1] ?? "#6b7280";
        const size = aed.rank <= 3 ? (aed.rank === 1 ? 40 : 32) : 28;

        const icon = L.divIcon({
          html: `<div style="
            background:${color};width:${size}px;height:${size}px;border-radius:50%;
            border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.5);
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:800;font-size:${aed.rank <= 3 ? (aed.rank === 1 ? 18 : 14) : 11}px;
            font-family:system-ui;
          ">${aed.rank}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          className: "",
        });

        const ranked = rankMap.get(aed.id)!;
        const rankLabel = `第${aed.rank}位 · ${ranked.distanceM}m`;

        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(aedPopupHtml(aed, rankLabel, color), { maxWidth: 260 })
          .bindTooltip(
            `<div style="font-size:11px;font-weight:700;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">🏢 ${aed.name}</div>`,
            { permanent: true, direction: "top", offset: [0, -(size / 2 + 4)], className: "aed-name-label" }
          );

        marker.on("click", () => onAEDSelect?.(aed.id));
        markersRef.current.set(aed.id, marker);

        // Route line: user → AED
        if (userLat && userLng && aed.rank <= 3) {
          L.polyline([[userLat, userLng], [lat, lng]], {
            color,
            weight: aed.rank === 1 ? 3 : 1.5,
            opacity: aed.rank === 1 ? 0.85 : 0.45,
            dashArray: aed.rank === 1 ? undefined : "6,5",
          }).addTo(map);
        }

        // Route line: AED → patient (respond mode, rank 1 only)
        if (patientDistinct && patientLat != null && patientLng != null && aed.rank === 1) {
          L.polyline([[lat, lng], [patientLat, patientLng]], {
            color,
            weight: 2.5,
            opacity: 0.75,
            dashArray: "8,6",
          }).addTo(map);
        }
      });
    };

    initMap();
  }, [aeds, userLat, userLng, topAEDs, circleRanges, onAEDSelect, patientLat, patientLng]);

  // Pan to selected AED and open its popup
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (marker) {
      map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 });
      setTimeout(() => marker.openPopup(), 420);
    }
  }, [selectedId]);

  return <div ref={mapRef} className="w-full h-full" />;
}

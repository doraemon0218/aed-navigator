self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "🚨 緊急: AED要請";
  const body = data.body ?? "近くで心停止が発生しました。アプリを開いて確認してください。";
  const icon = data.icon ?? "/favicon.ico";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag: "aed-emergency",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 400],
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url) || c.url.includes("/emergency"));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

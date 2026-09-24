// Service worker SAMO za obavještenja na telefonu (faza 4, nalaz A6). Namjerno NE kešira ništa:
// svaki deploy se vidi odmah, a aplikacija bez mreže ionako ne može upisivati.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { naslov: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(p.naslov || "PILOT Distributeri CG", {
      body: p.tekst || "",
      icon: "/ikona-192.png",
      tag: p.id || undefined,
      data: { url: p.url || "/" },
      // Hitno (temperatura, povlačenje) ostaje na ekranu dok se ne pogleda.
      requireInteraction: !!p.hitno,
      lang: "sr",
    }),
  );
});

// Klik otvara stranu odakle je obavještenje došlo — u već otvorenoj aplikaciji ako je ima.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const prozori = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const prozor of prozori) {
        if (new URL(prozor.url).origin === self.location.origin) {
          await prozor.focus();
          if ("navigate" in prozor) await prozor.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Pregledač ponekad sam zamijeni pretplatu (istekla) — javi serveru novu, da obavještenja ne prestanu tiho.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const { javniKljuc } = await fetch("/api/push/kljuc", { credentials: "same-origin" }).then((r) => r.json());
      const nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: uBajtove(javniKljuc) });
      await fetch("/api/push/pretplata", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-zahtjev-app": "1" },
        body: JSON.stringify(nova.toJSON()),
      });
    })().catch(() => undefined),
  );
});

function uBajtove(base64url) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

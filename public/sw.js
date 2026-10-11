/* All consumer assets are generated from the complete export. Installation is all-or-nothing. */
let activeCache;
const basePath = new URL(".", self.registration.scope).pathname;
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(basePath + "offline-assets.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Offline manifest unavailable");
    const manifest = await response.json();
    const name = "sac-consumer-" + manifest.version;
    const cache = await caches.open(name);
    try { await cache.addAll(manifest.assets); activeCache = name; }
    catch (error) { await caches.delete(name); throw error; }
    // Let open tabs finish with their current app version before this worker activates.
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const consumer = keys.filter((key) => key.startsWith("sac-consumer-"));
    activeCache = activeCache || consumer.at(-1);
    await Promise.all(keys.filter((key) => (key.startsWith("sac-offline-") || key.startsWith("sac-consumer-")) && key !== activeCache).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === basePath + "data/dataset-package.json") return;
  event.respondWith((async () => {
    if (!activeCache) activeCache = (await caches.keys()).filter((key) => key.startsWith("sac-consumer-")).at(-1);
    const cache = activeCache ? await caches.open(activeCache) : undefined;
    const cached = await cache?.match(request);
    if (cached) return cached;
    try { return await fetch(request); } catch {
      if (request.mode === "navigate") {
        const pathname = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
        const page = await cache?.match(pathname);
        if (page) return page;
      }
      return Response.error();
    }
  })());
});

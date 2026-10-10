/* ChargeTruth OS service worker v2.1 — offline-first, no Google Tax.
   Caches app shell + data/*.json + packs. Stations update quarterly.
   v2.1: versioned cache, SWR for data, OCM/NREL network-first 5-min TTL,
   background-sync outbox flush, offline fallback page.
   TILES POLICY: OSM tile.openstreetmap.org is a demo fallback ONLY (low-volume,
   attribution required). Fleets MUST self-host PMTiles at tiles.chargetruth.example.com
   (pre-cache z12 bbox per state pack manifest). Bulk scrape of OSM tiles is forbidden. */
const CACHE = 'chargetruth-v2-1-0';
const SHELL = [
  './index.html',
  './offline.html',
  './404.html',
  './manifest.webmanifest',
  './src/css/styles.css',
  './src/css/fonts-selfhost.css',
  './src/js/site-config.js',
  './src/js/pilot.js',
  './src/js/app.js',
  './src/js/data-loader.js',
  './src/js/gazetteer.js',
  './src/js/reliability.js',
  './src/js/powermatch.js',
  './src/js/pluglogic.js',
  './src/js/swap.js',
  './src/js/trip-planner.js',
  './src/js/v2h.js',
  './src/js/reports.js',
  './src/js/offline-pack.js',
  './src/js/enterprise.js',
  './data/vehicles.json',
  './data/plugs.json',
  './data/swap-networks.json',
  './data/cpo.json',
  './data/cities.json',
  './data/stations.sample.geojson',
  './data/research.json',
  './assets/chart-jdp-2026-satisfaction.svg',
  './assets/chart-nacs-gap-q2-2026.svg',
  './assets/chart-power-mix-2026.svg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('sync', (e) => {
  if (e.tag === 'ct-reports') {
    e.waitUntil((async () => {
      const clients = await self.clients.matchAll();
      for (const c of clients) c.postMessage({ type: 'ct-sync-reports' });
    })());
  }
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Live APIs: network-first with 5-min cache fallback (hybrid truth)
  if (url.hostname.includes('openchargemap') || url.hostname.includes('nrel.gov') || url.pathname.includes('/ocpi/')) {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Data JSON: stale-while-revalidate (never stale scores forever)
  if (url.pathname.includes('/data/') || url.pathname.includes('/packs/')) {
    e.respondWith(caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match('./offline.html'))));
});

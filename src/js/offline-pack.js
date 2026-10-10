/* Offline packs v2: 15MB state target = stations slice + gazetteer slice + tile manifest.
   Pack = JSON {state, stations[], tilesURIs[], updated, version, ttl}.
   v2 adds: versioned packs, OPFS storage, TTL + quarterly refresh check, PMTiles note. */
export const PACK_VERSION = '2.0.0';
export const PACK_TTL_DAYS = 90;

export function estimatePackSize(stations) {
  // ~1.2KB/station JSON + overhead
  return stations.length * 1200 + 200000;
}
export function buildPack({ name, stations, cities }) {
  return {
    name, version: PACK_VERSION, updated: new Date().toISOString(),
    nextRefresh: new Date(Date.now() + PACK_TTL_DAYS * 86400000).toISOString().slice(0, 10),
    stations, cities, tiles: tileManifest(stations), sizeHint: estimatePackSize(stations),
    provenance: 'OSM dump + OCM quarterly dump + crowd. Not real-time — see live layer when online.'
  };
}
function tileManifest(stations) {
  // z12 tiles covering corridor bbox — Valhalla/tiles downloader consumes this.
  // Real math (no guessing): lon/lat → xyz at z12, count tiles, ×~45KB/tile raster avg.
  const lats = stations.map((s) => s.lat), lons = stations.map((s) => s.lon);
  if (!lats.length) return [];
  const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const z = 12;
  const x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const x0 = x(bbox[0]), x1 = x(bbox[2]), y0 = y(bbox[3]), y1 = y(bbox[1]);
  const tileCount = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  const tileMB = (tileCount * 45) / 1024; // ~45KB per z12 raster tile
  const jsonKB = (JSON.stringify(stations).length || stations.length * 1200) / 1024;
  return [{
    z, bbox, tileCount,
    tileMB: Math.round(tileMB * 10) / 10, jsonKB: Math.round(jsonKB * 10) / 10,
    totalMBest: Math.round((tileMB + jsonKB / 1024) * 10) / 10,
    fifteenMBverdict: (tileMB + jsonKB / 1024) <= 15 ? 'WITHIN 15MB target' : 'EXCEEDS 15MB — shrink bbox or drop zoom',
    // Enterprise: self-host PMTiles/Valhalla tiles for fleets; OSM policy forbids bulk scraping.
    pmtiles: 'https://tiles.chargetruth.example.com/india.pmtiles (self-host; see docs/SELFHOST.md)',
    uriTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    note: 'Demo uses OSM raster low-volume only. Fleets: pre-cache z12 bbox via self-hosted PMTiles (tile usage policy; attribution required).'
  }];
}
export function packStale(pack) {
  if (!pack?.updated) return true;
  return (Date.now() - new Date(pack.updated).getTime()) > PACK_TTL_DAYS * 86400000;
}
export async function savePackOPFS(pack) {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) throw new Error('no-opfs');
    const fh = await root.getFileHandle(`chargetruth-pack-${pack.name}.json`, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(pack));
    await w.close();
    return { saved: 'opfs' };
  } catch {
    try { localStorage.setItem(`ct-pack-${pack.name}`, JSON.stringify(pack).slice(0, 4500000)); return { saved: 'localStorage-sliced' }; }
    catch { return { saved: 'download-only' }; }
  }
}
export function downloadPack(pack) {
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chargetruth-pack-${pack.name.replace(/\W+/g, '-').toLowerCase()}-v${PACK_VERSION}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  savePackOPFS(pack).catch(() => {});
}

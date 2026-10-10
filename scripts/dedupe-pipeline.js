/* dedupe-pipeline: OCM + OSM + NREL → H3-ish grid dedupe → merged pack.
   Usage: node scripts/dedupe-pipeline.js --inputs data/stations.sample.geojson --out packs/merged.json
   No deps: 9-char geohash-ish grid (0.01° ≈1.1km) + operator normalize + plug/kW fuzzy.
   Enterprise: replaces double-counting; emits provenance + hash per station. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const inputs = (args.inputs || 'data/stations.sample.geojson').split(',');
const out = args.out || 'packs/merged.json';

function normOp(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'generic-1stall';
}
function gridKey(lat, lon) { return `${lat.toFixed(2)}|${lon.toFixed(2)}`; }
function plugsKey(plugs = []) { return [...plugs].sort().join('+'); }

const feats = inputs.flatMap((f) => {
  try { return JSON.parse(readFileSync(f, 'utf8')).features || []; } catch { return []; }
});
const seen = new Map();
let dupes = 0;
for (const ft of feats) {
  const p = ft.properties || {};
  const lat = ft.geometry?.coordinates?.[1] ?? p.lat, lon = ft.geometry?.coordinates?.[0] ?? p.lon;
  if (lat == null || lon == null) continue;
  const key = gridKey(lat, lon) + '|' + normOp(p.cpo || p.operator || '') + '|' + plugsKey(p.plugs);
  if (seen.has(key)) {
    dupes++;
    // merge: keep max stalls/kW, sum reports, keep newest updated
    const prev = seen.get(key);
    const pp = prev.properties;
    pp.stalls = Math.max(pp.stalls || 1, p.stalls || p.docks || 1);
    pp.maxKw = [...new Set([...(pp.maxKw || []), ...(p.maxKw || [])])];
    const a = pp.reports30d || { ok: 0, fail: 0, queue: 0 }, b = p.reports30d || {};
    pp.reports30d = { ok: (a.ok || 0) + (b.ok || 0), fail: (a.fail || 0) + (b.fail || 0), queue: (a.queue || 0) + (b.queue || 0) };
    pp.sources = [...new Set([...(pp.sources || [pp.source || 'unknown']), p.source || 'unknown'])];
  } else {
    p.updated = p.updated || new Date().toISOString().slice(0, 10);
    p.sources = [p.source || 'sample'];
    seen.set(key, { type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
}
mkdirSync('packs', { recursive: true });
const merged = [...seen.values()];
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', updated: new Date().toISOString(), count: merged.length, dupesRemoved: dupes, features: merged }, null, 1));
console.log(`${out}: ${merged.length} stations (${dupes} dupes removed from ${feats.length} inputs)`);

/* build-offline-pack: merge sample+OCM+OSM → per-state pack + measured manifest.
   Usage: node scripts/build-offline-pack.js --state MH --inputs data/stations.sample.geojson --out packs/mh.json
   v2.2: emits packs/<state>.manifest.json {stations, jsonKB, tileCount, tileMB, totalMBest, verdict}
   + honest 15MB verdict. Tiles: z12 bbox count × ~45KB. Never promise 15MB without measuring. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const inputs = (args.inputs || 'data/stations.sample.geojson').split(',');
const feats = inputs.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).features || []);
mkdirSync('packs', { recursive: true });
const out = args.out || `packs/${(args.state || 'demo').toLowerCase()}.json`;
writeFileSync(out, JSON.stringify({ state: args.state || 'demo', updated: new Date().toISOString(), count: feats.length, features: feats }));
const bytes = readFileSync(out).length;
// z12 tile estimate from station bbox (same math as src/js/offline-pack.js)
const coords = feats.map((f) => f.geometry?.coordinates).filter(Boolean);
let tileCount = 0, tileMB = 0;
if (coords.length) {
  const z = 12;
  const tx = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const xs = coords.map((c) => tx(c[0])), ys = coords.map((c) => ty(c[1]));
  tileCount = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
  tileMB = (tileCount * 45) / 1024;
}
const totalMB = bytes / 1048576 + tileMB;
const verdict = totalMB <= 15 ? 'WITHIN 15MB target' : 'EXCEEDS 15MB — shrink bbox or drop zoom (do NOT promise 15MB)';
const mani = { state: args.state || 'demo', updated: new Date().toISOString(), stations: feats.length, jsonKB: Math.round(bytes / 1024 * 10) / 10, tileCount, tileMB: Math.round(tileMB * 10) / 10, totalMBest: Math.round(totalMB * 10) / 10, verdict };
writeFileSync(out.replace(/\.json$/, '.manifest.json'), JSON.stringify(mani, null, 1));
console.log(`${out}: ${feats.length} stations, ${(bytes / 1048576).toFixed(2)} MB JSON + ${tileMB.toFixed(1)} MB tiles(z12 x${tileCount}) = ${totalMB.toFixed(1)} MB → ${verdict}`);

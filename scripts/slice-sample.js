/* slice-sample: split stations.sample.geojson into honest regional slices for pack measurement.
   Usage: node scripts/slice-sample.js → packs/mh-src.json (IN bbox) + packs/mi-src.json (US bbox).
   CI then builds packs/mh.json + packs/mi.json so README measured sizes stay truthful. */
import { readFileSync, writeFileSync } from 'node:fs';
const gj = JSON.parse(readFileSync('data/stations.sample.geojson', 'utf8'));
const mh = gj.features.filter((f) => { const c = f.geometry.coordinates; return c[0] >= 72 && c[0] <= 78 && c[1] >= 12 && c[1] <= 20; });
const mi = gj.features.filter((f) => { const c = f.geometry.coordinates; return c[0] <= -80 && c[0] >= -90; });
writeFileSync('packs/mh-src.json', JSON.stringify({ type: 'FeatureCollection', features: mh }));
writeFileSync('packs/mi-src.json', JSON.stringify({ type: 'FeatureCollection', features: mi }));
console.log('MH slice:' + mh.length + ' MI slice:' + mi.length);

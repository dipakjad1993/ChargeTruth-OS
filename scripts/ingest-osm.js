/* ingest-osm: OSM .pbf/.osm charging tags → normalized stations.
   Usage: node scripts/ingest-osm.js --in osm/maharashtra.osm.json --out data/stations.osm.json
   Get .pbf: Geofabrik (e.g. maharashtra-latest.osm.pbf). Convert: osmium tags-filter + export.
   Tags honored: amenity=charging, socket:*, charging:output, operator, opening_hours. */
import { readFileSync, writeFileSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
if (!args.in) { console.error('Pass --in <osm json> --out <stations json>'); process.exit(1); }
const raw = JSON.parse(readFileSync(args.in, 'utf8'));
const els = raw.elements || raw.features || [];
const stations = els.filter((e) => (e.tags?.amenity === 'charging') || e.tags?.['socket:type']).map((e, i) => {
  const t = e.tags || {};
  const sockets = Object.keys(t).filter((k) => k.startsWith('socket:')).map((k) => mapSocket(k, t[k]));
  return {
    id: `osm-${e.id || i}`, name: t.name || t.operator || `OSM charger ${e.id || i}`,
    lat: e.lat || e.geometry?.coordinates?.[1], lon: e.lon || e.geometry?.coordinates?.[0],
    cpo: (t.operator || 'generic-1stall').toLowerCase().replace(/\W+/g, '-'),
    stalls: parseInt(t['charging:points'] || t.capacity || '1'),
    maxKw: [parseFloat(t['charging:output'] || t['socket:output'] || '25')],
    plugs: [...new Set(sockets.length ? sockets : ['CCS2'])],
    reports30d: { ok: 0, fail: 0, queue: 0 }, source: 'osm'
  };
}).filter((s) => s.lat && s.lon);
writeFileSync(args.out || 'data/stations.osm.json', JSON.stringify({ type: 'FeatureCollection', features: stations.map(toFeat) }, null, 1));
console.log(`Wrote ${stations.length} OSM stations`);
function mapSocket(k, v) {
  k = k.toLowerCase();
  if (k.includes('ccs')) return k.includes('1') ? 'CCS1' : 'CCS2';
  if (k.includes('chademo')) return 'CHAdeMO';
  if (k.includes('tesla') || k.includes('nacs')) return 'NACS';
  if (k.includes('type2')) return 'Type2';
  if (k.includes('type1') || k.includes('j1772')) return 'J1772';
  if (k.includes('bharat_dc')) return 'BharatDC001';
  if (k.includes('bharat_ac')) return 'BharatAC001';
  if (k.includes('gb')) return 'GB-T-DC';
  return 'Type2';
}
function toFeat(s) { const { lat, lon, ...props } = s; return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } }; }

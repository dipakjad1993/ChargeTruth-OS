/* ingest-ocm: OpenChargeMap quarterly dump → normalized stations.
   Usage: OCM_KEY=xxx node scripts/ingest-ocm.js --country IN --out data/stations.ocm.json
   Free, no Google. Respects OCM throttle (comment header).
   v2.2: writes data/ingest-manifest.json entry {country, fetchedAt, keyMode, count, out}
   + prints dedupe-ready provenance. Run quarterly via .github/workflows/ingest-quarterly.yml. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const country = args.country || 'IN';
const key = process.env.OCM_KEY || '';
const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=${country}&maxresults=10000&compact=true&verbose=false${key ? `&key=${key}` : ''}`;
console.log('GET', url.replace(key, '***'));
const res = await fetch(url);
if (!res.ok) { console.error('OCM fetch failed', res.status); process.exit(1); }
const pois = await res.json();
const stations = pois.map((p) => ({
  id: `ocm-${p.ID}`, name: p.AddressInfo?.Title || `OCM ${p.ID}`,
  lat: p.AddressInfo?.Latitude, lon: p.AddressInfo?.Longitude,
  cpo: 'generic-1stall',
  stalls: Math.max(1, p.NumberOfPoints || 1),
  maxKw: (p.Connections || []).map((c) => c.PowerKW || 22),
  plugs: [...new Set((p.Connections || []).map((c) => mapConn(c.ConnectionType?.Title)))],
  reports30d: { ok: 0, fail: 0, queue: 0 },
  source: 'openchargemap'
})).filter((s) => s.lat && s.lon);
writeFileSync(args.out || 'data/stations.ocm.json', JSON.stringify({ type: 'FeatureCollection', features: stations.map(toFeat) }, null, 1));
console.log(`Wrote ${stations.length} stations → ${args.out || 'data/stations.ocm.json'}`);
// v2.2 manifest: quarterly audit trail (keyMode never leaks key)
try {
  const mp = 'data/ingest-manifest.json';
  const man = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : { runs: [] };
  man.runs.push({ script: 'ingest-ocm', country, out: args.out || 'data/stations.ocm.json', count: stations.length, fetchedAt: new Date().toISOString(), keyMode: key ? 'OCM_KEY-set' : 'keyless-low-QPS', nextRefresh: 'next-quarter-Jan/Apr/Jul/Oct-5th' });
  man.runs = man.runs.slice(-20);
  writeFileSync(mp, JSON.stringify(man, null, 1));
  console.log(`manifest: ${mp} updated (${man.runs.length} runs kept)`);
} catch (e) { console.log('manifest skipped:', e.message); }
function mapConn(t = '') {
  t = t.toLowerCase();
  if (t.includes('ccs') && t.includes('2')) return 'CCS2';
  if (t.includes('ccs') && t.includes('1')) return 'CCS1';
  if (t.includes('ccs')) return 'CCS2';
  if (t.includes('chademo')) return 'CHAdeMO';
  if (t.includes('tesla') || t.includes('nacs')) return 'NACS';
  if (t.includes('type 2')) return 'Type2';
  if (t.includes('j1772') || t.includes('type 1')) return 'J1772';
  if (t.includes('bharat dc')) return 'BharatDC001';
  if (t.includes('bharat ac')) return 'BharatAC001';
  if (t.includes('gb/t')) return 'GB-T-DC';
  return t || 'Type2';
}
function toFeat(s) { const { lat, lon, ...props } = s; return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } }; }

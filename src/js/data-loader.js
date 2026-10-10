/* Data loader v2: static JSON first (offline), OCPI/NREL/OCM live when online.
   Hybrid truth pipeline: live TTL cache (OPFS/localStorage) + quarterly dumps.
   There is no 100%-real-time offline — every live fetch caches with updatedAt
   and falls back to pack. See docs/ENTERPRISE.md § Real-time. */
const LIVE_TTL_MS = 5 * 60 * 1000; // 5-min live status TTL
const liveCache = new Map();

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Cannot load ${path}: ${r.status}`);
  return r.json();
}
export async function loadAll() {
  const [vehicles, plugs, swaps, cpo, cities, stations, research] = await Promise.all([
    loadJSON('./data/vehicles.json'), loadJSON('./data/plugs.json'),
    loadJSON('./data/swap-networks.json'), loadJSON('./data/cpo.json'),
    loadJSON('./data/cities.json'), loadJSON('./data/stations.sample.geojson'),
    loadJSON('./data/research.json')
  ]);
  // Merge enterprise packs if present — deduped by station id (sample + merged overlap)
  try {
    const extra = await loadJSON('./packs/merged.json').catch(() => null);
    if (extra?.features?.length) {
      const seen = new Set(stations.features.map((f) => f.properties?.id));
      for (const f of extra.features) {
        if (!seen.has(f.properties?.id)) { stations.features.push(f); seen.add(f.properties?.id); }
      }
    }
  } catch {}
  return { vehicles, plugs, swaps, cpo, cities, stations, research };
}
export function flattenStations(geojson) {
  return (geojson.features || []).map((f) => ({ ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
}

/* ---- Live layer (enterprise): OCPI 2.2.1 > NREL > OCM ---- */
function cacheGet(k) {
  const hit = liveCache.get(k);
  if (hit && Date.now() - hit.ts < LIVE_TTL_MS) return hit.data;
  try {
    const raw = localStorage.getItem('ct-live-' + k);
    if (raw) { const o = JSON.parse(raw); if (Date.now() - o.ts < LIVE_TTL_MS) return o.data; }
  } catch {}
  return null;
}
function cacheSet(k, data) {
  liveCache.set(k, { ts: Date.now(), data });
  try { localStorage.setItem('ct-live-' + k, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* OCPI 2.2.1 locations pull (self-hosted or roaming hub). Returns [] on failure. */
export async function fetchOCPI({ baseUrl = '', token = '', lat, lon, radiusKm = 60 } = {}) {
  if (!baseUrl) return { data: [], source: 'ocpi-skipped', updated: new Date().toISOString() };
  const ck = `ocpi-${lat.toFixed(2)}-${lon.toFixed(2)}`;
  const hit = cacheGet(ck);
  if (hit) return { data: hit, source: 'ocpi-cache', updated: new Date().toISOString() };
  try {
    const r = await fetch(`${baseUrl}/ocpi/2.2.1/locations/?latitude=${lat}&longitude=${lon}&radius=${radiusKm}`, {
      headers: token ? { Authorization: `Token ${token}` } : {}
    });
    if (!r.ok) throw new Error('OCPI ' + r.status);
    const data = await r.json();
    cacheSet(ck, data);
    return { data, source: 'ocpi-live', updated: new Date().toISOString() };
  } catch (e) { return { data: [], source: 'ocpi-error:' + e.message, updated: new Date().toISOString() }; }
}

/* NREL AFDC (US, free key) — authoritative US station + status feed */
export async function fetchNREL({ lat, lon, radiusKm = 80, apiKey = '' } = {}) {
  const ck = `nrel-${lat.toFixed(2)}-${lon.toFixed(2)}`;
  const hit = cacheGet(ck);
  if (hit) return { data: hit, source: 'nrel-cache', updated: new Date().toISOString() };
  if (!apiKey) return { data: [], source: 'nrel-skipped-no-key', updated: new Date().toISOString() };
  try {
    const url = `https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json?api_key=${apiKey}&latitude=${lat}&longitude=${lon}&radius=${radiusKm}&fuel_type=ELEC&status=E,T,P&access=public&limit=200`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('NREL ' + r.status);
    const j = await r.json();
    const data = (j.fuel_stations || []).map((s) => ({
      id: `nrel-${s.id}`, name: s.station_name, lat: s.latitude, lon: s.longitude,
      plugs: (s.ev_connector_types || []), maxKw: [s.ev_dc_fast_num ? 150 : 50],
      stalls: (s.ev_dc_fast_num || 0) + (s.ev_level2_evse_num || 0) || 1,
      source: 'nrel', status: s.status_code
    }));
    cacheSet(ck, data);
    return { data, source: 'nrel-live', updated: new Date().toISOString() };
  } catch (e) { return { data: [], source: 'nrel-error:' + e.message, updated: new Date().toISOString() }; }
}

/* Optional OCM live (no key needed at low QPS; add key in Settings for fleet use):
   https://api.openchargemap.io/v3/poi/?output=json&countrycode=IN&maxresults=500&compact=true&verbose=false&key=XXX
   v2.1: never throws — returns { data: [], source: 'ocm-error:…' } so direct
   callers don't crash; fetchLiveStatus() already handled errors. */
export async function fetchOCMLive({ lat, lon, distKm = 60, key = '' }) {
  const ck = `ocm-${lat.toFixed(2)}-${lon.toFixed(2)}`;
  try {
    const hit = cacheGet(ck);
    if (hit) return hit;
  } catch {}
  const url = `https://api.openchargemap.io/v3/poi/?output=json&latitude=${lat}&longitude=${lon}&distance=${distKm}&distanceunit=KM&maxresults=200&compact=true&verbose=false${key ? `&key=${key}` : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('OCM ' + r.status);
    const data = await r.json();
    try { cacheSet(ck, data); } catch {}
    return data;
  } catch (e) {
    return { data: [], source: 'ocm-error:' + String(e.message || e).slice(0, 120), updated: new Date().toISOString() };
  }
}

/* Unified live status: OCPI > NREL > OCM, first non-empty wins, always with provenance.
   UI badge rule: show source + age (LIVE green <5min, STALE amber, OFFLINE grey).
   Real-time tracking = live layer + background sync + push reroute; never fake-live. */export async function fetchLiveStatus({ lat, lon, keys = {} } = {}) {
  const parts = [];
  const ocpi = await fetchOCPI({ baseUrl: keys.ocpiBase || '', token: keys.ocpiToken || '', lat, lon });
  if (ocpi.data?.length) return { ...ocpi, provenance: 'OCPI 2.2.1 live (5-min TTL) → offline pack fallback' };
  parts.push(ocpi.source);
  const nrel = await fetchNREL({ lat, lon, apiKey: keys.nrel || '' });
  if (nrel.data?.length) return { ...nrel, provenance: 'NREL AFDC live → offline pack fallback' };
  parts.push(nrel.source);
  try {
    const ocm = await fetchOCMLive({ lat, lon, key: keys.ocm || '' });
    const arr = Array.isArray(ocm) ? ocm : ocm?.data;
    if (arr?.length) return { data: arr, source: 'ocm-live', updated: new Date().toISOString(), provenance: 'OpenChargeMap live → offline pack fallback' };
    if (ocm?.source) parts.push(ocm.source);
  } catch (e) { parts.push('ocm-error'); }
  return { data: [], source: 'offline-pack (' + parts.join(',') + ')', updated: new Date().toISOString(), provenance: 'Offline pack (quarterly dump + crowd). No live signal — scores show confidence.' };
}

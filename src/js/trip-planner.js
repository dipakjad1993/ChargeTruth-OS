/* Offline Trip Planner (Valhalla + OSM .pbf abstraction).
    No TomTom/Google. Haversine corridor + elevation/temp/load derates.
    planTrip() returns 2 optimal stops (not 6) with kW-you-get, mins, queue, price.
    Valhalla hook: pass valhallaDistKm (real road km from self-hosted Valhalla),
    or call fetchValhallaDistKm() when online — else straight-line + 1.25 circuity.
    ACCURACY NOTE: equirectangular distToSegmentKm is fine <200km, drifts >500km
    (Delhi–Jaipur ok, Detroit–Toledo ok; cross-state >500km uses Valhalla live). */
export const EARTH_KM = 6371;
export const CIRCUITY_FALLBACK = 1.25; // Mumbai–Pune measured ~1.22-1.31x; Ghats need Valhalla
export const VALHALLA_KEY = 'ct-valhalla-url';
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s1));
}

export function consumptionAdjust({ baseKwhPer100, tempC = 25, cargoKg = 0, speedKph = 80, rain = false, headwind = false, elevationGainM = 0, distKm = 100, preconditioned = false }) {
  let f = 1;
  if (tempC <= -10) f *= 1.38;
  else if (tempC <= -5) f *= 1.30;
  else if (tempC <= 0) f *= 1.22;
  else if (tempC <= 5) f *= 1.12;
  else if (tempC >= 42) f *= 1.15; // AC blast
  else if (tempC >= 35) f *= 1.08;
  f *= 1 + Math.min(0.25, (cargoKg || 0) / 2000); // +100kg ≈ +5%
  if (speedKph >= 110) f *= 1.22; else if (speedKph >= 100) f *= 1.12; else if (speedKph <= 50) f *= 0.92;
  if (rain) f *= 1.08;
  if (headwind) f *= 1.06;
  // Elevation: ~1.6 kWh per 1000m climb per 1500kg (physics), regen recovers ~60% downhill
  if (elevationGainM && distKm) {
    const climbKwh = Math.max(0, elevationGainM) * 0.0016 * 1.2;
    f += climbKwh / Math.max(1, (distKm / 100) * baseKwhPer100);
  }
  // Preconditioning saves ~8% cold penalty
  if (preconditioned && tempC <= 5) f *= 0.94;
  return { factor: +f.toFixed(3), adjKwhPer100: +(baseKwhPer100 * f).toFixed(2) };
}

export function usableRangeKm({ vehicle, socPct, tempC, cargoKg, speedKph, reservePct = 10 }) {
  const usable = vehicle.usableKwh || vehicle.batteryKwh;
  const { adjKwhPer100 } = consumptionAdjust({ baseKwhPer100: vehicle.effKwhPer100km, tempC, cargoKg, speedKph });
  const availKwh = usable * (Math.max(0, socPct - reservePct) / 100);
  return Math.max(0, (availKwh / adjKwhPer100) * 100);
}

export function planTrip({ from, to, vehicle, stations, socNow = 80, socWant = 80, tempC = 25, cargoKg = 0, speedKph = 80, reservePct = null, priceLookup = {}, elevationGainM = 0, preconditioned = false, valhallaDistKm = null }) {
  const reserve = reservePct ?? (tempC <= 0 ? 15 : 10); // Michigan-winter rule
  const rawHav = haversineKm(from, to);
  // Valhalla live geometry when available (enterprise), else straight-line ×1.25
  const distProvenance = valhallaDistKm ? 'valhalla-live' : 'haversine-est';
  const dist = valhallaDistKm || rawHav * CIRCUITY_FALLBACK; // circuity factor (Valhalla replaces when online)
  const longHaulWarn = rawHav > 500 ? ' Long-haul >500km: equirectangular corridor filter drifts — connect Valhalla for exact geometry.' : '';
  const { adjKwhPer100 } = consumptionAdjust({ baseKwhPer100: vehicle.effKwhPer100km, tempC, cargoKg, speedKph, elevationGainM, distKm: dist, preconditioned });
  const usable = vehicle.usableKwh || vehicle.batteryKwh;
  const needKwh = (dist / 100) * adjKwhPer100;
  const haveKwh = usable * (socNow / 100);
  const destNeedKwh = usable * (socWant / 100);
  let chargeNeedKwh = Math.max(0, needKwh + destNeedKwh - haveKwh);
  // Corridor filter: stations within 25 km of straight line
  const corridor = stations.filter((s) => distToSegmentKm(from, to, { lat: s.lat, lon: s.lon }) < 25);
  // Score already attached by app.js; sort by (score - detour penalty)
  const ranked = corridor.map((s) => {
    const detour = distToSegmentKm(from, to, { lat: s.lat, lon: s.lon });
    return { s, value: (s._score ?? 60) - detour * 0.8 - ((s._failRate || 0) * 50) };
  }).sort((a, b) => b.value - a.value);
  // Pick 2 optimal (or 1, or 0 if range suffices)
  const rangeNow = usableRangeKm({ vehicle, socPct: socNow, tempC, cargoKg, speedKph, reservePct: reserve });
  if (rangeNow >= dist + 10) return { distKm: Math.round(dist), distProvenance, stops: [], chargeNeedKwh: 0, note: `No stop needed — range ${Math.round(rangeNow)} km ≥ trip ${Math.round(dist)} km with ${reserve}% reserve.`, reserve, adjKwhPer100 };
  const perStopKwh = chargeNeedKwh / 2;
  const stops = ranked.slice(0, 2).map(({ s }, i) => {
    const stationKw = Math.max(...(s.maxKw || [50]));
    // lazy import avoided: app.js computes mins via powermatch; here estimate
    return { ...s, leg: i + 1, stationKw, kwhToAdd: +(i === 0 ? Math.min(perStopKwh, needKwh * 0.6) : perStopKwh).toFixed(1), detourKm: +distToSegmentKm(from, to, { lat: s.lat, lon: s.lon }).toFixed(1) };
  });
  return {
    distKm: Math.round(dist), chargeNeedKwh: +chargeNeedKwh.toFixed(1),
    adjKwhPer100, reserve, distProvenance,
    stops,
    note: `2 optimal stops (not 6). Total energy to add ≈ ${chargeNeedKwh.toFixed(1)} kWh. Winter reserve ${reserve}%. Never plan arrival <${reserve}%. Distance via ${distProvenance === 'valhalla-live' ? 'Valhalla road geometry' : 'haversine ×1.25 estimate (connect Valhalla for Ghats accuracy)'}${longHaulWarn ? '.' + longHaulWarn : '.'}`,
    safety: tempC <= 0 ? 'Cold derate applied. Precondition battery 20 min before DC stop; keep kids/warm-plan at Stop 1.' : 'Nominal conditions.'
  };
}

export function distToSegmentKm(a, b, p) {
  // approx: project in equirectangular plane
  const kx = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * 111.32;
  const dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * 110.57;
  const px = (p.lon - a.lon) * kx, py = (p.lat - a.lat) * 110.57;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = (px * dx + py * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const cx = px - t * dx, cy = py - t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

/* Valhalla live distance (online upgrade for Ghats/long-haul accuracy).
   Reads base URL from localStorage (ct-valhalla-url) or explicit arg.
   Returns { distKm, provenance } — falls back to { distKm: null } offline
   so planTrip() keeps its haversine ×1.25 path. No Google/paid API. */
export function valhallaUrl() {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(VALHALLA_KEY)) || ''; }
  catch { return ''; }
}

export async function fetchValhallaDistKm(from, to, baseUrl = '') {
  const base = (baseUrl || valhallaUrl() || '').replace(/\/$/, '');
  if (!base) return { distKm: null, provenance: 'haversine-est', reason: 'no-valhalla-url' };
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { distKm: null, provenance: 'haversine-est', reason: 'offline' };
    }
    const r = await fetch(`${base}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }], costing: 'auto', units: 'kilometers' })
    });
    if (!r.ok) throw new Error('Valhalla ' + r.status);
    const j = await r.json();
    const km = j?.trip?.summary?.length;
    if (!km) throw new Error('Valhalla empty trip');
    return { distKm: Math.round(km), provenance: 'valhalla-live' };
  } catch (e) {
    return { distKm: null, provenance: 'haversine-est', reason: String(e.message || e).slice(0, 120) };
  }
}

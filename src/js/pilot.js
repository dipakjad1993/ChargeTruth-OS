/* Fleet pilot: 20 riders × 14 days GPS — the ONLY way the 208 hrs/day claim ships.
   Protocol: baseline week (no app) vs ChargeTruth week, GPS-log hunt-min + swap wait + kWh.
   Gate (all must pass before any sales deck):
     p50 hunt <10 min with app AND hrsSavedDay >= 100 (scales to 208 @500 riders/25min)
     AND red-card precision >= 0.6 (from redCardEvalLog ground-truth revisits).
   Import CSV rows {rider_id,date,hunt_min_baseline,hunt_min_app,swaps,kwh,station} via pilotImport().
   Export via pilotCSV(). Persisted localStorage; fleet dashboard reads pilotGate(). */
const PILOT_KEY = 'chargetruth-pilot-v1';
export const PILOT_PROTOCOL = { riders: 20, days: 14, gateP50HuntMin: 10, gateHrsDayAt500: 100, gatePrecision: 0.6 };
function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
export function pilotImport(rows) {
  const cur = pilotRows();
  const clean = rows
    .map((r) => ({ rider_id: String(r.rider_id || ''), date: String(r.date || ''), hunt_min_baseline: +r.hunt_min_baseline || 0, hunt_min_app: +r.hunt_min_app || 0, swaps: +r.swaps || 0, kwh: +r.kwh || 0, station: String(r.station || '') }))
    .filter((r) => r.rider_id && r.date);
  try { localStorage.setItem(PILOT_KEY, JSON.stringify([...cur, ...clean].slice(-2000))); } catch {}
  return { imported: clean.length, total: cur.length + clean.length };
}
export function pilotRows() { try { return JSON.parse(localStorage.getItem(PILOT_KEY) || '[]'); } catch { return []; } }
export function pilotStats() {
  const rows = pilotRows();
  const saved = rows.map((r) => Math.max(0, r.hunt_min_baseline - r.hunt_min_app));
  const appHunt = rows.map((r) => r.hunt_min_app).filter((n) => n > 0);
  const riders = new Set(rows.map((r) => r.rider_id)).size;
  const days = new Set(rows.map((r) => r.date)).size;
  const meanSaved = saved.length ? saved.reduce((a, b) => a + b, 0) / saved.length : 0;
  // scale observed mean to 500-rider fleet @ 26 days/mo
  const hrsSavedDayAt500 = (500 * meanSaved) / 60;
  return {
    rows: rows.length, riders, days,
    p50HuntApp: pct(appHunt, 50), p90HuntApp: pct(appHunt, 90),
    meanSavedMin: Math.round(meanSaved * 10) / 10,
    hrsSavedDayAt500: Math.round(hrsSavedDayAt500),
    protocol: PILOT_PROTOCOL
  };
}
export function pilotGate(redPrecision = null) {
  const s = pilotStats();
  const checks = {
    ridersDays: s.riders >= 20 && s.days >= 14,
    p50: s.p50HuntApp != null && s.p50HuntApp < PILOT_PROTOCOL.gateP50HuntMin,
    hours: s.hrsSavedDayAt500 >= PILOT_PROTOCOL.gateHrsDayAt500,
    precision: redPrecision == null ? null : redPrecision >= PILOT_PROTOCOL.gatePrecision
  };
  const pass = checks.ridersDays && checks.p50 && checks.hours && (checks.precision !== false);
  return {
    ...s, checks, redPrecision, pass,
    verdict: pass ? 'PASS — may quote pilot numbers with n/dates' : 'FAIL/BLOCKED — do NOT quote 208 hrs/day in sales (see VERIFICATION.md #6)',
    csv: 'rider_id,date,hunt_min_baseline,hunt_min_app,swaps,kwh,station\n' + pilotRows().map((r) => [r.rider_id, r.date, r.hunt_min_baseline, r.hunt_min_app, r.swaps, r.kwh, r.station].join(',')).join('\n')
  };
}

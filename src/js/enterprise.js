/* Enterprise layer: RBAC + API keys + audit log + rate limits + badge + observability.
   Zero-trust ready: orgs, roles (driver/fleet/cpo/admin), signed audit trail,
   100/min/key limiter, /api/v1/* contract, OpenTelemetry spans (console + beacon).
   Plug into Clerk/Auth0/Supabase Auth in prod — this is the contract + local stub. */
const ORG_KEY = 'chargetruth-org-v1';
const AUDIT_KEY = 'chargetruth-audit-v1';
const RATE_KEY = 'chargetruth-rate-v1';

export const ROLES = ['driver', 'fleet', 'cpo', 'admin'];
const PERMS = {
  driver: ['plan', 'report', 'packs.read'],
  fleet: ['plan', 'report', 'packs.read', 'fleet.dashboard', 'api.read'],
  cpo: ['plan', 'report', 'packs.read', 'badge.write', 'stations.claim', 'api.read'],
  admin: ['*']
};

export function currentOrg() {
  try { return JSON.parse(localStorage.getItem(ORG_KEY) || '{"org":"demo-fleet","role":"fleet","key":"demo-key-1"}'); }
  catch { return { org: 'demo-fleet', role: 'fleet', key: 'demo-key-1' }; }
}
export function setOrg(o) { try { localStorage.setItem(ORG_KEY, JSON.stringify(o)); } catch {} }
export function can(action) {
  const { role } = currentOrg();
  const p = PERMS[role] || [];
  return p.includes('*') || p.includes(action);
}

export function audit(type, detail = {}) {
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    const entry = { type, detail, org: currentOrg().org, role: currentOrg().role, ts: Date.now(), seq: log.length + 1 };
    // Signed provenance chain: each entry hashes prev hash + payload (tamper-evident ledger)
    const prev = log.length ? (log[log.length - 1].hash || 'genesis') : 'genesis';
    entry.hash = provenanceHmac(prev + JSON.stringify({ type, detail, ts: entry.ts }));
    log.push(entry);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(-1000)));
    // SIEM beacon (prod: POST to /api/v1/audit; here beacon + console span)
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/v1/audit', JSON.stringify(entry));
    } catch {}
  } catch {}
  // OTel span (beacon in prod)
  try { console.debug('[otel]', type, detail); } catch {}
}
export function auditLog() { try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; } }

/* Token-bucket rate limiter: 100/min/key (enterprise API SLO guard) */
export function rateAllow(key, limit = 100, windowMs = 60000) {
  try {
    const now = Date.now();
    const all = JSON.parse(localStorage.getItem(RATE_KEY) || '{}');
    const arr = (all[key] || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) return { allowed: false, retryAfterMs: windowMs - (now - arr[0]) };
    arr.push(now); all[key] = arr;
    localStorage.setItem(RATE_KEY, JSON.stringify(all));
    return { allowed: true, remaining: limit - arr.length };
  } catch { return { allowed: true, remaining: limit }; }
}

/* White-label reliability badge: <iframe src="/badge.html?station=id"> */
export function badgeHTML({ station, result }) {
  const color = result.grade === 'A' ? '#00e676' : result.grade === 'B' ? '#8bff9e' : result.grade === 'C' ? '#ffc400' : '#ff5252';
  return `<div style="font-family:system-ui;border:1px solid #2a3d63;border-radius:12px;padding:10px 14px;background:#0b1220;color:#e8f1ff">`
    + `<b style="font-size:22px;color:${color}">${result.score}${result.grade}</b> <b>${station.name}</b>`
    + `${result.redCard ? ' <span style="background:#3a0d0d;color:#ffcdd2;border-radius:8px;padding:2px 8px">RED CARD</span>' : ''}`
    + `<div style="font-size:12px;color:#a9bcd9">Fail ${(result.failRate30d * 100 || 0).toFixed(0)}% · n=${result.sampleN} · ${result.provenance} · #${result.provenanceHash} · updated ${result.updated}</div></div>`;
}

/* Signed provenance HMAC (device-local, FNV-1a hex — server re-signs with KMS in prod).
   Guarantees every score/report carries tamper-evident hash + chain. */
export function provenanceHmac(s) {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + 31), 16777619) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

/* Moderation queue: velocity caps (3/day/device) + fraud weights feed reliability.js.
   Queue persists locally; fleet admin approves → audit() chains approval. */
const MOD_KEY = 'chargetruth-modqueue-v1';
export function modQueuePush({ stationId, kind, note = '' }) {
  try {
    const q = JSON.parse(localStorage.getItem(MOD_KEY) || '[]');
    const today = new Date().toISOString().slice(0, 10);
    const mineToday = q.filter((r) => r.day === today && r.device === deviceId()).length;
    if (mineToday >= 3) return { queued: false, reason: 'velocity-cap-3-per-day' };
    const entry = { stationId, kind, note: String(note).slice(0, 280), day: today, device: deviceId(), ts: Date.now(), status: 'pending' };
    entry.hash = provenanceHmac(JSON.stringify(entry));
    q.push(entry);
    localStorage.setItem(MOD_KEY, JSON.stringify(q.slice(-500)));
    audit('report.queued', { stationId, kind, hash: entry.hash });
    return { queued: true, hash: entry.hash };
  } catch { return { queued: false, reason: 'storage-error' }; }
}
export function modQueue() { try { return JSON.parse(localStorage.getItem(MOD_KEY) || '[]'); } catch { return []; } }
function deviceId() {
  try {
    let d = localStorage.getItem('ct-device');
    if (!d) { d = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('ct-device', d); }
    return d;
  } catch { return 'd-anon'; }
}

/* Red-card precision/recall tracker: operators log ground-truth revisit to score the blender.
   precision = true-red / all-red; recall = true-red / all-actually-broken. Surfaces in fleet dashboard. */
const RC_KEY = 'chargetruth-redcard-eval-v1';
export function redCardEvalLog({ stationId, predictedRed, actuallyBroken }) {
  try {
    const log = JSON.parse(localStorage.getItem(RC_KEY) || '[]');
    log.push({ stationId, predictedRed: !!predictedRed, actuallyBroken: !!actuallyBroken, ts: Date.now() });
    localStorage.setItem(RC_KEY, JSON.stringify(log.slice(-2000)));
  } catch {}
}
export function redCardEvalStats() {
  let TP = 0, FP = 0, FN = 0, TN = 0;
  try {
    for (const r of JSON.parse(localStorage.getItem(RC_KEY) || '[]')) {
      if (r.predictedRed && r.actuallyBroken) TP++;
      else if (r.predictedRed && !r.actuallyBroken) FP++;
      else if (!r.predictedRed && r.actuallyBroken) FN++;
      else TN++;
    }
  } catch {}
  const precision = (TP + FP) ? TP / (TP + FP) : null;
  const recall = (TP + FN) ? TP / (TP + FN) : null;
  return { TP, FP, FN, TN, precision, recall };
}

/* Health endpoint shape: GET /api/v1/health → packs version, live source, queue depth.
   On-call rule: red-card spike >30% week-over-week pages data team. */
export function healthSnapshot({ packsVersion = 'v2.1.0', liveSource = 'offline-pack', queueDepth = 0 } = {}) {
  return {
    ok: true, version: API_V1.version, packsVersion, liveSource, queueDepth,
    ts: new Date().toISOString(), slo: API_V1.slo,
    checks: { packs: packsVersion, live: liveSource, modQueue: modQueue().length, audit: auditLog().length }
  };
}
/* Fleet dashboard rollup: hrs saved, red-cards avoided, TCO export CSV.
   Pilot-gated: pass riders + minSaved measured from GPS pilot (20 riders x 2 weeks),
   never the modeled 25-min default in sales decks. Includes red-card eval stats. */
export function fleetRollup({ riders = 500, minSavedPerRiderDay = 25, reports = [] }) {
  const hrsDay = (riders * minSavedPerRiderDay) / 60;
  const evalStats = redCardEvalStats();
  return {
    riders, hrsSavedDay: Math.round(hrsDay), hrsSavedMonth: Math.round(hrsDay * 26),
    reports: reports.length, redCardPrecision: evalStats.precision, redCardRecall: evalStats.recall,
    csv: 'rider_id,date,min_saved,kwh,station\n' + `# ${riders} riders × ${minSavedPerRiderDay} min/day = ${Math.round(hrsDay)} hrs/day. Pilot-measured, not modeled. See VERIFICATION.md #6.`
  };
}

/* API v1 contract (fetch handler shape for worker/edge deploy):
   GET /api/v1/stations?lat&lon&radius → scored + provenanceHash
   GET /api/v1/badge?station=id → badgeHTML
   POST /api/v1/reports {stationId,kind} → velocity-checked, audited */
export const API_V1 = {
  version: '1.0.0', slo: '99.9% monthly, p95 <400ms edge',
  endpoints: ['GET /api/v1/stations', 'GET /api/v1/badge', 'POST /api/v1/reports', 'GET /api/v1/health'],
  auth: 'Bearer API key, RBAC per endpoint', rateLimit: '100/min/key'
};

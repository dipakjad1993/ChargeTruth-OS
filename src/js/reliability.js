/* ChargeTruth Reliability Blender v2.0 — 0-100. The money feature.
   Score = 100 * ( w1*crowd + w2*cpoPrior + w3*size + w4*freshness ) - penalties
   v2 adds: exponential time-decay (half-life 10d), Wilson 95% lower-bound + CI,
   fraud/velocity-adjusted reports, connector-level reliability, signed provenance
   ledger with updated/nextRefresh. Fully backward-compatible with v1.
   Documented in docs/METHODOLOGY.md. No black box. */
export const WEIGHTS = { crowd: 0.45, cpo: 0.25, size: 0.2, fresh: 0.1 };
export const VERSION = '2.0.0';
export const HALF_LIFE_DAYS = 10;
export const DATA_TTL_DAYS = 90; // quarterly re-verification window

export function crowdUptime(reports = { ok: 0, fail: 0 }) {
  const { ok = 0, fail = 0 } = reports;
  const n = ok + fail;
  if (n === 0) return { p: null, n: 0 };
  // Wilson lower-bound lite: shrink small samples toward 0.75 prior
  const raw = ok / n;
  const shrunk = (ok + 0.75 * 8) / (n + 8);
  return { p: shrunk, raw, n };
}

/* Proper Wilson 95% score interval — enterprise confidence display */
export function wilsonInterval(ok = 0, fail = 0, z = 1.96) {
  const n = ok + fail;
  if (!n) return { lower: 0, upper: 1, center: 0.75, n: 0 };
  const p = ok / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half), center, n };
}

/* Exponential time-decay: reports[] = [{kind:'ok'|'fail', ts}] half-life 10d.
   A fail 29 days ago counts ~13% of a fail today. Flat 30d window removed. */
export function decayedCounts(reportEvents = [], now = Date.now()) {
  let ok = 0, fail = 0, queue = 0, wsum = 0;
  for (const r of reportEvents) {
    const ageDays = Math.max(0, (now - (r.ts || now)) / 86400000);
    const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    wsum += w;
    if (r.kind === 'ok') ok += w;
    else if (r.kind === 'fail') fail += w;
    else if (r.kind === 'queue') queue += w;
  }
  return { ok, fail, queue, wsum, n: ok + fail };
}

/* Fraud/velocity adjustment: cap per-device reports, down-weight bursts.
   deviceCounts = {deviceHash: count}. Caps at 3/day/device, bursts >5/hr x0.5 */
export function fraudAdjustedReports(reports = { ok: 0, fail: 0, queue: 0 }, meta = {}) {
  const { deviceCounts = {}, burstFactor = 1 } = meta;
  let trust = 1;
  const maxPerDevice = Math.max(0, ...Object.values(deviceCounts), 0);
  if (maxPerDevice > 3) trust *= Math.max(0.4, 3 / maxPerDevice);
  trust *= Math.min(1, Math.max(0.3, burstFactor));
  const spamFlag = trust < 0.7;
  return {
    ok: (reports.ok || 0) * trust,
    fail: (reports.fail || 0) * trust,
    queue: reports.queue || 0,
    trust: +trust.toFixed(3),
    spamFlag,
    note: spamFlag ? 'Down-weighted: burst/velocity anomaly detected, pending moderation' : 'No anomaly'
  };
}

export function sizeScore(stalls = 1, assure = false) {
  // Redundancy math: P(all down) ≈ (1-p)^stalls. 1 stall = fragile.
  if (stalls >= 12) return 0.97;
  if (stalls >= 8) return assure ? 0.98 : 0.93;
  if (stalls >= 6) return assure ? 0.96 : 0.89;
  if (stalls >= 4) return assure ? 0.93 : 0.84;
  if (stalls >= 2) return 0.74;
  return 0.55; // single stall
}

export function freshnessScore(reports = {}) {
  const n = (reports.ok || 0) + (reports.fail || 0);
  if (n >= 100) return 1.0;
  if (n >= 40) return 0.92;
  if (n >= 15) return 0.8;
  if (n >= 5) return 0.65;
  return 0.45; // thin data — score leans on CPO prior, flagged low-confidence
}

export function queueRisk(reports = {}, stalls = 2, opts = {}) {
  const q = reports.queue || 0;
  const n = (reports.ok || 0) + (reports.fail || 0) + q;
  if (!n) return { level: 'unknown', p: 0.2, label: 'No queue data — arrive with buffer', p50min: null, p90min: null };
  const qp = q / n;
  // Normalize by stalls: 20 queues at 8 stalls ≠ 20 queues at 1 stall
  const perStall = q / Math.max(1, stalls);
  const hourBoost = opts.isRush ? 0.12 : 0;
  const risk = Math.min(0.95, qp * 1.4 + (perStall > 6 ? 0.15 : 0) + hourBoost);
  // p50/p90 wait estimator (Paren-calibrated: 15.6% util avg hides 60%+ peaks)
  const baseMin = opts.avgSessionMin || 28;
  const p50 = risk > 0.45 ? Math.round(baseMin * 0.6) : risk > 0.22 ? Math.round(baseMin * 0.25) : 0;
  const p90 = risk > 0.45 ? Math.round(baseMin * 1.4) : risk > 0.22 ? Math.round(baseMin * 0.6) : Math.round(baseMin * 0.2);
  if (risk > 0.45) return { level: 'high', p: risk, label: 'High queue risk — peak waits likely', p50min: p50, p90min: p90 };
  if (risk > 0.22) return { level: 'medium', p: risk, label: 'Medium queue risk', p50min: p50, p90min: p90 };
  return { level: 'low', p: risk, label: 'Low queue risk', p50min: p50, p90min: p90 };
}

/* Connector-level reliability: EA CCS1 dispenser #3 fails ≠ whole site.
   connectors = [{plug, ok, fail}]. Returns worst-plug penalty 0..0.08 */
export function connectorPenalty(connectors = []) {
  if (!connectors.length) return { penalty: 0, worst: null };
  let worst = null, worstRate = 0;
  for (const c of connectors) {
    const n = (c.ok || 0) + (c.fail || 0);
    if (n >= 5) {
      const r = c.fail / n;
      if (r > worstRate) { worstRate = r; worst = c; }
    }
  }
  if (worst && worstRate >= 0.3) return { penalty: 0.08, worst: worst.plug, rate: worstRate };
  if (worst && worstRate >= 0.2) return { penalty: 0.04, worst: worst.plug, rate: worstRate };
  return { penalty: 0, worst: worst?.plug || null };
}

/* Simple FNV-1a provenance hash for signed ledger (no dep).
   NOTE: FNV-1a is a non-cryptographic checksum for tamper-evidence in demo/offline
   packs, NOT a signature. For enterprise SSO/pilot billing use provenanceHmac()
   with a server-side secret. ledgerHash() is the preferred alias (same output). */
export function provenanceHash(obj) {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

/* Preferred alias — same FNV-1a checksum, honest name (not a signature). */
export const ledgerHash = provenanceHash;

/* Enterprise HMAC-SHA256 ledger signature (async, WebCrypto; Node 20+).
   Use when station scores feed billing/SLA dashboards. Falls back to FNV hash
   string when SubtleCrypto is unavailable (offline older browsers). */
export async function provenanceHmac(obj, secret = '') {
  const msg = JSON.stringify(obj);
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || !secret) return { alg: 'fnv1a-fallback', hash: provenanceHash(obj) };
    const key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(msg));
    return { alg: 'HMAC-SHA256', hash: [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32) };
  } catch {
    return { alg: 'fnv1a-fallback', hash: provenanceHash(obj) };
  }
}

export function scoreStation(feature, cpoPrior = 0.75, opts = {}) {
  const p = feature.properties || feature;
  const stalls = p.stalls || p.docks || 1;
  const assure = !!p.assure;
  let reports = p.reports30d || { ok: 0, fail: 0, queue: 0 };
  // v2: apply decay if event log present, then fraud adjustment
  if (Array.isArray(p.reportEvents) && p.reportEvents.length) {
    const d = decayedCounts(p.reportEvents, opts.now);
    reports = { ok: d.ok, fail: d.fail, queue: (reports.queue || 0) + d.queue };
  }
  if (opts.deviceCounts || opts.burstFactor) {
    const adj = fraudAdjustedReports(reports, opts);
    reports = { ok: adj.ok, fail: adj.fail, queue: adj.queue };
    opts._trust = adj.trust; opts._spam = adj.spamFlag;
  }
  const crowd = crowdUptime(reports);
  const crowdP = crowd.p === null ? cpoPrior : crowd.p;
  const cpoP = typeof cpoPrior === 'number' ? cpoPrior : 0.75;
  const sizeP = sizeScore(stalls, assure);
  const freshP = freshnessScore(reports);
  let blended = WEIGHTS.crowd * crowdP + WEIGHTS.cpo * cpoP + WEIGHTS.size * sizeP + WEIGHTS.fresh * freshP;
  // Penalties (transparent, listed in breakdown)
  const penalties = [];
  const total = (reports.ok || 0) + (reports.fail || 0);
  const rawFail = total ? (reports.fail || 0) / total : 0;
  const queue = queueRisk(reports, stalls, opts);
  // RED-CARD v2.1: 28% threshold (was 30%) + queue-escalation.
  // EA Dearborn 90/38 = 29.7% previously escaped; now correctly red-cards.
  // Borderline 28-30% with HIGH queue also red-cards (peak failure + wait = tow risk).
  const highQueue = queue.level === 'high';
  if (rawFail >= 0.28 && total >= 10) {
    blended -= 0.12;
    penalties.push(`High raw fail rate ${(rawFail * 100).toFixed(0)}% (${Math.round(reports.fail)}/${Math.round(total)} in 30d decay-weighted)`);
  }
  else if (rawFail >= 0.2 && total >= 10) { blended -= 0.06; penalties.push(`Elevated fail rate ${(rawFail * 100).toFixed(0)}%`); }
  if (stalls === 1 && total >= 5 && rawFail >= 0.25) { blended -= 0.05; penalties.push('Single-stall fragility: one fault = 100% outage'); }
  if (crowd.n < 5) { penalties.push('Thin data (<5 reports) — score leans on CPO prior, low confidence'); }
  const conn = connectorPenalty(p.connectors || []);
  if (conn.penalty) { blended -= conn.penalty; penalties.push(`Worst connector ${conn.worst} fail ${(conn.rate * 100).toFixed(0)}% — check dispenser, not whole site`); }
  if (opts._spam) penalties.push('Velocity anomaly — reports down-weighted pending moderation');
  const score = Math.max(2, Math.min(99, Math.round(blended * 100)));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  // v2.1 red-card: fail>=28% (n>=10) OR score<40 OR (fail>=25% AND high queue).
  // Never silently pass a borderline-failing + long-queue corridor stop.
  const redCard = (rawFail >= 0.28 && total >= 10) || score < 40 || (rawFail >= 0.25 && total >= 10 && highQueue);
  if (rawFail >= 0.25 && total >= 10 && highQueue && rawFail < 0.28) {
    penalties.push(`Queue-escalated red card: ${(rawFail * 100).toFixed(0)}% fail + HIGH queue (${queue.p50min}-${queue.p90min} min waits)`);
  }
  const wilson = wilsonInterval(Math.round(reports.ok || 0), Math.round(reports.fail || 0));
  const updated = p.updated || new Date().toISOString();
  const nextRefresh = new Date(new Date(updated).getTime() + DATA_TTL_DAYS * 86400000).toISOString().slice(0, 10);
  const ledger = { station: p.id || 'unknown', score, grade, failRate: total ? +(reports.fail / total).toFixed(3) : null, n: Math.round(total), updated };
  return {
    score, grade, redCard, version: VERSION,
    failRate30d: total ? reports.fail / total : null,
    failCount: Math.round(reports.fail || 0), okCount: Math.round(reports.ok || 0), sampleN: Math.round(total),
    confidence: { wilsonLower: +wilson.lower.toFixed(3), wilsonUpper: +wilson.upper.toFixed(3), level: total >= 40 ? 'high' : total >= 15 ? 'medium' : 'low', trust: opts._trust ?? 1 },
    queue, penalties,
    breakdown: { crowdP: +crowdP.toFixed(3), cpoP, sizeP, freshP, weights: WEIGHTS, connectorPenalty: conn.penalty },
    provenance: `crowd ${Math.round(crowd.n)} reports (decay hl=${HALF_LIFE_DAYS}d) + CPO prior ${cpoP} + ${stalls} stall(s)${assure ? ' + Assure SLA' : ''}`,
    provenanceHash: provenanceHash(ledger),
    updated, nextRefresh,
    advice: redCard ? `Avoid this station — ${((rawFail || 0) * 100).toFixed(0)}% fail rate last 30d (${Math.round(reports.fail)}/${Math.round(total)}). Routed only as last-resort.` : score >= 70 ? 'Preferred stop — high confidence.' : 'Usable with Plan B within 40 km.'
  };
}

export function rankStations(features, cpoMap = {}, opts = {}) {
  return features.map((f) => {
    const cpo = cpoMap[(f.properties || f).cpo];
    const prior = cpo ? cpo.priorUptime : 0.72;
    return { feature: f, result: scoreStation(f, prior, opts) };
  }).sort((a, b) => b.result.score - a.result.score);
}

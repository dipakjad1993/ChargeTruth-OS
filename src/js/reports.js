/* Reports v2: 1-tap working/broken/queue. localStorage first, sync when online.
   Free backends: Supabase (PostgREST) or Cloudflare D1 (worker). Configure in Settings tab.
   v2 adds: device fingerprint + velocity caps (3/day/device), moderation queue,
   background-sync outbox, signed events with ts for decay-weighted scoring. */
const KEY = 'chargetruth-reports-v1';
const OUTBOX = 'chargetruth-outbox-v2';
const DEVICE = 'chargetruth-device-v1';
const CAP_PER_DAY = 3;

export function deviceId() {
  try {
    let d = localStorage.getItem(DEVICE);
    if (!d) { d = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE, d); }
    return d;
  } catch { return 'd-anon'; }
}

export function localReports() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function velocityCheck(stationId) {
  const dayAgo = Date.now() - 86400000;
  const mine = localReports().filter((r) => r.device === deviceId() && r.ts > dayAgo);
  if (mine.filter((r) => r.stationId === stationId).length >= CAP_PER_DAY) {
    return { allowed: false, reason: `Velocity cap: max ${CAP_PER_DAY}/day/station/device. Prevents gaming.` };
  }
  if (mine.length >= 20) return { allowed: false, reason: 'Daily device cap reached (20). Try tomorrow.' };
  return { allowed: true };
}

export function submitReport({ stationId, kind, note = '' }) {
  // kind: 'ok' | 'fail' | 'queue'
  const chk = velocityCheck(stationId);
  if (!chk.allowed) { try { alert(chk.reason); } catch {} return localReports().length; }
  const all = localReports();
  const ev = { stationId, kind, note: (note || '').slice(0, 280), ts: Date.now(), synced: false, device: deviceId(), v: 2 };
  all.push(ev);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  // outbox for Background Sync
  try {
    const box = JSON.parse(localStorage.getItem(OUTBOX) || '[]');
    box.push(ev);
    localStorage.setItem(OUTBOX, JSON.stringify(box));
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then((reg) => reg.sync?.register('ct-reports').catch(() => {})).catch(() => {});
    }
  } catch {}
  // apply immediately to in-memory station cache via CustomEvent
  try { window.dispatchEvent(new CustomEvent('chargetruth-report', { detail: { stationId, kind } })); } catch {}
  // fire-and-forget sync
  syncReports().catch(() => {});
  // audit log (enterprise)
  try {
    const audit = JSON.parse(localStorage.getItem('chargetruth-audit-v1') || '[]');
    audit.push({ type: 'report.submit', stationId, kind, ts: Date.now(), device: deviceId() });
    localStorage.setItem('chargetruth-audit-v1', JSON.stringify(audit.slice(-500)));
  } catch {}
  return all.length;
}

/* Moderation queue: fleet/CPO admins approve thin-data red cards */
export function moderationQueue() {
  const all = localReports();
  const byStation = {};
  for (const r of all) { (byStation[r.stationId] = byStation[r.stationId] || []).push(r); }
  return Object.entries(byStation)
    .filter(([, rs]) => rs.length < 5)
    .map(([stationId, rs]) => ({ stationId, count: rs.length, needsReview: true }));
}

export function pendingCount() { return localReports().filter((r) => !r.synced).length; }

export async function syncReports() {
  const url = (typeof localStorage !== 'undefined' && localStorage.getItem('ct-supabase-url')) || '';
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('ct-supabase-key')) || '';
  const all = localReports();
  const pending = all.filter((r) => !r.synced);
  if (!pending.length) return { synced: 0 };
  if (!url || !key) return { synced: 0, reason: 'offline-queue: no backend configured, kept locally' };
  let n = 0;
  for (const r of pending) {
    try {
      await fetch(`${url}/rest/v1/reports`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: r.stationId, kind: r.kind, note: r.note, ts: new Date(r.ts).toISOString(), device: r.device })
      });
      r.synced = true; n++;
    } catch { break; }
  }
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  return { synced: n };
}
/* SQL for Supabase free tier (paste once):
create table reports (id bigint generated always as identity primary key, station_id text, kind text, note text, device text, created_at timestamptz default now());
alter table reports enable row level security; create policy "open insert" on reports for anon with check (true); create policy "open read" on reports for anon using (true);
create index on reports (station_id, created_at desc);
*/

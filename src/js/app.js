/* ChargeTruth OS app wiring — 3-tab hybrid shell (Plan / Score / Report).
   Companion pages (garage.html, swap.html, research.html, saved.html) lazy-load
   their own modules; this shell stays lean for driver glare + offline INP. */
import { loadAll, flattenStations } from './data-loader.js';
import { searchCities, fmtCity } from './gazetteer.js';
import { scoreStation } from './reliability.js';
import { actualKw, sessionMinutesResult, powerMatchSummary } from './powermatch.js';
import { initPlugLogic, checkPlugFit } from './pluglogic.js';
import { submitReport, pendingCount, syncReports } from './reports.js';
import { planTrip, fetchValhallaDistKm } from './trip-planner.js';
import { v2hPlan } from './v2h.js';
import { siteUrl, isPlaceholderDomain, initAnalytics } from './site-config.js';
import { stopLocationHTML, oemLinkHTML, paintVehiclePhoto } from './media.js';

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
let DB = null, ST = [], CPO = {}, SEL = { from: null, to: null, vehicle: null, mode: '4W' };

function vehById(id) { return DB.vehicles.vehicles.find((v) => v.id === id); }
function attachCurve(v) {
  const curves = DB.vehicles.curves;
  return { ...v, curve: curves[v.curveId] || { points: [[10, v.maxKwDc || 0]] } };
}
function priceOf(s) {
  if (s.pricePerKwhINR) return `₹${s.pricePerKwhINR}/kWh`;
  if (s.pricePerKwhUSD) return `$${s.pricePerKwhUSD}/kWh`;
  if (s.pricePerSwapINR) return `₹${s.pricePerSwapINR}/swap`;
  if (s.pricePerSwapUSD) return `$${s.pricePerSwapUSD}/swap`;
  return 'price n/a';
}

/* v2.1 helpers: crash-safe max-kW + cross-currency display (INR/USD ~₹83/$). */
export const FX_INR_PER_USD = 83;
export function maxKwOf(s) {
  const arr = Array.isArray(s.maxKw) && s.maxKw.length ? s.maxKw : (s.stationKw ? [s.stationKw] : [50]);
  const nums = arr.filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 50;
}
export function priceBoth(s) {
  const base = priceOf(s);
  if (s.pricePerKwhINR) return `${base} (~$${(s.pricePerKwhINR / FX_INR_PER_USD).toFixed(2)})`;
  if (s.pricePerKwhUSD) return `${base} (~₹${Math.round(s.pricePerKwhUSD * FX_INR_PER_USD)})`;
  if (s.pricePerSwapINR) return `${base} (~$${(s.pricePerSwapINR / FX_INR_PER_USD).toFixed(2)})`;
  if (s.pricePerSwapUSD) return `${base} (~₹${Math.round(s.pricePerSwapUSD * FX_INR_PER_USD)})`;
  return base;
}

async function boot() {
  DB = await loadAll();
  initPlugLogic(DB.plugs);
  CPO = Object.fromEntries(DB.cpo.cpos.map((c) => [c.id, c]));
  ST = flattenStations(DB.stations);
  // attach scores
  for (const s of ST) {
    const prior = (CPO[s.cpo]?.priorUptime) ?? 0.72;
    const r = scoreStation({ properties: s }, prior);
    s._score = r.score; s._grade = r.grade; s._red = r.redCard;
    s._failRate = r.failRate30d; s._queue = r.queue; s._prov = r.provenance;
    s._penalties = r.penalties; s._advice = r.advice;
  }
  buildVehicleSelect();
  const pf = $('plugFilter');
  if (pf) pf.innerHTML = `<option value="">All compatible with my vehicle</option>` +
    [...new Set(ST.flatMap((s) => s.plugs || []))].map((p) => `<option>${p}</option>`).join('');
  const rs = $('repStation');
  if (rs) rs.innerHTML = ST.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  bindSearch(); bindTabs(); bindMode();
  renderVehicleCard(); renderStations(); updateNet();
  const fs = $('footStats');
  if (fs) fs.textContent = `${ST.length} stations (sample pack v2.1: OSM+OCM quarterly + crowd; connect OCPI/NREL keys for live) · ${DB.vehicles.vehicles.length} vehicles · ${DB.cities.cities.length} cities offline`;
  try {
    const merged = await fetch('./packs/merged.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (merged && merged.dupesRemoved != null && fs) {
      fs.textContent += ` · dedupe ${merged.dupesRemoved} removed (${merged.count} kept)`;
    }
  } catch {}
  if (isPlaceholderDomain()) console.warn('[setup] canonical domain is placeholder — set <meta name="ct-site-url"> (see src/js/site-config.js).');
  initAnalytics();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('online', updateNet); window.addEventListener('offline', updateNet);
  window.addEventListener('chargetruth-report', () => { updateNet(); });
}

function buildVehicleSelect() {
  const sel = $('vSelect');
  if (!sel) return;
  const groups = {};
  const pool = DB.vehicles.vehicles.filter((v) => SEL.mode === '2W' ? v.class !== '4W' : v.class === '4W' || !v.class ? true : SEL.mode === '4W' ? v.class === '4W' : true);
  // 4W mode shows 4W first; 2W mode shows swap/2W first — full list stays reachable via Garage.
  const list = SEL.mode === '2W'
    ? [...DB.vehicles.vehicles.filter((v) => v.class !== '4W'), ...DB.vehicles.vehicles.filter((v) => v.class === '4W')]
    : DB.vehicles.vehicles;
  for (const v of list) { (groups[v.market || 'GLOBAL'] ||= []).push(v); }
  void pool;
  const opt = (v) => `<option value="${v.id}">${v.name} · ${v.maxKwDc}kW DC · ${v.plugDc || v.swap || v.plugAc}</option>`;
  sel.innerHTML = Object.keys(groups).sort().map((m) => `<optgroup label="${m} — ${groups[m].length} models">${groups[m].map(opt).join('')}</optgroup>`).join('');
  const def = SEL.mode === '2W' ? 'sun-buddy-2' : 'tata-nexon-ev-45';
  sel.value = [...sel.options].some((o) => o.value === def) ? def : sel.options[0]?.value;
  SEL.vehicle = attachCurve(vehById(sel.value));
}

function bindMode() {
  const b4 = $('mode4w'), b2 = $('mode2w');
  if (!b4 || !b2) return;
  const set = (m) => {
    SEL.mode = m;
    b4.classList.toggle('active', m === '4W'); b2.classList.toggle('active', m === '2W');
    b4.setAttribute('aria-pressed', m === '4W' ? 'true' : 'false');
    b2.setAttribute('aria-pressed', m === '2W' ? 'true' : 'false');
    buildVehicleSelect(); renderVehicleCard(); renderStations();
    const sl = $('swapLink');
    if (sl && m === '2W') sl.innerHTML = '<b>Swap finder → (recommended for 2W)</b>';
  };
  b4.onclick = () => set('4W');
  b2.onclick = () => set('2W');
}

function bindTabs() {
  const order = ['plan', 'stations', 'report'];
  const go = (name, focus = false) => {
    document.querySelectorAll('.tabs button, .bottomnav button').forEach((x) => {
      const onx = x.dataset.tab === name;
      x.classList.toggle('active', onx);
      if (x.closest('.tabs')) { x.setAttribute('aria-selected', onx ? 'true' : 'false'); x.tabIndex = onx ? 0 : -1; }
      if (x.closest('.bottomnav')) { if (onx) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); }
    });
    document.querySelectorAll('.tab').forEach((x) => {
      const onx = x.id === 'tab-' + name;
      x.classList.toggle('active', onx);
      if (onx) x.removeAttribute('hidden'); else x.setAttribute('hidden', '');
    });
    if (focus) document.querySelector(`.tabs button[data-tab="${name}"]`)?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.ctGo = go;
  const btns = [...document.querySelectorAll('.tabs button, .bottomnav button')];
  btns.forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  // M3 keyboard: ArrowLeft/Right across top tabs, Home/End
  document.querySelector('.tabs')?.addEventListener('keydown', (e) => {
    const cur = order.indexOf(document.querySelector('.tabs button.active')?.dataset.tab || 'plan');
    if (e.key === 'ArrowRight') { e.preventDefault(); go(order[(cur + 1) % order.length], true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(order[(cur - 1 + order.length) % order.length], true); }
    if (e.key === 'Home') { e.preventDefault(); go(order[0], true); }
    if (e.key === 'End') { e.preventDefault(); go(order[order.length - 1], true); }
  });
  on('vSelect', 'change', (e) => { SEL.vehicle = attachCurve(vehById(e.target.value)); renderVehicleCard(); renderStations(); });
  on('planBtn', 'click', doPlan);
  on('sortSel', 'change', renderStations); on('plugFilter', 'change', renderStations);
  on('amenFilter', 'change', renderStations);
  on('payFilter', 'change', renderStations);
  document.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
    const n = submitReport({ stationId: $('repStation').value, kind: b.dataset.rep, note: $('repNote').value });
    alert(`Saved locally (${b.dataset.rep}). ${n} total reports, ${pendingCount()} pending sync. Station rescores instantly.`);
    location.reload();
  }));
  on('syncBtn', 'click', async () => {
    localStorage.setItem('ct-supabase-url', $('sbUrl').value); localStorage.setItem('ct-supabase-key', $('sbKey').value);
    const { syncReports: sync } = await import('./reports.js');
    const r = await sync();
    $('syncMsg').textContent = r.synced ? `Synced ${r.synced}` : (r.reason || 'Nothing to sync');
    updateNet();
  });
  on('reportFab', 'click', () => go('report'));
  // methodLink is now a plain href to research.html — no JS hijack.
}

function bindSearch() {
  const wire = (inputId, sugId, key) => {
    const inp = $(inputId), sug = $(sugId);
    if (!inp || !sug) return;
    inp.oninput = () => {
      const hits = searchCities(DB.cities.cities, inp.value);
      sug.innerHTML = hits.map((c, i) => `<div data-i="${i}">${fmtCity(c)}</div>`).join('');
      sug.querySelectorAll('div').forEach((d) => d.onclick = () => { SEL[key] = hits[+d.dataset.i]; inp.value = fmtCity(SEL[key]); sug.innerHTML = ''; });
    };
  };
  wire('fromQ', 'fromSug', 'from'); wire('toQ', 'toSug', 'to');
  // defaults: Mumbai → Pune
  SEL.from = DB.cities.cities.find((c) => c.n === 'Mumbai'); SEL.to = DB.cities.cities.find((c) => c.n === 'Pune');
  if ($('fromQ') && SEL.from) $('fromQ').value = fmtCity(SEL.from);
  if ($('toQ') && SEL.to) $('toQ').value = fmtCity(SEL.to);
}

function renderVehicleCard() {
  const box = $('vCard');
  if (!box || !SEL.vehicle) return;
  const v = SEL.vehicle;
  const pm = powerMatchSummary({ vehicle: v, stationKw: 120, soc: 20 });
  box.innerHTML = `<b>${v.name}</b> · ${v.batteryKwh}kWh (${v.usableKwh} usable) · <b>${v.maxKwAc}kW AC / ${v.maxKwDc}kW DC</b> · plugs ${v.plugAc || '—'}/${v.plugDc || '—'}${v.swap ? ` · swap <b>${v.swap}</b>` : ''}${v.v2x ? ' · <span class="tag">V2H ✓</span>' : ''}<br>`
    + `<img class="vphoto" id="vPhoto" alt="" hidden><div class="photocap" id="vPhotoCap"></div>`
    + `<div>${oemLinkHTML(v)}</div>`
    + `<span class="muted">${v.notes || ''}</span><br><span class="muted">Example: on a 120kW stall you get <b>${pm.youGetKw}kW</b>. ${pm.message}</span>`;
  paintVehiclePhoto($('vPhoto'), $('vPhotoCap'), v);
}

async function doPlan() {
  const out = $('planOut');
  const v = SEL.vehicle;
  if (!out || !v) return;
  const socNow = +$('socNow').value, socWant = +$('socWant').value;
  const tempC = +$('tempC').value, cargoKg = +$('cargoKg').value, speedKph = +$('speedKph').value;
  if (!SEL.from || !SEL.to) { alert('Pick start + end from the offline gazetteer.'); return; }
  // AC-only guard (safe wrapper — never Infinity in UI)
  if (!v.maxKwDc && !v.swap) {
    const { sessionMinutesResult: smr } = await import('./powermatch.js');
    const r = smr({ vehicle: v, curve: v.curve, fromSoc: socNow, toSoc: socWant, stationKw: 50, tempC });
    out.innerHTML = `<h2>Step 3 — Route output</h2><div class="redcard">⛔ ${r.error}</div>`;
    return;
  }
  // Swap-only guard → deep-link to swap page instead of fake plan
  if (v.swap && !v.plugAc && !v.plugDc) {
    out.innerHTML = `<h2>Step 3 — Swap plan</h2><p><b>${v.name}</b> is swap-only — plug routing does not apply.</p><p><a class="big-link" href="./swap.html">Open Swap finder →</a></p>`;
    return;
  }
  // Plug-compatible stations only
  const compat = ST.filter((s) => {
    if (s.swap) return false;
    const r = checkPlugFit(v, s.plugs || []);
    return !r.hardStop;
  });
  // Valhalla upgrade when online + configured (Ghats/long-haul accuracy),
  // else planTrip() keeps haversine ×1.25 with provenance logged.
  let valhallaDistKm = null, distProv = 'haversine-est';
  try {
    const vd = await fetchValhallaDistKm(SEL.from, SEL.to);
    if (vd.distKm) { valhallaDistKm = vd.distKm; distProv = vd.provenance; }
  } catch {}
  const plan = planTrip({ from: SEL.from, to: SEL.to, vehicle: v, stations: compat, socNow, socWant, tempC, cargoKg, speedKph, valhallaDistKm });
  markWizardDone();
  let html = `<h2>Step 3 — Route: ${SEL.from.n} → ${SEL.to.n} · ${plan.distKm} km <span class="muted">(${plan.distProvenance || distProv})</span></h2>`;
  html += `<p>${plan.note}<br><span class="muted">Consumption ${plan.adjKwhPer100} kWh/100km (temp+cargo adjusted) · reserve ${plan.reserve}% · ${plan.safety}</span></p>`;
  if (!plan.stops.length) { html += `<p><b>✅ ${plan.note}</b></p>`; }
  for (const s of plan.stops) {
    const fit = checkPlugFit(v, s.plugs || []);
    const kw = actualKw({ stationKw: s.stationKw, vehicle: v, soc: 20, tempC });
    const sess = sessionMinutesResult({ vehicle: v, curve: v.curve, fromSoc: 20, toSoc: 20 + Math.min(60, (s.kwhToAdd / v.usableKwh) * 100), stationKw: s.stationKw, tempC });
    const mins = sess.mins ?? sess.error;
    html += `<article class="st stop boarding ${s._red ? 'avoid' : ''}">
      <div class="bp-head"><span class="score g${s._grade}">${s._score}<small>${s._grade}</small></span><div><b>${s.leg === 1 ? 'Stop 1' : 'Stop 2'}: ${s.name}</b> ${s._red ? '<span class="tag">RED CARD</span>' : ''}<br><span class="muted">${fit.label} · ${s._queue.level} queue · ${priceBoth(s)}</span></div></div>
      ${s._red ? `<div class="redcard">⛔ Avoid this station — ${((s._failRate || 0) * 100).toFixed(0)}% fail rate last 30d. Routed only because corridor is thin; prefer alternative.</div>` : ''}
      <table><tr><th>kW you'll get</th><th>Mins to add</th><th>Energy</th><th>Queue</th><th>Price</th></tr>
      <tr><td><b>${kw} kW</b> (of ${s.stationKw})</td><td>${mins}${typeof mins === 'number' ? ' min' : ''}</td><td>${s.kwhToAdd} kWh</td><td>${s._queue.level} — ${s._queue.label}</td><td>${priceBoth(s)}</td></tr></table>
      <div class="muted">Provenance: ${s._prov} · ${s._advice}${s._penalties?.length ? ' · Penalties: ' + s._penalties.join('; ') : ''}</div>
      ${stopLocationHTML(s)}
    </article>`;
  }
  // Red-carded corridor alternatives (stations to avoid explicitly)
  const avoided = ST.filter((s) => s._red && !s.swap).slice(0, 3);
  if (avoided.length) html += `<h3>Explicitly avoided on this corridor</h3>` + avoided.map((s) => {
    const m = (s.lat != null && s.lon != null) ? null : null;
    void m;
    return `<div class="redcard">⛔ ${s.name} — ${((s._failRate || 0) * 100).toFixed(0)}% fail (${s._penalties?.[0] || 'low score'})</div>`;
  }).join('');
  // V2H one-liner (full catalog lives on research.html#v2h)
  try {
    const r = v2hPlan({ vehicle: v });
    html += `<p class="hint">V2H: ${r.eligible ? r.plan : r.reason} · <a href="./research.html#v2h">details →</a></p>`;
  } catch {}
  out.innerHTML = html;
}

function markWizardDone() {
  document.querySelectorAll('.wizardsteps li').forEach((li, i) => li.classList.toggle('current', i === 2));
}

function renderStations() {
  const box = $('stationList');
  if (!box) return;
  const v = SEL.vehicle;
  const pf = $('plugFilter')?.value || '', sort = $('sortSel')?.value || 'score';
  const amen = ($('amenFilter')?.value) || '', pay = ($('payFilter')?.value) || '';
  let list = ST.filter((s) => !s.swap);
  if (v) list = list.filter((s) => !checkPlugFit(v, s.plugs || []).hardStop);
  if (pf) list = list.filter((s) => (s.plugs || []).includes(pf));
  // J.D. Power 2026 drivers: amenity + payment + accessibility filters
  if (amen === 'washroom') list = list.filter((s) => (s.amenities || []).includes('washroom') || s.accessibility?.washroom);
  if (amen === 'food') list = list.filter((s) => (s.amenities || []).some((a) => ['food', 'cafe', 'dhaba', 'mall', 'hotel'].includes(a)));
  if (amen === 'lighting') list = list.filter((s) => s.accessibility?.lighting);
  if (amen === 'wheelchair') list = list.filter((s) => s.accessibility?.wheelchair);
  if (pay) list = list.filter((s) => (s.payment || []).includes(pay));
  list = [...list].sort((a, b) => sort === 'power' ? maxKwOf(b) - maxKwOf(a) : b._score - a._score);
  box.innerHTML = list.map((s) => {
    const top = maxKwOf(s);
    const kw = v ? actualKw({ stationKw: top, vehicle: v, soc: 20, tempC: 30 }) : top;
    const payTags = (s.payment || []).map((p) => `<span class="tag">${p}</span>`).join('');
    return `<div class="st ${s._red ? 'red' : ''}">
      <div class="st-head"><span class="score g${s._grade}">${s._score}<small>${s._grade}</small></span><span class="st-name">${s.name}</span>${s._red ? '<span class="tag">RED CARD</span>' : ''}</div>
      <div class="chips">${(s.plugs || []).map((p) => `<span class="tag">${p}</span>`).join('')}<span class="tag">${top}kW max</span><span class="tag">${priceBoth(s)}</span>${v ? `<span class="tag">you get ${kw}kW</span>` : ''}${payTags}</div>
      ${s._red ? `<div class="redcard">⛔ Avoid — ${((s._failRate || 0) * 100).toFixed(0)}% fail last 30d</div>` : ''}
      <div class="prov"><span class="material-symbols-rounded" aria-hidden="true">verified</span><span>Queue ${s._queue.level} · ${s._prov} · ${s._advice}</span></div>
      ${stopLocationHTML(s)}
    </div>`;
  }).join('') || '<p class="muted">No compatible stations — check plug filter (hard-stop logic working as intended).</p>';
}

function updateNet() {
  const dot = $('netDot'), lbl = $('netLabel'), badge = $('pendBadge');
  if (!dot || !lbl) return;
  const online = navigator.onLine;
  dot.className = 'dot' + (online ? ' on' : '');
  lbl.textContent = online ? 'online' : 'OFFLINE — packs active';
  if (badge) { const p = pendingCount(); badge.textContent = p ? `${p} pending` : ''; }
}

boot().catch((e) => { document.body.innerHTML = `<pre style="padding:40px">Boot failed: ${e.message}\nServe over http (python -m http.server), not file://, so JSON loads.</pre>`; });

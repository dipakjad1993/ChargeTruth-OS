/* ChargeTruth OS app wiring — imports all engines, renders all 7 tabs. */
import { loadAll, flattenStations } from './data-loader.js';
import { searchCities, fmtCity } from './gazetteer.js';
import { scoreStation } from './reliability.js';
import { actualKw, sessionMinutes, sessionMinutesResult, powerMatchSummary } from './powermatch.js';
import { initPlugLogic, checkPlugFit } from './pluglogic.js';
import { availability01, physicalFit, swapPlan, swapVsChargeROI } from './swap.js';
import { planTrip, usableRangeKm, fetchValhallaDistKm } from './trip-planner.js';
import { v2hPlan } from './v2h.js';
import { submitReport, pendingCount, syncReports } from './reports.js';
import { buildPack, downloadPack } from './offline-pack.js';
import { siteUrl, isPlaceholderDomain, initAnalytics } from './site-config.js';
import { pilotStats, pilotGate } from './pilot.js';
import { redCardEvalStats } from './enterprise.js';

const $ = (id) => document.getElementById(id);
let DB = null, ST = [], CPO = {}, SEL = { from: null, to: null, vehicle: null };

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
  // vehicle selects
  const opts = DB.vehicles.vehicles.map((v) => `<option value="${v.id}">${v.name} · ${v.maxKwDc}kW DC · ${v.plugDc || v.swap || v.plugAc}</option>`).join('');
  $('vSelect').innerHTML = opts;
  $('swapVSelect').innerHTML = DB.vehicles.vehicles.filter((v) => v.class !== '4W').map((v) => `<option value="${v.id}">${v.name} · ${v.swap || v.plugAc || ''}</option>`).join('');
  $('plugFilter').innerHTML = `<option value="">All compatible with my vehicle</option>` +
    [...new Set(ST.flatMap((s) => s.plugs || []))].map((p) => `<option>${p}</option>`).join('');
  $('repStation').innerHTML = ST.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  $('vSelect').value = 'tata-nexon-ev-45';
  $('swapVSelect').value = 'sun-buddy-2';
  SEL.vehicle = attachCurve(vehById($('vSelect').value));
  $('vCount').textContent = DB.vehicles.vehicles.length;
  bindSearch(); bindTabs(); renderVehicleCard(); renderStations(); renderGarage(''); renderResearch(); renderV2H(); updateNet();
  $('footStats').textContent = `${ST.length} stations (sample pack v2.1: OSM+OCM quarterly + crowd; connect OCPI/NREL keys for live) · ${DB.vehicles.vehicles.length} vehicles · ${DB.cities.cities.length} cities offline`;
  try {
    const merged = await fetch('./packs/merged.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (merged && merged.dupesRemoved != null) {
      $('footStats').textContent += ` · dedupe ${merged.dupesRemoved} removed (${merged.count} kept)`;
    }
  } catch {}
  if (isPlaceholderDomain()) console.warn('[setup] canonical domain is placeholder — set <meta name="ct-site-url"> (see src/js/site-config.js).');
  initAnalytics();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('online', updateNet); window.addEventListener('offline', updateNet);
  window.addEventListener('chargetruth-report', () => { updateNet(); });
}

function bindTabs() {
  const order = ['plan', 'stations', 'swap', 'garage', 'report', 'offline', 'research'];
  const go = (name, focus = false) => {
    document.querySelectorAll('.tabs button, .bottomnav button').forEach((x) => {
      const on = x.dataset.tab === name;
      x.classList.toggle('active', on);
      if (x.classList.contains('tabs') || x.closest('.tabs')) { x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; }
      if (x.closest('.bottomnav')) { if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); }
    });
    document.querySelectorAll('.tab').forEach((x) => {
      const on = x.id === 'tab-' + name;
      x.classList.toggle('active', on);
      if (on) x.removeAttribute('hidden'); else x.setAttribute('hidden', '');
    });
    if (focus) document.querySelector(`.tabs button[data-tab="${name}"]`)?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
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
  $('vSelect').onchange = (e) => { SEL.vehicle = attachCurve(vehById(e.target.value)); renderVehicleCard(); renderStations(); renderV2H(); };
  $('planBtn').onclick = doPlan;
  $('swapBtn').onclick = doSwap;
  $('roiBtn').onclick = doROI;
  $('sortSel').onchange = renderStations; $('plugFilter').onchange = renderStations;
  if ($('amenFilter')) $('amenFilter').onchange = renderStations;
  if ($('payFilter')) $('payFilter').onchange = renderStations;
  $('vSearch').oninput = (e) => renderGarage(e.target.value);
  document.querySelectorAll('[data-rep]').forEach((b) => b.onclick = () => {
    const n = submitReport({ stationId: $('repStation').value, kind: b.dataset.rep, note: $('repNote').value });
    alert(`Saved locally (${b.dataset.rep}). ${n} total reports, ${pendingCount()} pending sync. Station rescores instantly.`);
    location.reload();
  });
  $('syncBtn').onclick = async () => {
    localStorage.setItem('ct-supabase-url', $('sbUrl').value); localStorage.setItem('ct-supabase-key', $('sbKey').value);
    const r = await syncReports();
    $('syncMsg').textContent = r.synced ? `Synced ${r.synced}` : (r.reason || 'Nothing to sync');
    updateNet();
  };
  $('packBtn').onclick = () => {
    const region = $('packRegion').value;
    const pack = buildPack({ name: region, stations: ST, cities: DB.cities.cities.slice(0, 120) });
    downloadPack(pack);
    // Measured honesty: live JSON bytes + z12 tile estimate + 15MB verdict + pilot gate
    const jsonKB = Math.round((JSON.stringify(pack.stations).length / 1024) * 10) / 10;
    const t = pack.tiles?.[0];
    const gate = pilotGate(redCardEvalStats().precision);
    $('packMsg').textContent = `Pack built: ${ST.length} stations, ${jsonKB} KB JSON`
      + (t ? ` + ~${t.tileMB} MB tiles (z12 x${t.tileCount}) = ~${t.totalMBest} MB → ${t.fifteenMBverdict}` : ' (tiles: n/a)')
      + ` · Pilot: ${gate.rows} rows, p50 ${gate.p50HuntApp ?? '—'} min → ${gate.verdict}`;
  };
  $('methodLink').onclick = (e) => { e.preventDefault(); document.querySelector('[data-tab="research"]').click(); };
}

function bindSearch() {
  const wire = (inputId, sugId, key) => {
    const inp = $(inputId), sug = $(sugId);
    inp.oninput = () => {
      const hits = searchCities(DB.cities.cities, inp.value);
      sug.innerHTML = hits.map((c, i) => `<div data-i="${i}">${fmtCity(c)}</div>`).join('');
      sug.querySelectorAll('div').forEach((d) => d.onclick = () => { SEL[key] = hits[+d.dataset.i]; inp.value = fmtCity(SEL[key]); sug.innerHTML = ''; });
    };
  };
  wire('fromQ', 'fromSug', 'from'); wire('toQ', 'toSug', 'to');
  // defaults: Mumbai → Pune
  SEL.from = DB.cities.cities.find((c) => c.n === 'Mumbai'); SEL.to = DB.cities.cities.find((c) => c.n === 'Pune');
  $('fromQ').value = fmtCity(SEL.from); $('toQ').value = fmtCity(SEL.to);
}

function renderVehicleCard() {
  const v = SEL.vehicle;
  const pm = powerMatchSummary({ vehicle: v, stationKw: 120, soc: 20 });
  $('vCard').innerHTML = `<b>${v.name}</b> · ${v.batteryKwh}kWh (${v.usableKwh} usable) · <b>${v.maxKwAc}kW AC / ${v.maxKwDc}kW DC</b> · plugs ${v.plugAc || '—'}/${v.plugDc || '—'}${v.swap ? ` · swap <b>${v.swap}</b>` : ''}${v.v2x ? ' · <span class="tag">V2H ✓</span>' : ''}<br><span class="muted">${v.notes || ''}</span><br><span class="muted">Example: on a 120kW stall you get <b>${pm.youGetKw}kW</b>. ${pm.message}</span>`;
}

async function doPlan() {
  const v = SEL.vehicle;
  const socNow = +$('socNow').value, socWant = +$('socWant').value;
  const tempC = +$('tempC').value, cargoKg = +$('cargoKg').value, speedKph = +$('speedKph').value;
  const hour = +$('hourOf').value;
  if (!SEL.from || !SEL.to) { alert('Pick start + end from the offline gazetteer.'); return; }
  // AC-only guard (safe wrapper — never Infinity in UI)
  if (!v.maxKwDc && !v.swap) {
    const r = sessionMinutesResult({ vehicle: v, curve: v.curve, fromSoc: socNow, toSoc: socWant, stationKw: 50, tempC });
    $('planOut').innerHTML = `<h2>Route output</h2><div class="redcard">⛔ ${r.error}</div>`;
    return;
  }
  // Swap-only guard → swap plan instead
  if (v.swap && !v.plugAc && !v.plugDc) {
    const distKm = 60;
    const sp = swapPlan({ vehicle: v, stations: ST, distanceKm: distKm, hour, networks: DB.swaps.networks });
    $('planOut').innerHTML = `<h2>Swap plan (swap-only vehicle)</h2><p>${sp.message}</p>` + sp.stops.map((s) => `<div class="st"><b>#${s.n} ${s.name}</b> — availability ${s.availPct}% · ${s.mins} min · ₹${s.priceINR}${s.warn ? `<div class="redcard">${s.warn}</div>` : ''}</div>`).join('');
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
  let html = `<h2>Route: ${SEL.from.n} → ${SEL.to.n} · ${plan.distKm} km <span class="muted">(${plan.distProvenance || distProv})</span></h2>`;
  html += `<p>${plan.note}<br><span class="muted">Consumption ${plan.adjKwhPer100} kWh/100km (temp+cargo adjusted) · reserve ${plan.reserve}% · ${plan.safety}</span></p>`;
  if (!plan.stops.length) { html += `<p><b>✅ ${plan.note}</b></p>`; }
  for (const s of plan.stops) {
    const fit = checkPlugFit(v, s.plugs || []);
    const kw = actualKw({ stationKw: s.stationKw, vehicle: v, soc: 20, tempC });
    const sess = sessionMinutesResult({ vehicle: v, curve: v.curve, fromSoc: 20, toSoc: 20 + Math.min(60, (s.kwhToAdd / v.usableKwh) * 100), stationKw: s.stationKw, tempC });
    const mins = sess.mins ?? sess.error;
    html += `<div class="st stop ${s._red ? 'avoid' : ''}">
      <div><span class="score g${s._grade}">${s._score}</span> <b>${s.leg === 1 ? 'Stop 1' : 'Stop 2'}: ${s.name}</b> ${s._red ? '<span class="tag">RED CARD</span>' : ''}</div>
      ${s._red ? `<div class="redcard">⛔ Avoid this station — ${((s._failRate || 0) * 100).toFixed(0)}% fail rate last 30d. Routed only because corridor is thin; prefer alternative.</div>` : ''}
      <table><tr><th>kW you'll get</th><th>Mins to add</th><th>Energy</th><th>Queue</th><th>Price</th></tr>
      <tr><td><b>${kw} kW</b> (of ${s.stationKw})</td><td>${mins}${typeof mins === 'number' ? ' min' : ''}</td><td>${s.kwhToAdd} kWh</td><td>${s._queue.level} — ${s._queue.label}</td><td>${priceBoth(s)}</td></tr></table>
      <div class="muted">Plug: ${fit.label} · Provenance: ${s._prov} · ${s._advice}${s._penalties?.length ? ' · Penalties: ' + s._penalties.join('; ') : ''}</div>
    </div>`;
  }
  // Red-carded corridor alternatives (stations to avoid explicitly)
  const avoided = ST.filter((s) => s._red && !s.swap).slice(0, 3);
  if (avoided.length) html += `<h3>Explicitly avoided on this corridor</h3>` + avoided.map((s) => `<div class="redcard">⛔ ${s.name} — ${((s._failRate || 0) * 100).toFixed(0)}% fail (${s._penalties?.[0] || 'low score'})</div>`).join('');
  $('planOut').innerHTML = html;
  renderV2H();
}

function renderStations() {
  const v = SEL.vehicle;
  const pf = $('plugFilter').value, sort = $('sortSel').value;
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
  $('stationList').innerHTML = list.map((s) => {
    const top = maxKwOf(s);
    const kw = v ? actualKw({ stationKw: top, vehicle: v, soc: 20, tempC: 30 }) : top;
    const payTags = (s.payment || []).map((p) => `<span class="tag">${p}</span>`).join('');
    return `<div class="st ${s._red ? 'red' : ''}">
      <div class="st-head"><span class="score g${s._grade}">${s._score}<small>${s._grade}</small></span><span class="st-name">${s.name}</span>${s._red ? '<span class="tag">RED CARD</span>' : ''}</div>
      <div class="chips">${(s.plugs || []).map((p) => `<span class="tag">${p}</span>`).join('')}<span class="tag">${top}kW max</span><span class="tag">${priceBoth(s)}</span>${v ? `<span class="tag">you get ${kw}kW</span>` : ''}${payTags}</div>
      ${s._red ? `<div class="redcard">⛔ Avoid — ${((s._failRate || 0) * 100).toFixed(0)}% fail last 30d</div>` : ''}
      <div class="prov"><span class="material-symbols-rounded" aria-hidden="true">verified</span><span>Queue ${s._queue.level} · ${s._prov} · ${s._advice}</span></div>
    </div>`;
  }).join('') || '<p class="muted">No compatible stations — check plug filter (hard-stop logic working as intended).</p>';
}

function doSwap() {
  const v = attachCurve(vehById($('swapVSelect').value));
  const km = +$('swapKm').value, hour = +$('hourOf').value || 12;
  const cabins = ST.filter((s) => s.swap);
  const sp = swapPlan({ vehicle: v, stations: cabins, distanceKm: km, hour, networks: DB.swaps.networks });
  let html = `<h3>${sp.network || 'Swap'} — ${km} km</h3>`;
  if (sp.error) html += `<div class="redcard">${sp.error}: ${v.name} is plug-in, use Plan Trip.</div>`;
  else {
    html += `<p><b>${sp.message}</b></p>` + sp.stops.map((s) => `<div class="st"><b>#${s.n} ${s.name}</b> — battery avail ${s.availPct}% · ${s.mins} min · ₹${s.priceINR}${s.warn ? `<div class="redcard">${s.warn}</div>` : ''}</div>`).join('');
    // physical-fit warnings for incompatible cabins nearby
    const bad = cabins.filter((s) => physicalFit(v.swap, s.swap).fit === false).slice(0, 2);
    if (bad.length && v.swap) html += `<p class="muted">Not routed (physical mismatch): ${bad.map((s) => `${s.name} [${s.swap}]`).join('; ')} — app merge ≠ physical interop.</p>`;
  }
  $('swapOut').innerHTML = html;
}

function doROI() {
  const r = swapVsChargeROI({ riderHourly: +$('roiHr').value, swapsPerDay: +$('roiN').value, chargeHoursPerDay: +$('roiH').value });
  $('roiOut').innerHTML = `<table><tr><th></th><th>Swap</th><th>Charge</th></tr><tr><td>Monthly energy ₹</td><td>${r.swapMonth}</td><td>${r.chargeMonth}</td></tr><tr><td>Time saved</td><td colspan="2">${r.timeSavedHrsDay} hrs/day → ₹${r.timeValueMonth}/month</td></tr></table><p><b>${r.verdict}</b></p><p class="muted">Fleet ×500: ${r.fleet500.hrsSavedDay} hrs/day. ${r.fleet500.note}</p>`;
}

function renderGarage(q) {
  q = (q || '').toLowerCase();
  const list = DB.vehicles.vehicles.filter((v) => !q || (v.name + v.id + (v.plugDc || '') + (v.swap || '')).toLowerCase().includes(q));
  $('vTable').innerHTML = `<div class="vrow muted"><b>Model</b><span>DC peak</span><span>Plug / Swap</span><span>Battery</span></div>` +
    list.map((v) => `<div class="vrow"><b>${v.name}</b><span>${v.maxKwDc}kW</span><span>${v.plugDc || v.swap || v.plugAc}</span><span>${v.batteryKwh}kWh</span></div>`).join('');
}

function renderResearch() {
  $('researchOut').innerHTML = `<table><tr><th>Claim</th><th>Source</th><th>Confidence</th></tr>` +
    DB.research.stats.map((s) => `<tr><td>${s.claim}</td><td>${s.source}</td><td>${s.confidence}</td></tr>`).join('') + `</table>
    <p class="hint">Honesty contract: vendor stats are directional; quarterly re-verification required (see VERIFICATION.md). Fleet time-saving is modeled — pilot before promising.</p>
    <p class="muted">SEO long-tails covered: ${DB.research.seoLongTails.slice(0, 8).join(' · ')}… (full list in data/research.json)</p>`;
  const t = DB.research.costOfGoogleTax;
  $('taxOut').innerHTML = `<p>Places Autocomplete $${t.placesAutocompletePer1000}/1k · Directions $${t.directionsPer1000}/1k · Maps JS $${t.mapsJsLoadPer1000}/1k → <b>${t.scenario10kUsers}</b></p><p class="muted">ChargeTruth: local gazetteer + Valhalla + cached OSM tiles = $0 marginal.</p>`;
}

function renderV2H() {
  const v = SEL.vehicle;
  if (!v) return;
  const r = v2hPlan({ vehicle: v });
  $('v2hOut').innerHTML = r.eligible ? `<p>${r.plan}</p><p class="muted">${r.warnings.join(' · ')}</p>` : `<p class="muted">${r.reason}</p>`;
}

function updateNet() {
  const on = navigator.onLine;
  $('netDot').className = 'dot' + (on ? ' on' : '');
  $('netLabel').textContent = on ? 'online' : 'OFFLINE — packs active';
  const p = pendingCount();
  $('pendBadge').textContent = p ? `${p} pending` : '';
}

boot().catch((e) => { document.body.innerHTML = `<pre style="padding:40px">Boot failed: ${e.message}\nServe over http (python -m http.server), not file://, so JSON loads.</pre>`; });

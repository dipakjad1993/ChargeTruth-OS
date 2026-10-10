import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStation } from '../src/js/reliability.js';
import { actualKw, sessionMinutes } from '../src/js/powermatch.js';
import { checkPlugFit, initPlugLogic } from '../src/js/pluglogic.js';
import { physicalFit, swapVsChargeROI } from '../src/js/swap.js';
import { planTrip, usableRangeKm } from '../src/js/trip-planner.js';
import plugs from '../data/plugs.json' with { type: 'json' };

initPlugLogic(plugs);

test('red card fires at 34% fail rate', () => {
  const r = scoreStation({ properties: { stalls: 2, reports30d: { ok: 20, fail: 11, queue: 2 } } }, 0.8);
  assert.equal(r.redCard, true);
  assert.ok(r.score < 70, `got ${r.score}`);
});

test('8-stall Assure outscores identical 1-stall', () => {
  const rep = { ok: 40, fail: 5, queue: 3 };
  const big = scoreStation({ properties: { stalls: 8, assure: true, reports30d: rep } }, 0.9);
  const small = scoreStation({ properties: { stalls: 1, reports30d: rep } }, 0.9);
  assert.ok(big.score > small.score + 5, `big ${big.score} vs small ${small.score}`);
});

test('Tiago gets 25kW from 350kW stall, not 350', () => {
  const tiago = { name: 'Tiago', maxKwDc: 25, curve: { points: [[10, 25], [80, 15]] } };
  const kw = actualKw({ stationKw: 350, vehicle: tiago, soc: 20 });
  assert.ok(kw <= 25 && kw > 20, `got ${kw}`); // taper curve, never exceeds 25 peak
});

test('Ioniq5 uses 350kW stall meaningfully', () => {
  const ioniq = { name: 'Ioniq5', maxKwDc: 233, curve: { points: [[10, 230], [50, 230], [80, 110]] } };
  const kw = actualKw({ stationKw: 350, vehicle: ioniq, soc: 20 });
  assert.ok(kw > 200);
});

test('10-80% session sane for Nexon 60kW', () => {
  const nexon = { name: 'Nexon', maxKwDc: 60, usableKwh: 43, curve: { points: [[10, 60], [60, 42], [80, 25]] } };
  const m = sessionMinutes({ vehicle: nexon, curve: nexon.curve, fromSoc: 10, toSoc: 80, stationKw: 60 });
  assert.ok(m > 30 && m < 90, `got ${m}`);
});

test('NACS car at CCS1 stall needs adapter, CCS2 car hard-stops', () => {
  const nacs = { plugDc: 'NACS', plugAc: 'NACS' };
  const ccs2 = { plugDc: 'CCS2', plugAc: 'Type2' };
  assert.equal(checkPlugFit(nacs, ['CCS1']).status, 'adapter');
  assert.equal(checkPlugFit(ccs2, ['CCS1']).hardStop, true);
});

test('Bharat DC-001 cannot charge CCS2 car', () => {
  const nexon = { plugDc: 'CCS2', plugAc: 'Type2' };
  assert.equal(checkPlugFit(nexon, ['BharatDC001']).hardStop, true);
});

test('Sun pack does not fit Gogoro cabin', () => {
  assert.equal(physicalFit('SunMobility', 'Gogoro').fit, false);
});

test('swap ROI positive for fleets', () => {
  const r = swapVsChargeROI({ riderHourly: 150, swapsPerDay: 3, chargeHoursPerDay: 3 });
  assert.ok(r.netBenefitINR > 0);
  assert.equal(r.fleet500.hrsSavedDay > 100, true);
});

test('planner returns ≤2 stops with reserve', () => {
  const v = { name: 'Nexon', usableKwh: 43, effKwhPer100km: 15.5, maxKwDc: 60, plugDc: 'CCS2', curve: { points: [[10, 60]] } };
  const sts = [{ id: 'a', name: 'A', lat: 18.9, lon: 73.2, maxKw: [60], plugs: ['CCS2'], _score: 80 }, { id: 'b', name: 'B', lat: 18.7, lon: 73.5, maxKw: [60], plugs: ['CCS2'], _score: 75 }];
  const p = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 18.52, lon: 73.85 }, vehicle: v, stations: sts, socNow: 30, socWant: 30 });
  assert.ok(p.stops.length <= 2);
});

test('winter range < summer range', () => {
  const v = { usableKwh: 75, effKwhPer100km: 17 };
  assert.ok(usableRangeKm({ vehicle: v, socPct: 80, tempC: -10, cargoKg: 0, speedKph: 80 }) < usableRangeKm({ vehicle: v, socPct: 80, tempC: 25, cargoKg: 0, speedKph: 80 }));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualKw, sessionMinutes, sessionMinutesResult } from '../src/js/powermatch.js';

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

test('sessionMinutesResult returns {error} for AC-only Comet (never Infinity)', () => {
  const comet = { name: 'MG Comet', maxKwDc: 0, usableKwh: 16 };
  const legacy = sessionMinutes({ vehicle: comet, curve: null, fromSoc: 20, toSoc: 80, stationKw: 60 });
  assert.equal(legacy, Infinity); // legacy numeric path preserved
  const safe = sessionMinutesResult({ vehicle: comet, curve: null, fromSoc: 20, toSoc: 80, stationKw: 60 });
  assert.equal(safe.mins, null);
  assert.ok(safe.error.includes('AC-ONLY'), safe.error);
});

test('sessionMinutesResult returns {mins} for normal DC session', () => {
  const nexon = { name: 'Nexon', maxKwDc: 60, usableKwh: 43, curve: { points: [[10, 60], [80, 25]] } };
  const r = sessionMinutesResult({ vehicle: nexon, curve: nexon.curve, fromSoc: 10, toSoc: 80, stationKw: 60 });
  assert.ok(r.mins > 30 && r.mins < 90 && !r.error, JSON.stringify(r));
});

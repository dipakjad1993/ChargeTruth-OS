import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTrip, usableRangeKm, fetchValhallaDistKm } from '../src/js/trip-planner.js';

const nexon = { name: 'Nexon', usableKwh: 43, effKwhPer100km: 15.5, maxKwDc: 60, plugDc: 'CCS2', curve: { points: [[10, 60]] } };

test('planner returns ≤2 stops with reserve', () => {
  const sts = [{ id: 'a', name: 'A', lat: 18.9, lon: 73.2, maxKw: [60], plugs: ['CCS2'], _score: 80 }, { id: 'b', name: 'B', lat: 18.7, lon: 73.5, maxKw: [60], plugs: ['CCS2'], _score: 75 }];
  const p = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 18.52, lon: 73.85 }, vehicle: nexon, stations: sts, socNow: 30, socWant: 30 });
  assert.ok(p.stops.length <= 2);
});

test('winter range < summer range', () => {
  const v = { usableKwh: 75, effKwhPer100km: 17 };
  assert.ok(usableRangeKm({ vehicle: v, socPct: 80, tempC: -10, cargoKg: 0, speedKph: 80 }) < usableRangeKm({ vehicle: v, socPct: 80, tempC: 25, cargoKg: 0, speedKph: 80 }));
});

test('winter reserve auto-escalates to 15% below 0C', () => {
  const sts = [];
  const cold = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 19.06, lon: 72.86 }, vehicle: nexon, stations: sts, socNow: 90, socWant: 30, tempC: -5 });
  const warm = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 19.06, lon: 72.86 }, vehicle: nexon, stations: sts, socNow: 90, socWant: 30, tempC: 25 });
  assert.equal(cold.reserve, 15);
  assert.equal(warm.reserve, 10);
});

test('distance provenance logged (haversine-est offline)', () => {
  const sts = [];
  const p = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 18.52, lon: 73.85 }, vehicle: nexon, stations: sts, socNow: 90, socWant: 30 });
  assert.equal(p.distProvenance, 'haversine-est');
  assert.ok(p.note.includes('range') || p.note.includes('haversine'), p.note);
  // force a stop so the haversine-est detail path renders
  const p2 = planTrip({ from: { lat: 19.07, lon: 72.87 }, to: { lat: 18.52, lon: 73.85 }, vehicle: nexon, stations: sts, socNow: 15, socWant: 30 });
  assert.equal(p2.distProvenance, 'haversine-est');
  assert.ok(p2.note.includes('haversine'), p2.note);
});

test('fetchValhallaDistKm falls back offline without URL (never throws)', async () => {
  const r = await fetchValhallaDistKm({ lat: 19.07, lon: 72.87 }, { lat: 18.52, lon: 73.85 }, '');
  assert.equal(r.distKm, null);
  assert.equal(r.provenance, 'haversine-est');
});

import test from 'node:test';
import assert from 'node:assert/strict';

// pilot.js is browser-localStorage based; stub storage for node
const store = {};
global.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
const { pilotImport, pilotStats, pilotGate, PILOT_PROTOCOL } = await import('../src/js/pilot.js');

test('pilot gate blocks empty pilot (no fake 208h)', () => {
  const g = pilotGate(null);
  assert.equal(g.pass, false);
  assert.match(g.verdict, /BLOCKED/);
});

test('pilot gate passes with 20 riders x 14 days + p50 <10', () => {
  const rows = [];
  for (let r = 1; r <= 20; r++) for (let d = 1; d <= 14; d++) {
    rows.push({ rider_id: 'r' + r, date: '2026-10-' + String(d).padStart(2, '0'), hunt_min_baseline: 35, hunt_min_app: 8, swaps: 3, kwh: 6, station: 'sun-1' });
  }
  const imp = pilotImport(rows);
  assert.equal(imp.imported, 280);
  const s = pilotStats();
  assert.equal(s.riders, 20);
  assert.ok(s.p50HuntApp < PILOT_PROTOCOL.gateP50HuntMin);
  const g = pilotGate(0.8);
  assert.equal(g.pass, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreStation, decayedCounts, wilsonInterval, fraudAdjustedReports,
  connectorPenalty, ledgerHash, provenanceHash, HALF_LIFE_DAYS
} from '../src/js/reliability.js';

const DAY = 86400000;
const NOW = Date.now();

test('red card fires at 34% fail rate', () => {
  const r = scoreStation({ properties: { stalls: 2, reports30d: { ok: 20, fail: 11, queue: 2 } } }, 0.8);
  assert.equal(r.redCard, true);
  assert.ok(r.score < 70, `got ${r.score}`);
});

test('EA Dearborn borderline 29.7% now red-cards (v2.1 28% threshold)', () => {
  const r = scoreStation({ properties: { stalls: 6, reports30d: { ok: 90, fail: 38, queue: 25 } } }, 0.78);
  assert.equal(r.redCard, true);
  assert.ok(r.penalties.some((p) => p.includes('28') || p.includes('High raw fail')), JSON.stringify(r.penalties));
});

test('queue-escalated red card: 25%+ fail + HIGH queue', () => {
  const r = scoreStation({ properties: { stalls: 2, reports30d: { ok: 72, fail: 28, queue: 40 } } }, 0.8);
  assert.equal(r.redCard, true);
});

test('8-stall Assure outscores identical 1-stall', () => {
  const rep = { ok: 40, fail: 5, queue: 3 };
  const big = scoreStation({ properties: { stalls: 8, assure: true, reports30d: rep } }, 0.9);
  const small = scoreStation({ properties: { stalls: 1, reports30d: rep } }, 0.9);
  assert.ok(big.score > small.score + 5, `big ${big.score} vs small ${small.score}`);
});

test('29-day-old fail decays to ~13% weight (hl=10d)', () => {
  const d = decayedCounts([
    { kind: 'fail', ts: NOW - 29 * DAY },
    { kind: 'fail', ts: NOW }
  ], NOW);
  const expected = Math.pow(0.5, 29 / HALF_LIFE_DAYS);
  assert.ok(Math.abs(d.fail - (1 + expected)) < 0.01, `got fail=${d.fail}, expected ${1 + expected}`);
  assert.ok(expected > 0.12 && expected < 0.14, `half-life math drift: ${expected}`);
});

test('Wilson interval: n=5 wide, n=100 narrow', () => {
  const thin = wilsonInterval(3, 2); // n=5
  const thick = wilsonInterval(60, 40); // n=100, same 60%
  assert.ok((thin.upper - thin.lower) > (thick.upper - thick.lower), `thin ${thin.upper - thin.lower} vs thick ${thick.upper - thick.lower}`);
  assert.ok(thick.lower > 0.4 && thick.upper < 0.75, JSON.stringify(thick));
});

test('burst reports trigger spamFlag + down-weight', () => {
  const adj = fraudAdjustedReports({ ok: 20, fail: 5 }, { deviceCounts: { 'd-abc': 12 }, burstFactor: 0.4 });
  assert.equal(adj.spamFlag, true);
  assert.ok(adj.trust < 0.7, `trust ${adj.trust}`);
  assert.ok(adj.ok < 20 && adj.fail < 5);
});

test('worst-connector penalty fires on failing dispenser', () => {
  const p = connectorPenalty([{ plug: 'CCS1', ok: 40, fail: 28 }, { plug: 'NACS', ok: 50, fail: 2 }]);
  assert.equal(p.worst, 'CCS1');
  assert.equal(p.penalty, 0.08);
  const clean = connectorPenalty([{ plug: 'NACS', ok: 50, fail: 2 }]);
  assert.equal(clean.penalty, 0);
});

test('ledgerHash is provenanceHash alias (backward-compat)', () => {
  assert.equal(ledgerHash({ a: 1 }), provenanceHash({ a: 1 }));
});

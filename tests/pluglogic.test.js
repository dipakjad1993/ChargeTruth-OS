import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlugFit, initPlugLogic } from '../src/js/pluglogic.js';
import plugs from '../data/plugs.json' with { type: 'json' };

initPlugLogic(plugs);

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

test('exact match wins: CCS1 car native at CCS1, hard-stop at CCS2-only', () => {
  const ccs1 = { plugDc: 'CCS1', plugAc: 'J1772' };
  assert.equal(checkPlugFit(ccs1, ['CCS1']).status, 'native');
  assert.equal(checkPlugFit(ccs1, ['CCS2']).hardStop, true);
});

test('swap-only vehicle routes to cabins, not chargers', () => {
  const buddy = { plugDc: null, plugAc: null, swap: 'SunMobility' };
  const r = checkPlugFit(buddy, ['CCS2']);
  assert.equal(r.status, 'swap-only');
  assert.equal(r.hardStop, false);
});

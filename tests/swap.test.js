import { test } from 'node:test';
import assert from 'node:assert/strict';
import { physicalFit, swapVsChargeROI, availability01 } from '../src/js/swap.js';

test('Sun pack does not fit Gogoro cabin', () => {
  assert.equal(physicalFit('SunMobility', 'Gogoro').fit, false);
});

test('NIO+Geely merge is app-only, not physical (Sept 2026)', () => {
  const r = physicalFit('NIO-Power', 'Geely-Yiyi');
  assert.equal(r.fit, 'app-only');
  assert.ok(r.reason.includes('+5 min') || r.reason.includes('separate'), r.reason);
});

test('native swap fit passes', () => {
  assert.equal(physicalFit('SunMobility', 'SunMobility').fit, true);
});

test('swap ROI positive for fleets', () => {
  const r = swapVsChargeROI({ riderHourly: 150, swapsPerDay: 3, chargeHoursPerDay: 3 });
  assert.ok(r.netBenefitINR > 0);
  assert.equal(r.fleet500.hrsSavedDay > 100, true);
});

test('rush-hour availability derates Sun at lunch', () => {
  const st = { docks: 6, reports30d: { ok: 300, fail: 10 }, swap: 'SunMobility' };
  const lunch = availability01(st, 12.5, null);
  const night = availability01(st, 3, null);
  assert.ok(lunch < night, `lunch ${lunch} vs night ${night}`);
});

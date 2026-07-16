import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSyncIntervalSeconds } from '../lib/sync-interval.js';

// LOCAL_MIRROR_SYNC_INTERVAL: the background auto-refresh cadence in SECONDS. Default 300 (5 min,
// the decision recorded in the auto-refresh study, Q2); 0 disables the scheduler entirely (escape
// hatch). A malformed value must never crash the boot — it falls back to the safe default.
const DEFAULT = 300;

test('an unset interval falls back to the 5-minute default', () => {
  assert.equal(resolveSyncIntervalSeconds(undefined), DEFAULT);
  assert.equal(resolveSyncIntervalSeconds(''), DEFAULT);
  assert.equal(resolveSyncIntervalSeconds('   '), DEFAULT);
});

test('"0" disables the scheduler (escape hatch)', () => {
  assert.equal(resolveSyncIntervalSeconds('0'), 0);
});

test('a positive integer number of seconds is taken as-is', () => {
  assert.equal(resolveSyncIntervalSeconds('60'), 60);
  assert.equal(resolveSyncIntervalSeconds(' 900 '), 900); // surrounding whitespace tolerated
});

test('a malformed value falls back to the default rather than crashing the boot', () => {
  assert.equal(resolveSyncIntervalSeconds('abc'), DEFAULT);
  assert.equal(resolveSyncIntervalSeconds('-5'), DEFAULT); // negative is nonsense
  assert.equal(resolveSyncIntervalSeconds('1.5'), DEFAULT); // fractional seconds rejected
});

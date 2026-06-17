import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemClock } from '../adapters/system-clock.js';

test('SystemClock.now returns the current Date', () => {
  const before = Date.now();
  const now = new SystemClock().now();
  assert.ok(now instanceof Date);
  assert.ok(now.getTime() >= before);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Placeholder test — proves the package's toolchain is wired (tsx loader + node:test
// runner + tsc). Replaced by the first real acceptance test in Step 1.
test('toolchain is wired: tsx + node:test run a TypeScript test', () => {
  const wired: boolean = true;
  assert.equal(wired, true);
});

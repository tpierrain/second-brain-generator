import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '../lib/content-hash.js';

// Leaf lib (classic TDD). The state sidecar stores a hash of the PRODUCED markdown so a
// second sync with no upstream change rewrites nothing (PRD §10). The hash must be stable
// (same input → same digest), discriminating (different input → different digest) and
// self-describing (`sha256:` prefix, as stored in state.json).
test('hashes content into a stable, sha256-prefixed hex digest', () => {
  const hash = contentHash('# Note\n\nbody\n');

  assert.match(hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(hash, contentHash('# Note\n\nbody\n'));
});

test('different content yields a different digest', () => {
  assert.notEqual(contentHash('one\n'), contentHash('two\n'));
});

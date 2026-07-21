import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActiveUniverse, readActiveUniverse } from '../adapters/fs-active-universe.js';

// The per-machine active-universe pointer (ADR 0034) lives at `<brainRoot>/.vault-rag/active-universe`,
// written by the `/switch` skill. `setup_source` reads it to FREEZE a new mirror's universe. The pure
// normalizer is separated from the file I/O so both are unit-testable (a blank/absent pointer is the
// common single-universe case → the default universe, never a crash).

test('resolveActiveUniverse: a named pointer is trimmed of surrounding whitespace/newline', () => {
  assert.equal(resolveActiveUniverse('acme\n'), 'acme');
  assert.equal(resolveActiveUniverse('  blue-team  '), 'blue-team');
});

test('resolveActiveUniverse: a blank, whitespace-only or absent pointer falls back to the default', () => {
  assert.equal(resolveActiveUniverse(''), 'default');
  assert.equal(resolveActiveUniverse('   \n'), 'default');
  assert.equal(resolveActiveUniverse(null), 'default');
});

test('readActiveUniverse: reads and normalizes the pointer file content', () => {
  const universe = readActiveUniverse('/brain/.vault-rag/active-universe', () => 'acme\n');
  assert.equal(universe, 'acme');
});

test('readActiveUniverse: any read error (absent/unreadable pointer) falls back to the default', () => {
  const universe = readActiveUniverse('/brain/.vault-rag/active-universe', () => {
    throw new Error('ENOENT: no such file');
  });
  assert.equal(universe, 'default');
});

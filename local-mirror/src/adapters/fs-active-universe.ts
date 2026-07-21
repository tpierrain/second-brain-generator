// Driven adapter: reads the per-machine active-universe pointer (ADR 0034), written by the
// `/switch` skill at `<brainRoot>/.vault-rag/active-universe`. Used ONLY by `setup_source` to
// freeze a new mirror's universe — never on the hot sync path.
//
// The pure normalizer (`resolveActiveUniverse`) is split from the file I/O so both are unit-
// testable, and any read failure degrades to the default universe rather than breaking a setup:
// a single-universe brain has no pointer file at all, which is the common, healthy case.

import { readFileSync } from 'node:fs';
import { DEFAULT_UNIVERSE } from '../lib/universe.js';

/** Pure: normalize a raw pointer content. Trimmed; blank/whitespace/absent → the default universe. */
export function resolveActiveUniverse(raw: string | null): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : DEFAULT_UNIVERSE;
}

/**
 * Read + normalize the active-universe pointer. `read` is injectable for tests; any error
 * (absent/unreadable pointer) falls back to the default universe — never throws to the caller.
 */
export function readActiveUniverse(
  pointerPath: string,
  read: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): string {
  try {
    return resolveActiveUniverse(read(pointerPath));
  } catch {
    return DEFAULT_UNIVERSE;
  }
}

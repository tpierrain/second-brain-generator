// Mutation audit — rag/src/lib (TS/ESM, runs via tsx).
// Command runner (no native node:test runner in StrykerJS) + inPlace: mutates the
// real source files and restores them after (git-tracked → trivially recoverable).
// Faithful scope (Thomas, 2026-06-23): every mutant re-runs the WHOLE rag suite, so
// a mutant killed only by an integration test is correctly counted (no false survivors).
// See ../plans/prospective/mutation-testing-stryker.md (Step 2).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Run from the REPO ROOT (cwd) — Stryker only mutates files under its project
  // root, and inPlace needs the real source tree. Invoke via package.json scripts.
  testRunner: 'command',
  commandRunner: {
    command: 'cd rag && node --import tsx --test src/lib/*.test.ts',
  },
  // Exclude fake-embedder.ts: a deterministic test double for the Embedder port
  // (imported only by its own test, never wired into a production path). Mutating a
  // test helper measures the wrong thing — it drags the honest signal, not the score.
  mutate: ['rag/src/lib/*.ts', '!rag/src/lib/*.test.ts', '!rag/src/lib/fake-embedder.ts'],
  inPlace: true,
  coverageAnalysis: 'off',
  // Tuned like the scripts config: the command runner re-runs the WHOLE rag suite per
  // mutant, so Stryker's default 13 runners over-subscribe the CPU and inflate genuine
  // kills into FALSE timeouts (embedder scored a bogus 100% at defaults — 98/111 timed
  // out — vs an honest 81.98% here). Fewer runners + a generous timeout keep timeouts
  // meaning "real infinite loop", not "starved runner". See RESULTS.md gotchas.
  concurrency: 4,
  timeoutMS: 30000,
  timeoutFactor: 4,
  tempDirName: 'maintainers/mutation/.stryker-tmp',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'maintainers/mutation/reports/mutation-rag.html' },
  thresholds: { high: 80, low: 60, break: null },
};

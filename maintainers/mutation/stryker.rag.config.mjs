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
  mutate: ['rag/src/lib/*.ts', '!rag/src/lib/*.test.ts'],
  inPlace: true,
  coverageAnalysis: 'off',
  tempDirName: 'maintainers/mutation/.stryker-tmp',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'maintainers/mutation/reports/mutation-rag.html' },
  thresholds: { high: 80, low: 60, break: null },
};

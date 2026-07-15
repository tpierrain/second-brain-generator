// Mutation audit — local-mirror/src (TS/ESM, runs via tsx).
// Run from the REPO ROOT (cwd). Command runner + inPlace, faithful scope: every
// mutant re-runs the WHOLE local-mirror suite. See ../plans/prospective/mutation-testing-stryker.md.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'command',
  commandRunner: {
    command: 'cd local-mirror && node --import tsx --test src/**/*.test.ts',
  },
  // Prod code only: exclude *.test.ts and the test Builder under src/test/.
  mutate: ['local-mirror/src/**/*.ts', '!local-mirror/src/**/*.test.ts', '!local-mirror/src/test/**'],
  inPlace: true,
  coverageAnalysis: 'off',
  // Same tuning as stryker.rag.config.mjs: the command runner re-runs the WHOLE
  // local-mirror suite per mutant, so Stryker's default 13 runners over-subscribe the
  // CPU and inflate genuine kills into FALSE timeouts (server.ts scored a bogus 87.5%
  // with 14/16 "timeouts" at defaults, masking whether the tests truly kill). Fewer
  // runners + a generous timeout keep a timeout meaning "real infinite loop", not
  // "starved runner". See RESULTS.md gotchas.
  concurrency: 4,
  timeoutMS: 30000,
  timeoutFactor: 4,
  tempDirName: 'maintainers/mutation/.stryker-tmp',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'maintainers/mutation/reports/mutation-local-mirror.html' },
  thresholds: { high: 80, low: 60, break: null },
};

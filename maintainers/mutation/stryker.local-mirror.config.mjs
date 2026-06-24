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
  tempDirName: 'maintainers/mutation/.stryker-tmp',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'maintainers/mutation/reports/mutation-local-mirror.html' },
  thresholds: { high: 80, low: 60, break: null },
};

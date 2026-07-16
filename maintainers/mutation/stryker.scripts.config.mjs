// Mutation audit — scripts/** + scripts/lib/** (the harness, plain .mjs, no tsx).
// Run from the REPO ROOT (cwd). Command runner + inPlace, faithful scope: every
// mutant re-runs the WHOLE harness suite (the exact CI command, see ci.yml).
// NOTE: this is the BIGGEST run — 513 tests re-run per mutant. Expect it to be slow.
// See ../plans/prospective/mutation-testing-stryker.md.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'command',
  commandRunner: {
    command: 'node --test "scripts/*.test.mjs" "scripts/lib/*.test.mjs"',
  },
  // Prod harness code only; exclude the *.test.mjs siblings AND __fixtures__/** (test
  // doubles like stub-mcp-server.mjs, spawned only by *.test.mjs). Mutating a fixture
  // measures the wrong thing — same rationale as rag's fake-embedder exclusion.
  mutate: ['scripts/*.mjs', 'scripts/lib/**/*.mjs', '!scripts/**/*.test.mjs', '!scripts/lib/__fixtures__/**'],
  // ⚠️ NOT inPlace for the harness: the suite exercises vault-MUTATING code
  // (clear-example-notes). Under inPlace, a mutant that redirects the delete target
  // ran against the REAL tree and wiped vault/ demo notes (run #2). Stryker's default
  // SANDBOX copies the project, so any deletion hits the COPY — real vault stays safe.
  // (Run from repo root, the sandbox includes engine-manifest.json + symlinked
  // node_modules, so the rag-from-rag/ dry-run failure does not apply here.)
  inPlace: false,
  coverageAnalysis: 'off',
  // The 513-test suite is re-run PER mutant. With Stryker's default 13 concurrent
  // runners, all of them re-run the full suite at once → CPU oversubscription makes
  // each run balloon past the default ~7s timeout → mass FALSE timeouts (run #1 had
  // 3564/3735 bogus timeouts → fake 99.97% score). Fix: fewer concurrent runners +
  // a generous timeout so only GENUINE infinite-loop mutants time out.
  concurrency: 5,
  timeoutMS: 30000,
  timeoutFactor: 4,
  tempDirName: 'maintainers/mutation/.stryker-tmp',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'maintainers/mutation/reports/mutation-scripts.html' },
  thresholds: { high: 80, low: 60, break: null },
};

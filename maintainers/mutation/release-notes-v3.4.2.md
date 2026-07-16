## The One Where the Survivors Run Out of Places to Hide

[![Mutation tested with Stryker](https://img.shields.io/badge/mutation%20tested-Stryker-e74c24?style=flat-square&logo=stryker&logoColor=white)](https://github.com/tpierrain/second-brain-generator/tree/main/maintainers/mutation)

A **test-quality release**: no change to how your second brain behaves, only stronger proof that its
safety net actually holds. Following up on v3.4.1's mutation campaign, this release corners the last
places a fake bug could still slip past the engine's tests, and adds a nightly job so that net can
never quietly rot.

> 💡 **What's a "mutant"? In plain words (no tech needed).** To trust your second brain, we don't only
> run its tests, we check the tests are actually *worth* running. A tool deliberately slips tiny fake
> bugs ("mutants") into the code, then reruns the tests. A good test *catches* the fake bug; one that
> slips through reveals a test that wasn't really checking anything. A higher "mutation score" means
> the tests caught more of the fake bugs. This release pushes the engine's score past **90 %**.

### Hardened (test quality)

- **Mutation scores pinned at this tag (frozen snapshot):** `rag` **90.42 %** (up from 82.59 % at
  v3.4.1), `scripts` **97.27 %**, `local-mirror` **78.69 %**.
- **The engine's weak tier is closed.** Five files that let mutants slip through are now near-airtight:
  `citation-renderer` 45 to **100 %**, `status-report` 79 to **100 %**, `usage-tracker` 56 to **93 %**,
  `health-check` 63 to **92 %**, `reindex-lock` 75 to **95 %**. In every case the tests were asserting
  loose fragments; they now pin the exact output and triangulate the boundaries, so a mutated line
  changes something a test checks.
- **Honest measurement.** Test doubles (the `fake-embedder` helper, the scripts stub fixtures) are no
  longer mutated: they are test scaffolding, not production code, so scoring them was measuring the
  wrong thing. Part of the rag jump is simply that the number is now honest.

### Added (keeps the net from rotting)

- **Nightly mutation run.** A scheduled, informational GitHub workflow re-measures the mutation score
  of the whole engine every night, so a slow drift in test quality surfaces on its own instead of only
  when someone remembers to audit before a release. It never blocks a merge.

### Notes

- Production code is byte-identical to v3.4.1; nothing to reinstall. This release exists to associate
  the improved, honest numbers with the tests that actually earn them (v3.4.1 was tagged before this
  hardening, so its frozen note stays the honest snapshot for that tag).

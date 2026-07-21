# Action plan — harden the harness against cross-cutting-contract blind spots (the universe lesson)

> **Why this plan exists.** Introducing universes (ADR 0034) broke **six** distinct components,
> each caught in *field-verify*, none by our green test suites: `/lint` resolver, `/lint`
> orphan-exclude, `/lint` same-note anchors, `/consolidate` (resolver + capture-zone), `/file-back`
> placement, `/local-mirror` placement. One shared failure mode, one lesson. Owner asked (2026-07-21):
> *why did we let so many side-effects through, and how do we improve the harness?* This plan is the
> answer, scoped to the launcher repo.

## Root cause (the reframe)

Universes were framed as a **soft, additive, invisible-until-opted-in** feature (true for the *data
model*), which created a false impression of a small blast radius. In the **code**, universes changed
the **vault-path contract**: every component that computes or parses a vault-relative path gained a
leading `<universe>/` segment it never accounted for. Three mechanical causes followed:

1. **All fixtures were single-universe (root = the `default` universe).** But `default` is exactly the
   value where the prefix is **absent** — the one case that *cannot* reveal the bug. Our suites
   exercised the only universe value incapable of killing the "ignores the universe segment" mutant.
   (This is the mutation-testing lesson — ≥2 diverse values, feed present *and* absent — but applied one
   layer too low: at assertions, not at fixtures.)
2. **No central vault-path seam.** Each component re-derives path logic (`buildResolver`,
   `isUnderZone`/`startsWith`, `target_dir`, `filedNotePath`, the mirror's write path). Universe-
   awareness therefore had to be re-implemented — and re-forgotten — in N places.
3. **No "consumers audited" gate on a cross-cutting change.** The universes PR never enumerated *who
   parses a vault path*. Each consumer was discovered broken later, in the field.

## Tracking

- [ ] **M1 — Non-default fixture everywhere (the cheap, high-leverage guard).**
  - [ ] Add a convention to `maintainers/CONVENTIONS.md`: any suite that consumes a vault path MUST
        ship a fixture under a **named (non-`default`) universe**, as a twin of the `default` case.
  - [ ] Backfill the twin on the existing universe-path consumers whose suites still only exercise
        `default`: audit `wiki-lint` (`scripts/lib/`), `consolidation-candidates`, `file-back`/`filed-note`,
        `import` stamping. (Local-mirror already has both twins as of PR #43 — use it as the model.)
  - [ ] Cross-link the convention to the mutation-testing assertion rules (same idea, one layer up).
- [ ] **M2 — One vault-path seam (the structural fix; needs an ADR).**
  - [ ] Write **ADR 0035** (`maintainers/decisions/0035-*.md`): a single codec module is THE place that
        maps `(universe, relPath) <-> vaultPath` and answers `isUnderZone(vaultPath, zone)`
        universe-insensitively. Crux + prior-art block + `Scope:` field (per CONVENTIONS conventions).
  - [ ] Decide the seam's home: launcher scripts consume it (`scripts/lib/`), and the TS packages
        (`rag/`, `local-mirror/`) cannot import across package+language — so document the **lock-step**
        contract (like `DEFAULT_UNIVERSE` today) rather than pretend a single shared import.
  - [ ] Route the existing re-derivers through it (resolver, orphan-exclude, capture-zone, file-back,
        mirror). TDD, behaviour-preserving; the M1 twins are the safety net for the refactor.
- [ ] **M3 — Cross-cutting-contract gate (lightweight process).**
  - [ ] Add to `maintainers/CONVENTIONS.md` a PR checklist item: when a change alters the **shape** of a
        value multiple components parse (vault path, frontmatter schema, index record), the PR carries a
        **"Consumers audited"** section listing every consumer + its coverage under the new shape.
  - [ ] State the trigger crisply so it is unambiguous (shape-of-a-parsed-value change, not any change).

## Deliberately deferred (owner did NOT pick — record so we don't relitigate)

- [ ] **Realistic universe vault CI job** (seed ~40 notes under a named universe, run each skill, assert
      no false-positive explosion). Would have gone red on all six bugs at once, but heavier; **not
      selected 2026-07-21**. Revisit if a *seventh* universe blind spot slips through despite M1–M3.

## The COMMENT (how)

- Order: **M1 first** (cheap, immediately prevents recurrence), **M3 next** (pure doc, no code risk),
  **M2 last** (the refactor — safest once M1's twins exist to catch a regression).
- Artifacts in English; ADR follows the repo's ADR conventions (Crux block, prior-art / anti-NIH,
  `Scope:` field). POSIX-at-the-source discipline preserved (Windows CI is the arbiter).
- Not urgent / not release-blocking: this hardens *future* cross-cutting changes; it does not gate the
  current release (PR #43). Pick it up after the release is cut.

> Links: ADR 0034 (universes), `post-v3.1.0-ux-backlog.md` (where the six bugs were logged + fixed),
> the mutation-testing assertion rules (skill `tdd-discipline`), and the convention memories
> [[cross-platform-ci-is-the-arbiter]] / [[validate-shipped-not-test-instance]].

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE (2026-06-21) — deferred OUT of the v3.3.0 ship gate    -->
<!-- by Thomas. A test-quality investment, not a release blocker.                  -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Mutation testing (Stryker) on the engine's new/changed code

## Why (the WHAT)

One root cause of the "everything you ship feels degraded" episode was that **test quality was
never objectified** — we asserted the tests were good instead of measuring it (cf.
`degraded-quality-root-causes-context-loss-and-test-quality`). Mutation testing flips that: it
mutates the production code and checks the suite actually catches the mutation. Surviving mutants =
gaps to harden.

## Scope (when picked up)

- [ ] Wire **Stryker** (or an equivalent JS/TS mutation runner) on the engine packages:
  `scripts/**` (harness), `rag/src/**`, `local-mirror/src/**`.
- [ ] Run on the v3.3.0 new/changed code first — the restart-nudge chain (A1/A2/A6/A7), the
  reconcile/converge path, the B5 citation belt — and on the future engine-managed block when built.
- [ ] Kill surviving mutants by adding the missing assertions; record the mutation score as the
  durable test-quality signal.
- [ ] Decide a sustainable cadence (one-off audit vs CI gate) — there is **no CI** today, so likely a
  periodic local audit, not a per-commit gate.

## Why deferred (not gating)

v3.3.0 ships its real hero — engine fixes reaching already-installed brains — with full suites green
(harness 492 ✔, rag 209 ✔, tsc clean). Mutation testing **raises confidence in the tests**; it does
not change shippable behavior. Thomas QAs the released version on prod. So this is a quality
investment to schedule on its own, not under release pressure.

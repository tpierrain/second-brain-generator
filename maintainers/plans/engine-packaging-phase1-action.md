# Engine packaging — Phase 1 action plan (Track A: `update-engine`, opt-in re-pull)

**STATUS: 🚧 IN PROGRESS** on branch `engine-packaging` (PR #10, kept a **draft** —
no merge to `main` before the client demos, ADR 0012 / 0014). Enacts **Phase 1** of
[`engine-packaging-study.md`](engine-packaging-study.md) (Track A), **re-timed to NOW by**
[`ADR 0014`](../decisions/0014-ship-update-engine-before-mass-deployment.md): the updater must ship
**before** the mass deployment, or the first migration on a non-technical user's brain has no carrier.

## ▶ Progress checklist (SOURCE OF TRUTH — resume at the first unchecked box)

> To resume, the maintainer says **"reprends le plan où on en était sur la PR ouverte"** (ADR 0013). The
> agent checks out this branch, reads **this** checklist, and does **the first unchecked `- [ ]` big
> step** (and nothing more — see the Session protocol). Tick the box in the **same commit** that finishes
> the step.

- [x] **Gate** — acceptance/survival test (RED by design until the apply step). End-to-end: a brain at
      engine vA + a launcher source at vB>vA → `update-engine` brings `rag/src` + launchers + engine
      scripts to vB, `npm install`, reindex **iff** the index schema moved, and leaves
      vault/`.env`/`CLAUDE.md`/`.claude/settings.json`/skills **byte-identical**. Verified on **both**
      the `win32` and posix branches (ADR 0015). _(authored 2026-06-14 · PENDING — goes GREEN at Step 4.
      Marked `{ todo }` so the suite stays GREEN, **we only ever commit green** — harness 174 tests, 171
      pass, **fail 0, 3 todo**, exit 0.)_
  - [x] write the acceptance test in `scripts/lib/update-engine.test.mjs` (drives the core), each guard
        flagged `{ todo: "GREEN at Step 4" }`. _(3 guards: posix+win32 schema-moved scenario,
        schema-unchanged scenario; seams injected — no real git/npm/ONNX; self-contained synthetic
        manifest.)_
  - [x] each guard proven fail-first: all 3 fail with `ERR_MODULE_NOT_FOUND` (the absent core), loaded
        lazily per-guard so each bites individually — but reported as **todo, not failures** (green
        suite). At Step 4 the `{ todo }` flags are DROPPED and they become enforcing assertions.
- [x] **Step 1 — Record the engine source + seed provenance at install.** The installer writes, into the
      brain's copied `engine-manifest.json`, a `source: { repo, ref }` (the launcher git URL + the
      tag/commit it was generated from) and fills `provenance` with a **base fingerprint (sha256)** for
      each `merge`-bucket file. v1 reads `source` to know where to pull; `provenance` seeds the future
      3-way (Phase 2) at **no extra cost now**. _(2026-06-14)_
  - [x] pure-Node lib `scripts/lib/engine-source.mjs` (compute source record + provenance map). Unit tests.
        _(TDD baby-steps: `fingerprint` (self-describing sha256), `selectMergeFiles` (manifest globs incl.
        `**` subtrees — user files never matched), `buildProvenance`, `buildSource` (ref = exact tag ›
        branch › commit; no remote → `repo:null`), `enrichManifest` (non-mutating), + I/O orchestrator
        `recordSourceAndProvenance`. 10 tests green.)_
  - [x] wire it into `installer.mjs` (write the enriched manifest into the brain). Tests / smoke.
        _(call before the brain's first commit; git facts read from the launcher ROOT. **Smoke install
        PROVEN end-to-end (exit 0)**: brain manifest got `source` = launcher origin + branch, `provenance`
        = sha256 per merge file (6 skills' SKILL.md, generated `.claude/settings.json`, `CLAUDE.md`, 4
        engine scripts); vault note / `.env` / `rag/src` NEVER fingerprinted. Harness 174 tests, 171
        pass, fail 0, 3 todo — green.)_
- [x] **Step 2 — Resolve + fetch the pinned target ref (cross-platform).** A lib that spawns
      `git clone --depth 1 --branch <ref>` (or fetch) of the recorded repo into a temp dir, then reads the
      **fetched** `engine-manifest.json` → target `engineVersion` vector + `indexSchemaVersion`. Pure Node,
      `process.platform` switch, **win32 + posix** unit-tested (git spawn stubbed). _(2026-06-14)_
  - [x] `scripts/lib/engine-fetch.mjs` + tests (stubbed spawn; temp-dir cleanup). _(TDD baby-steps, 7 tests:
        `buildCloneArgs` (shallow `--depth 1 --branch <ref> --single-branch`), `fetchSource` happy path
        (returns the temp dir, drop-in for the Gate's `fetchSource` seam), failed clone → clear error **+
        orphan temp-dir cleanup**, no recorded repo → actionable error **without spawning git**,
        `readTargetManifest` (fetched manifest → engineVersion vector + `indexSchemaVersion` + regimes), and
        a **posix+win32 parity pair** locking ADR 0015 — git is a real exe on both, so the clone needs **no
        `process.platform` branch** (unlike `npm.cmd` at Step 4); the win32-style temp dir is honoured
        verbatim. Harness 181 tests, 178 pass, fail 0, 3 todo — green.)_
- [x] **Step 3 — Compute the apply-plan from the manifest (the safety core).** From the fetched
      manifest, list exactly: `replace` files to overwrite, `regenerate` launchers to rebuild, and the
      **engine-owned scripts** to replace (the `merge` *scripts* — `auto-commit`/`auto-push`/`status-line`/
      `verify-rag` — **plus `update-engine` itself → self-updating**). **Invariant guard:** the plan
      **never** lists `CLAUDE.md`, `.claude/settings.json`, any `.claude/skills/**`, the vault, or `.env`.
      _(2026-06-14 · single-arg `computeApplyPlan(targetManifest)` — **DECISION VALIDATED with the
      maintainer**: the Phase-1 plan is fully determined by the **target** engine's declared regimes + an
      intrinsic sacred denylist; the local manifest governs the **reindex** decision (Step 5) and the
      Phase-2 3-way (a future, separate merge-planner — base+local+target), not the file-action list, so
      feeding it here would be a dead param. Upgradeability is unaffected: `update-engine` **self-replaces**
      (core + libs in the allowlist), so widening this signature later ships free with the new engine — the
      only forward-frozen contract is the brain's recorded manifest shape, already seeded at Step 1.)_
  - [x] `scripts/lib/engine-apply-plan.mjs` (pure: target manifest → file action list). Tests. _(TDD
        baby-steps: `overwrite` ← `replace`, `regenerate` ← launchers, `replaceScripts` ← `merge` ∩
        `scripts/*.mjs` incl. `update-engine.mjs`; user merge files (CLAUDE.md/settings/skills) excluded.
        **Write-allowlist** by construction (ADR 0003/0012) + a **sacred scrub** as defense-in-depth.)_
  - [x] guard tests: disjointness; **never-touch user files** (random vault/skill/CLAUDE/settings/.env path
        never in the plan, via `planTouches`); self-update entry present; **SAFETY CORE** test — a
        buggy/hostile manifest mis-declaring `CLAUDE.md`/`.env`/`settings.json` as engine-owned is **scrubbed**.
        _(DRY: extracted the one manifest glob dialect into `scripts/lib/glob-match.mjs`, refactored
        `engine-source` onto it, +4 direct tests. Harness 191 tests, 188 pass, fail 0, 3 todo — green.)_
- [ ] **Step 4 — Apply (opt-in, non-destructive).** Execute the plan: overwrite `replace`, regenerate the
      `.sh`+`.cmd` launchers, replace the engine-owned scripts (update-engine script **last**), then
      `npm install` in `rag/`. Everything outside the plan is untouched. Tests assert byte-identity of
      vault/`.env`/`CLAUDE.md`/settings/skills before vs after.
  - [ ] **⚠️ CRITICAL for upgradeability (raised with the maintainer 2026-06-14) — the engine must carry
        its OWN code in the allowlist, or a brain installed by this PR can never be cleanly upgraded.** The
        shipped `engine-manifest.json` currently declares only 4 top-level scripts (`auto-commit`,
        `auto-push`, `status-line`, `verify-rag`); but the `update-engine` machinery lives in
        **`scripts/update-engine.mjs`** (the core) **and `scripts/lib/**`** (`engine-fetch`,
        `engine-apply-plan`, `engine-source`, `glob-match`, + future). If these are not engine-owned in the
        manifest, an upgrade would replace the core but leave its libs stale → incoherent engine. So at this
        step we MUST: (a) **add `scripts/update-engine.mjs` + `scripts/lib/**` to the manifest** as
        Engine-owned (likely `replace`, since they are pure overwrite-on-update, not user-merge); (b) make
        `computeApplyPlan` cover **`scripts/lib/**`** — today `ENGINE_SCRIPT = /^scripts\/[^/]+\.mjs$/` is
        **top-level only**, so a lib listed under `merge` would be missed (covering them via `replace` side-
        steps that; if any engine script needs to live under `merge`, extend the regex/classification); and
        (c) ship the brain copy of these libs at install (verify the installer copies `scripts/lib/**`). Add
        a guard test: every engine `.mjs` the core imports is `planTouches`-true (the engine fully replaces
        itself, libs included).
  - [ ] `scripts/update-engine.mjs` (deterministic core wiring 1→4). Tests + the **Gate goes GREEN here**.
- [ ] **Step 5 — Reindex iff the index schema moved.** Compare the brain's `indexSchemaVersion` to the
      target's; on change → run the **existing confirm→reindex** path (ADR 0007 machinery + the Phase 0
      index schema stamp); else skip. Then update the brain's recorded `engineVersion` + `source.ref` and
      **re-seed `provenance`** for the new `merge` files.
  - [ ] reindex-trigger lib + tests (stale → reindex; fresh → skip).
- [ ] **Step 6 — Brain-side `update-engine` skill (Claude-driven UX) — [ADR 0016](../decisions/0016-update-engine-is-a-skill-not-an-mcp-tool.md).**
      A skill shipped by the installer into the brain that confirms with the user (opt-in, **never** auto),
      calls the core, and reports what changed / whether a reindex ran. Deterministic work stays in the
      `.mjs`; the skill is the thin conversational driver. **Not** a tool on the `vault-rag` MCP server.
  - [ ] add the skill to the launcher's shipped skills + manifest `merge` list; install-copy verified.
- [ ] **Step 7 — Cross-platform parity gate (ADR 0015 §8).** Confirm every launcher/script touched has
      **both** `.sh` and `.cmd`; `win32`-branch unit tests pass; note the periodic real bare-Windows check.
- [ ] **Step 8 (one of the LAST steps) — Document second-brain maintainability for everyone.** Update the
      **project `README.md`** (and `SETUP.md` for the hands-on flow) to explain, in plain language, **how a
      second brain stays maintainable**: that every brain ships a built-in, opt-in `update-engine`; the
      **user journey** (ask → confirm → swap engine + reindex-if-needed → report; or the brain offers it
      thanks to Phase 0 observability); what it touches vs never touches (notes/.env/constitution/settings/
      skills are sacred); and the role of `engine-manifest.json` as the readable map of "what is the
      engine". Reuse the PR's "In plain words" + "user journey" boxes ([ADR 0014](../decisions/0014-ship-update-engine-before-mass-deployment.md), [0016](../decisions/0016-update-engine-is-a-skill-not-an-mcp-tool.md)).
  - [ ] README: a short "Keeping your brain up to date" section (audience = everyone, incl. non-technical).
  - [ ] SETUP: the concrete steps to trigger / accept an engine update.
- [ ] **Definition of done** — STATUS → ✅ with commit SHAs + what was verified (harness `node --test`,
      RAG `npm test`, `tsc --noEmit`), then `git mv` this plan into [`plans/archived/`](archived/), refresh
      the PR body, confirm `SETUP.md`/README reflect the shipped flow (Step 8).

## In essence — what Phase 1 delivers (the *what*)

> **`update-engine` lets an already-installed brain pull a newer Engine from a pinned launcher tag and
> swap in the new engine code, launchers and engine-owned scripts — opt-in, and without ever touching the
> user's notes, `.env`, constitution, settings or custom skills.** It reindexes only if the index format
> changed. It is the **carrier** ADR 0014 says must exist *before* deployment; because it **updates
> itself**, later refinements (the 3-way merge of `CLAUDE.md`/settings in Phase 2, a separate
> `update-skills`) can ride in through it — no brain is ever stranded.

## Decisions settled (2026-06-14, with the maintainer)

- **Source = a git tag/ref of the launcher** recorded in the brain (`source: {repo, ref}`). Self-hosted,
  no registry, honours ADR 0001 (study §7 Q1).
- **v1 scope = Option 1:** `replace` bucket + `regenerate` launchers + engine-owned `merge` *scripts*
  (incl. `update-engine` self-update) + `npm install` + reindex-if-stale. **Does NOT touch** the 3-way
  files (`CLAUDE.md`, `.claude/settings.json`), skills, vault, `.env`. **Seed `provenance`** now so the
  Phase 2 3-way has its base (study §7 Q4).
- **Shared skills = a separate, opt-in `update-skills` later** (3-way, never overwrite) — out of v1 scope
  (study §7 Q5).

## Governing invariant (ADR 0003, kept by 0012/0014)

*Opt-in, non-destructive of local divergences, never reclaims the brain's sovereignty.* Mechanically: a
**write-allowlist driven by `engine-manifest.json`** — never "replace the folder" / `rsync --delete`.
Phase 1 only ever writes files the manifest declares Engine-owned; everything else is untouchable **by
construction** (Step 3's guard tests prove it).

## Session protocol (per ADR 0013)

- **One big step per fresh window** (avoid context rot); **stop and ask** before the next step.
- This is the **single open PR** (#10). The agent self-locates from it (open PR → branch → this checklist
  → first unchecked box). Tick the box in the step's finishing commit; mirror progress in the PR body.
- **TDD, baby-steps** (skill `tdd-discipline`): one failing test at a time, red→green→refactor, no
  test-first batch. **Cross-platform parity (ADR 0015) is part of "green"** — a step isn't done until its
  Windows half is covered.
- **No merge to `main` before the Mon/Tue client demos** (ADR 0012 / 0014). End-of-day: the maintainer
  tests the whole restructuring locally; merge only if green and demo-safe.

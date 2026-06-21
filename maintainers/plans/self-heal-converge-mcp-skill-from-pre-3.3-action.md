<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🟡 IN PROGRESS (diagnosed 2026-06-21) — v3.3.0 SHIP-BLOCKING finding F-B7. Task 1 DONE (RED test a0d7801). Design RESOLVED: b1 (relocate skill to engine-skills/) + derive desired-state from DELIVERED files (no engine-spec). Next = Task 2 (FIX), ready to execute. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# F-B7 — Upgrading from a pre-3.3.0 brain wires the new skill + MCP in **1 update + 1 restart**

## The WHAT (the capability we are fixing)

When a user upgrades a brain that predates v3.3.0 (e.g. a **v3.1.0** brain) with a single
`/update-engine` and then the **one restart they do anyway**, the brain must finish wiring **every**
new engine capability — not just the SessionStart hooks, but the new **`local-mirror` skill** and its
**MCP server** too. Today the hooks converge but the skill + MCP **do not**, so the user is silently
left needing a **second** `/update-engine`. Thomas's standing rule: _"a double update, when it is
indispensable, must be handled by deterministic code — not asked of the user."_ This plan makes the
restart self-heal converge the manifest-sourced capabilities (skill + MCP), closing the gap.

> Discovered live in Part B manual QA (2026-06-21), from a real v3.1.0 rig. This is **ship-blocking**
> for v3.3.0 because `local-mirror` is the headline feature and it does not auto-arrive on upgraders.

## Tracking

- [x] **1 — RED integration test** that reproduces the real non-convergence from a true v3.1.0 brain _(2026-06-21 · a0d7801)_
  - [x] 1a — rewrite `scripts/lib/restart-convergence.test.mjs` to source pass-1 delivery from the **real launcher**, with a genuinely-stale v3.1.0 brain manifest (see "Integration test" below) _(2026-06-21 · a0d7801 — pass-1 copies the 228 launcher files matching the fetched `replace`+`regenerate`; verified the skill + `.mcp.json.template` are NOT among them, the hook template IS)_
  - [x] 1b — confirm it is **RED for the right reason** (skill absent / MCP not wired after self-heal), mark `{ todo }`/skip so the suite stays green at commit (commit-only-green gate) _(2026-06-21 · a0d7801 — main case fails on "local-mirror MCP must be registered"; harness 458 pass / 0 fail / 2 todo, exit 0)_
  - [x] 1c — add the **terminal-stuck-state** assertion: a brain with the 4 hooks already wired but `local-mirror` still missing + stale manifest must STILL converge at the next restart (gating must not rely on the hooks-gap alone — this is exactly the rig's current stuck state) _(2026-06-21 · a0d7801 — fails on "self-heal must detect the skill/MCP gap even when the 4 hooks are already wired"; seeded the coach skill so the ONLY genuine gap is local-mirror, making `healed===true` load-bearing)_
- [x] **2 — FIX (TDD baby-steps, green-only)** — derive desired-state from DELIVERED files (not the frozen manifest); relocate the new skill to a non-sacred staging dir so pass-1 can deliver it _(2026-06-21 · 2a–2j all green, harness 471/471/0 todo)_
  > **Design locked (2026-06-21, see "Design decision D1 — RESOLVED"):** (i) the engine derives its desired-state from the files it ALREADY delivers via `replace` — `settings.json.template` for hooks (works today), `.mcp.json.template` keys for MCP servers, `engine-skills/<name>/` presence for upgrader-bound skills — **NOT** a new `engine-spec.json` (which would be a 2nd source of truth to keep in sync, the very thing b1 avoids for the skill). (ii) the `local-mirror` skill is RELOCATED to `engine-skills/local-mirror/` (b1, single source): the sacred scrub (`.claude/skills/` is stripped from `overwrite`, proven in BOTH current and v3.1.0 `engine-apply-plan.mjs`) makes it IMPOSSIBLE to deliver a skill under `.claude/skills/` via `replace`, so the source must live at a non-sacred path + be install-if-absent'd. This is **intrinsically future-proof** (a future skill/server delivered via `replace` converges on its own) → no engine-spec, no step-7 backstop.
  - [x] 2a — deliver `.mcp.json.template` via `regimes.replace` (pass-1 then lays the local-mirror server def on disk; it is non-sacred so the scrub keeps it) _(2026-06-21)_
  - [x] 2b — RELOCATE the skill (b1): `git mv .claude/skills/local-mirror → engine-skills/local-mirror`; add `engine-skills/**` to `regimes.replace`; REMOVE `.claude/skills/local-mirror/**` from `regimes.merge`. (Accepted consequence: the LAUNCHER itself no longer auto-discovers the local-mirror skill — it now lives as an engine-delivered asset; the skill runs in a brain, not the launcher.) _(2026-06-21)_
  - [x] 2c — new shared helper `scripts/lib/staged-skills.mjs` → `installStagedSkills({ sourceDir, brainDir })`: scan `<sourceDir>/engine-skills/*`, for each `<name>` install-if-absent into `<brainDir>/.claude/skills/<name>/` (copy whole subtree, NEVER overwrite a present dir), return the installed names. Pure I/O, win32-safe (ADR 0015). TDD. _(2026-06-21 · 6/6 green)_
  - [x] 2d — `reconcile-brain.mjs` calls `installStagedSkills` (ALONGSIDE the existing 2.bis merge-skill install-if-absent that still serves coach/sync/import/… for v3.3.0+ auto-finalize); fold the result into the `installedSkills` report _(2026-06-21)_
  - [x] 2e — `reconcile-brain.mjs` MCP reconcile (2.ter): derive `engineServerIds` from the DELIVERED `.mcp.json.template` keys (`Object.keys(templateMcp.mcpServers)`), NOT the frozen `target.engineMcpServers`. (Leave `manifest.engineMcpServers` + `engineModuleRequirements` for the health/version consumers — verify those during apply.) _(2026-06-21 · stale-manifest test 15 proves template-driven)_
  - [x] 2f — `installer.mjs`: after the bulk copy + locale overlay (~line 295), call `installStagedSkills({ sourceDir: TARGET, brainDir: TARGET })` so a FRESH brain gets `.claude/skills/local-mirror/` immediately (the bulk copy only brings `engine-skills/`). `.mcp.json` is generated from the template → local-mirror server already present on fresh install (verified). _(2026-06-21 · dd0e524 — source-level structural guard `installer-staged-skills.test.mjs`, 2 green)_
  - [x] 2g — gate `self-heal-detect.mjs`: take EXPLICIT `wantedSkillDirs` + `wantedServerIds` (drop the in-function manifest read). The wrapper `scripts/session-self-heal.mjs` derives `wantedSkillDirs` = merge-skills(manifest) ∪ staged-skills(scan `engine-skills/`) and `wantedServerIds` = `Object.keys(.mcp.json.template.mcpServers)`. (This is what makes 1c converge despite the satisfied hook gap.) _(2026-06-21 · gate + wrapper seam `readWanted`; 8/8 green)_
  - [x] 2h — make the integration test (`restart-convergence.test.mjs`) pass-1 FAITHFUL: copy via `computeApplyPlan(target)` (scrubbed: overwrite ∪ regenerate ∪ replaceScripts) + `selectEngineFilesToCopy`, NOT raw `matchesAny` (else a `replace`-skill "fix" that the real scrubbed pass-1 would drop could falsely go green). Repoint the 1c desired-state seam to derive from delivered files (drop the `engine-spec.json` fallback). Both cases GREEN; remove the `{ todo }` flag. _(2026-06-21 · 9855f5c — exported `deriveWanted`; both cases green, harness 471/471/0 todo)_
  - [x] 2i — RIPPLE tests: renamed the `local-mirror` MERGE-skill EXAMPLE to `coach` in `engine-apply-plan.test.mjs`, `reconcile-brain.test.mjs`, `update-engine.test.mjs`; `self-heal-detect.test.mjs` now feeds explicit wanted lists (no merge example); repointed `local-mirror-skill.test.mjs` to `engine-skills/local-mirror/SKILL.md`; NEW staging-skill test = `staged-skills.test.mjs` (6 cases: install-if-absent + idempotent + preserve-present + subtree + multi + no-dir). _(2026-06-21 · done across 2c/2d/2g/2a-2b commits)_
  - [x] 2j — full harness + `cd rag && … --test` + `cd local-mirror && … --test` + both `tsc --noEmit` GREEN _(2026-06-21 · scripts 471/471/0 todo · rag 207/207 + tsc 0 · local-mirror 87/87 + tsc 0)_
- [ ] **3 — ADR + docs**
  - [ ] 3a — amend **ADR 0026 in place** (not a new ADR): the engine derives its desired-state from the files it DELIVERS (`settings.json.template` hooks, `.mcp.json.template` server keys, `engine-skills/` skill presence), NEVER the frozen user manifest; a NEW upgrader-bound skill rides in via a non-sacred `engine-skills/` staging dir + install-if-absent (because the sacred scrub forbids delivering skills under `.claude/skills/`). Explicitly note this SUPERSEDES the `engine-spec.json` sketch (no 2nd source of truth to keep synced — same anti-duplication reasoning as b1). Add `- **Scope:**` line.
  - [ ] 3b — update the QA plan `v3.3.0-qa-plan-action.md` (record F-B7 + the fix) and the in-progress memory
- [ ] **4 — RE-VERIFY on the real rig** (the proof that matters)
  - [ ] 4a — reset rig (commands below), run `/update-engine` ONCE in Desktop, restart + resume, confirm `local-mirror` skill + MCP + health note converge **without a 2nd update**
  - [ ] 4b — purge the rig if it mirrored a real Notion zone; `git tag -d v3.3.0` (disposable) before any real release

---

## Root cause (PROVEN on disk, 2026-06-21 — not a hypothesis)

Self-heal reads its **desired-state** from the brain's `engine-manifest.json`:
- `reconcile-brain.mjs:213,218` → `target = manifest` (read from `brainDir/engine-manifest.json`).
- `reconcile-brain.mjs:100` → `engineServerIds = target.engineMcpServers` (which MCP servers to wire).
- `self-heal-detect.mjs` → `computeApplyPlan(manifest).installSkills` (from `manifest.regimes.merge`) +
  `manifest.engineMcpServers` (which skills/servers are "missing").

**That manifest is NEVER refreshed.** `update-engine.mjs:161-172` writes
`{ ...local, engineVersion, indexSchemaVersion, source, provenance }` — it **keeps the old `regimes`
and old `engineMcpServers`**. So the on-disk desired-state is **frozen at the brain's install version**.

Pass-1 from a v3.1.0 brain runs the **old v3.1.0 orchestrator**: it lays down the engine files per the
**fetched v3.3.0** regimes (replace + regenerate) but it predates `installSkills` and the `.mcp.json`
reconcile (both added v3.2.1) and never refreshes the manifest. **Observed disk state after pass-1 on
the real rig:** `rag` code = 1.1.5 ✓, `local-mirror/` module present ✓, but **skill ABSENT**,
`.mcp.json` = `[vault-rag]` only, manifest `engineMcpServers` = `["vault-rag"]`, `regimes.merge` lacks
the skill.

At restart, the `session-status` bootstrap tick fires the reconcile in **self-heal mode**
(`sourceDir === brainDir`). It converges the **hooks** (settings.json gains the 4 hooks) because their
source is `settings.json.template` — a **delivered `replace`-regime FILE**. It does **not** converge
the skill or the MCP because:
- **skill:** `plan.installSkills` from the brain's **stale** `regimes.merge` is empty; and even if it
  were listed, there is **no skill source on disk** to copy (sourceDir === brainDir).
- **MCP:** `target.engineMcpServers` (stale, no `local-mirror`) → nothing added; and
  `.mcp.json.template` is **not** in `regimes.replace`, so the local-mirror server def was never delivered.

**The asymmetry is the whole bug:** file-sourced desired-state (the hook template) converges; manifest-
sourced desired-state (skill + MCP) does not, because the manifest is frozen and the sources aren't delivered.

### Addendum (2026-06-21) — the sacred scrub forbids delivering a skill under `.claude/skills/`

`computeApplyPlan` strips `.claude/skills/` from the `overwrite` bucket (safety core). So even putting the
skill in `regimes.replace` would NOT deliver it — pass-1 scrubs it (proven in the v3.1.0 rig tarball too).
A NEW skill can only reach an upgrader's disk by riding in at a NON-sacred `replace` path. **The FIX is
therefore: deliver desired-state from the files already delivered (template + a non-sacred `engine-skills/`
staging dir), and relocate the skill to that staging dir.** Details in "Design decision D1 — RESOLVED".

### Why the existing unit test lied (`restart-convergence.test.mjs`, pre-fix)

Its `manifest()` (lines 72-86) already declares `engineMcpServers: ["vault-rag","local-mirror"]` AND a
`regimes.merge` that includes `.claude/skills/local-mirror/**`; and it **pre-places** the skill source
(line 98) and a local-mirror-defining `.mcp.json.template` (lines 104-106) on disk. **A real pass-1
from v3.1.0 produces none of these.** The test validated my own staging, not reality — it must be
rewritten to source delivery from the real launcher with a genuinely-stale brain manifest.

---

## Design decision D1 — RESOLVED (2026-06-21, Thomas)

**The blocking discovery:** `computeApplyPlan` **scrubs** `.claude/skills/` from the `overwrite`
bucket (the safety core, ADR 0003/0012: the engine NEVER writes under `.claude/skills/`). Verified
this scrub exists in BOTH the current launcher AND the real v3.1.0 rig tarball
(`/tmp/legacy-brain/scripts/lib/engine-apply-plan.mjs` → `SACRED_TREES = [".claude/skills/", "vault/"]`).
**Consequence:** adding `.claude/skills/local-mirror/**` to `regimes.replace` does NOT deliver the skill —
pass-1 (v3.1.0 AND current) strips it. The "pragmatic" option below was therefore **non-viable** without
punching a hole in the safety core (rejected).

**RESOLVED = b1 (relocate, single source):** ship the skill's canonical source at a NON-sacred delivered
path `engine-skills/local-mirror/` (added to `regimes.replace` → pass-1 copies it, the scrub keeps it
because it is not under `.claude/skills/`), then `install-if-absent` it into `.claude/skills/local-mirror/`.
SINGLE source of truth (b1, chosen over b2's delivered-duplicate to avoid two copies to keep in sync).

**And, decided together (supersedes the `engine-spec.json` sketch):** the engine derives its desired-state
from the files it ALREADY delivers via `replace`, mirroring how the HOOKS already converge
(`settings.json.template` is a delivered file). So:
- hooks ← `settings.json.template` (unchanged, already works);
- MCP servers ← keys of the delivered `.mcp.json.template` (NOT the frozen `manifest.engineMcpServers`);
- upgrader-bound skills ← presence of delivered `engine-skills/<name>/`.

No `engine-spec.json`, no step-7 manifest-refresh backstop: a NEW skill/server delivered via `replace`
converges on its own at the next update/restart — **intrinsically future-proof**, and avoids a 2nd
source of truth to keep in sync (the same anti-duplication reasoning b1 applies to the skill).

---

## Integration test (Task 1) — DONE (a0d7801), faithfulness fix pending in 2h

`scripts/lib/restart-convergence.test.mjs` was rewritten (Task 1, ✅): it sources pass-1 from the REAL
launcher, builds a genuinely-v3.1.0 brain, drives the REAL `runReconcileCli` (self-heal) + `sessionSelfHeal`
(1c), and is RED-for-the-right-reason under `{ todo }` (harness 458 pass / 0 fail / 2 todo).

⚠️ **One faithfulness fix is owed in Task 2h before flipping it green:** the current `simulatePass1FromRealLauncher`
copies via **raw `matchesAny`** against `target.regimes` — but the REAL pass-1 SCRUBS `.claude/skills/`
(proven). Today this changes nothing (the skill is in `merge`, unmatched either way), but a `replace`-skill
"fix" that the real scrubbed pass-1 would DROP could falsely turn the test green. So in 2h, switch the sim to
`computeApplyPlan(target)` (overwrite ∪ regenerate ∪ replaceScripts) + `selectEngineFilesToCopy`, and update
the 1c desired-state seam to derive from delivered files (`.mcp.json.template` keys + `engine-skills/` scan),
dropping the `engine-spec.json` fallback. Then both cases go GREEN and the `{ todo }` flag is removed.

**Helpers (already exported):** `computeApplyPlan` (`engine-apply-plan.mjs`, returns
`{overwrite=replace regime, regenerate, replaceScripts=engine merge scripts, installSkills=merge skill globs}`),
`listFilesRelPosix` (`fs-walk.mjs`), `selectEngineFilesToCopy` (`engine-copy-select.mjs`), `matchesAny`
(`glob-match.mjs`), `runReconcileCli`/`reconcileBrain` (`reconcile-brain.mjs`), `detectSelfHealGap`
(`self-heal-detect.mjs`), `bootstrapSessionHooks` (`hook-bootstrap.mjs`).

## Files to touch (Task 2) — exhaustive

**Relocation (2b):**
- `git mv .claude/skills/local-mirror/` → `engine-skills/local-mirror/` (whole subtree).
- `engine-manifest.json` (launcher) — `regimes.replace` gains `.mcp.json.template` (2a) + `engine-skills/**` (2b);
  `regimes.merge` LOSES `.claude/skills/local-mirror/**` (2b).

**New code (2c–2g):**
- `scripts/lib/staged-skills.mjs` (NEW) + `scripts/lib/staged-skills.test.mjs` (NEW) — `installStagedSkills`.
- `scripts/lib/reconcile-brain.mjs` — call `installStagedSkills` (2d); MCP `engineServerIds` from
  `.mcp.json.template` keys (2e).
- `scripts/lib/self-heal-detect.mjs` — explicit `wantedSkillDirs` + `wantedServerIds` (2g).
- `scripts/session-self-heal.mjs` — wrapper derives wanted skills (merge ∪ staged scan) + wanted servers
  (template keys) (2g).
- `installer.mjs` — call `installStagedSkills({ sourceDir: TARGET, brainDir: TARGET })` after bulk copy +
  locale overlay (~line 295) (2f).

**Tests (2h–2i):**
- `scripts/lib/restart-convergence.test.mjs` — faithful scrubbed pass-1 + 1c file-sourced seam; remove `{ todo }` (2h).
- `scripts/lib/engine-apply-plan.test.mjs`, `scripts/lib/reconcile-brain.test.mjs`,
  `scripts/lib/self-heal-detect.test.mjs`, `scripts/lib/update-engine.test.mjs` — rename the local-mirror
  merge-skill EXAMPLE to `coach`/generic (2i).
- `scripts/lib/local-mirror-skill.test.mjs` — repoint to `engine-skills/local-mirror/SKILL.md` (2i).

**Docs (Task 3):**
- `maintainers/decisions/0026-*.md` — amend in place (3a).
- `maintainers/plans/v3.3.0-qa-plan-action.md` + memory (3b).

**Verify-don't-break (grep during apply):** other consumers of `manifest.engineMcpServers` /
`engineModuleRequirements` (health-probe, status-line, version display) must keep reading the manifest —
only `reconcile-brain` + `self-heal-detect`'s *desired-state* derivation moves to the delivered files.

---

## Rig state + reset (read before Task 4)

- ⚠️ **The rig `~/legacy-brain` is currently in the TERMINAL STUCK state** (post-update-1 + post-restart):
  rag 1.1.5, the **4 hooks wired**, but `local-mirror` skill **ABSENT**, `.mcp.json` = `[vault-rag]`,
  no health note. Next restart is a no-op (bootstrap gates on the now-satisfied hooks-gap; session-self-heal
  reads the stale manifest → no gap). It will **never** converge `local-mirror` without a 2nd update. This
  rig is itself the live proof of the bug — keep it for reference or reset for Task 4.
- **Reset to a fresh v3.1.0:** `rm -rf ~/legacy-brain && tar -xzf ~/legacy-brain.tgz -C ~` (pristine
  tarball ~356 MB, untouched). Then repoint the source so `/update-engine` pulls the current branch code:
  set `engine-manifest.json` `source` to `{ "repo": "/Users/tpierrain/Dev/second-brain-generator", "ref": "v3.3.0" }`.
- ⚠️ **Disposable git tag `v3.3.0`** is moved onto HEAD `9f758d2` (so the rig's update pulls the current
  branch incl. the F-B4 citation fix). It is **NOT** a release tag — `git tag -d v3.3.0` before any real release.
- Branch `v3.3.0-self-converging-brain-and-citations`, HEAD `9f758d2`, working tree clean at handoff.

## Discipline (non-negotiable)

- **TDD baby-steps, green-only commits.** The RED acceptance test is marked `{ todo }`/skip until the
  fix lands; flag removed at the apply step (commit-only-green gate). Artifacts in **English**.
- **Amend ADR 0026 in place**, not a new ADR; carry the `- **Scope:**` field.
- **Mac/Win/Linux parity** is a hard gate (ADR 0015) — exercise the win32 paths at unit level.
- **No push / merge / tag without Thomas's explicit green light.** This is the v3.3.0 ship gate.

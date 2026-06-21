<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🟡 IN PROGRESS (diagnosed 2026-06-21) — v3.3.0 SHIP-BLOCKING finding F-B7. Task 1 DONE (RED test a0d7801); next = Task 2 (FIX). -->
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
- [ ] **2 — FIX (TDD baby-steps, green-only)** — ship the engine's desired-state + the sources self-heal needs as delivered engine-owned files
  - [ ] 2a — deliver `.mcp.json.template` via `regimes.replace` (pass-1 then lays down the local-mirror server def)
  - [ ] 2b — make the `local-mirror` skill present on disk after pass-1 (decide: pragmatic `regimes.replace` for the brand-new skill, OR a staging-dir + install-if-absent that keeps `merge` semantics — see "Design decision D1")
  - [ ] 2c — ship the engine's canonical desired-state as a delivered engine-owned file (`engine-spec.json`, in `regimes.replace`) = `regimes` + `engineMcpServers` + `indexSchemaVersion` + `engineVersion`
  - [ ] 2d — `reconcile-brain.mjs` `runReconcileCli` reads `target` from `engine-spec.json` if present, else falls back to `engine-manifest.json`
  - [ ] 2e — `self-heal-detect.mjs` + `scripts/session-self-heal.mjs` read desired-state (engineMcpServers + regimes→installSkills) from the spec, not the frozen user manifest
  - [ ] 2f — BACKSTOP for v3.3.0+→future: `update-engine.mjs` step 7 (line 161-172) refreshes the on-disk manifest's `engineMcpServers` + `regimes` from `target` AND writes/refreshes `engine-spec.json`
  - [ ] 2g — the RED test goes GREEN; remove the `{ todo }` flag; run the full harness + rag + local-mirror suites + `tsc`
- [ ] **3 — ADR + docs**
  - [ ] 3a — amend **ADR 0026 in place** (not a new ADR): the engine ships its own desired-state spec; self-heal reads the **delivered** spec, never the frozen user manifest; `.mcp.json.template` + the new skill join the delivered (replace) surface. Add `- **Scope:**` line.
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

### Why the existing unit test lied (`restart-convergence.test.mjs`, pre-fix)

Its `manifest()` (lines 72-86) already declares `engineMcpServers: ["vault-rag","local-mirror"]` AND a
`regimes.merge` that includes `.claude/skills/local-mirror/**`; and it **pre-places** the skill source
(line 98) and a local-mirror-defining `.mcp.json.template` (lines 104-106) on disk. **A real pass-1
from v3.1.0 produces none of these.** The test validated my own staging, not reality — it must be
rewritten to source delivery from the real launcher with a genuinely-stale brain manifest.

---

## Design decision D1 (resolve before coding 2b)

Making the `local-mirror` skill present on disk after pass-1:
- **Pragmatic (recommended for v3.3.0):** add `.claude/skills/local-mirror/**` to `regimes.replace`.
  It is a **brand-new** skill — no existing user has customized it — so "preserve user edits" (the
  reason skills live in `merge`) does not yet apply. Aligns with "no over-engineering against an
  unproven risk". Caveat: future updates would overwrite a user's edits to THIS skill.
- **Principled (future hardening):** ship the skill **source** under an engine-owned staging dir
  (delivered via `replace`) and `install-if-absent` from there into `.claude/skills/` — keeps `merge`
  semantics (fresh source on disk + preserve user edits). More machinery; defer unless needed.

Likewise consider whether `engine-spec.json` (2c) is a **new** file or simply the launcher's own
`engine-manifest.json` minus `source`/`provenance` delivered under a new name (it already carries
`regimes` + `engineMcpServers` + versions). Prefer the latter (no second source of truth to maintain).

---

## Integration test (Task 1) — faithful, sourced from the REAL launcher

Rewrite `scripts/lib/restart-convergence.test.mjs`:
1. Resolve `LAUNCHER` = repo root (from `import.meta.url`, up from `scripts/lib/`). Read
   `LAUNCHER/engine-manifest.json` as the fetched **target**.
2. Build a **genuinely v3.1.0** brain in a tmp dir: manifest with `engineMcpServers: ["vault-rag"]`,
   `regimes.merge` **without** the local-mirror skill, `.mcp.json` = `[vault-rag]`,
   `.claude/settings.json` = `session-status` only (+ a user-owned key), **no** skill, **no**
   local-mirror `.mcp.json.template`.
3. **Simulate pass-1 (old code):** copy the launcher's `replace` + `regenerate` regime files into the
   brain via the real `copyInto` (use `listFilesRelPosix` + `matchesAny` against `target.regimes`).
   Do **NOT** install merge skills, do **NOT** reconcile wiring, do **NOT** refresh the brain manifest.
4. Run the **REAL** `runReconcileCli({ argv: ["--brainDir", b, "--sourceDir", b, "--platform", "posix"], seams })`
   (self-heal), stubbing only the heavy I/O seams (`runInstall`/`runReindex`/`regenerateLaunchers`/`countVaultNotes`).
5. **Assert:** `.claude/skills/local-mirror/SKILL.md` exists; `.mcp.json` has `local-mirror` (+ `vault-rag`
   preserved); `settings.json` has the 4 hooks (+ the user key preserved). Then the **2nd tick = no-op**
   (byte-identical settings.json + .mcp.json). Then the **terminal-stuck-state** case (1c).
6. **RED now** (the launcher delivers none of the needed files/spec) → **GREEN** once Task 2 lands.

**Helpers (already exported):** `computeApplyPlan` (`engine-apply-plan.mjs`, returns
`{overwrite=replace regime, regenerate, replaceScripts=engine merge scripts, installSkills=merge skill globs}`),
`listFilesRelPosix` (`fs-walk.mjs`), `selectEngineFilesToCopy` (`engine-copy-select.mjs`), `matchesAny`
(`glob-match.mjs`), `runReconcileCli`/`reconcileBrain` (`reconcile-brain.mjs`), `detectSelfHealGap`
(`self-heal-detect.mjs`), `bootstrapSessionHooks` (`hook-bootstrap.mjs`).

## Files to touch (Task 2)

- `engine-manifest.json` (launcher) — `regimes.replace` gains `.mcp.json.template`,
  `.claude/skills/local-mirror/**` (per D1), and `engine-spec.json`.
- `scripts/lib/reconcile-brain.mjs` — `runReconcileCli` reads target from `engine-spec.json` if present.
- `scripts/lib/self-heal-detect.mjs` + `scripts/session-self-heal.mjs` — desired-state from the spec.
- `scripts/update-engine.mjs` (step 7, line 161-172) — refresh manifest engine fields + write `engine-spec.json`.
- `scripts/lib/restart-convergence.test.mjs` — the faithful integration test (Task 1).
- `maintainers/decisions/0026-*.md` — amend in place (Task 3a).

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

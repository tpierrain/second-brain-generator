# Fix — `update-engine` must deliver engine skills + MCP servers (v3.2.1)

> **Origin:** QA finding #1 (`maintainers/qa/qa-v3.2.0.md`). Proven empirically on a v3.1.0→v3.2.0
> upgraded brain: `update-engine` copies the `local-mirror/` **code** but installs neither the
> **skill** (`.claude/skills/` is a blanket sacred tree) nor the **MCP server**
> (`engineMcpServers` is declared in `engine-manifest.json` but never consumed). Result: anyone who
> **updates** to v3.2.0 does not get the flagship feature; only a **fresh install** does.
>
> **Goal:** an engine update delivers engine-owned skills and registers engine MCP servers, while
> **never** touching the user's custom skills or custom connectors. Ship as **v3.2.1** (also bundles
> the npm vuln patch).
>
> **Branch:** `fix-update-engine-skills-mcp` (off `main`, post-v3.2.0 — no rebase).
> **Discipline:** TDD baby-steps, commit-only-green.

## Tracking

- [x] **Lot 0 — Investigation & design decisions** _(2026-06-19 · branch created; decisions below + ADR 0025)_
- [x] **Lot A — Install engine-declared skills on update** (TDD) _(2026-06-19 · commit pending)_
- [x] **Lot B — Reconcile `.mcp.json` from `engineMcpServers`** (TDD) _(2026-06-19 · commit pending)_
- [x] **Lot C — Self-heal path for already-broken ≤v3.2.0 brains** (doc only, decided in Lot 0) _(2026-06-19)_
- [x] **Lot D — npm vulnerability remediation** (TDD where it touches behavior) _(2026-06-19 · commit pending)_
- [~] **Lot Ship — verify green, `/code-review`, merge, tag v3.2.1, archive, re-run QA §3** _(in progress: suites green + code-review + golden-master QA done; merge/tag pending green light)_

---

## Lot 0 — Investigation & design decisions — ✅ RESOLVED (2026-06-19)

- [x] **Q1 — Where does the apply run from? → the brain's INSTALLED code.** `update-engine.mjs`
      statically imports `computeApplyPlan` from the brain's own `scripts/lib/`; the in-flight comment
      (`update-engine.mjs:127-130`) confirms self-replacement only takes effect on the *next* run (Node
      module caching). The fetched launcher supplies **data** (manifest + files), not logic. ⟹ a logic
      fix governs only brains already running it (v3.2.1 → future). The ≤v3.2.0 cohort **self-heals on
      the subsequent update** (run 1 lays down the new engine code via the `replace` regime; run 2
      executes the new logic). → drives Lot C.
- [x] **Q2 — Engine-skill regime semantics → install-if-ABSENT (additive), never overwrite.**
      `computeApplyPlan` carves the manifest-declared engine-skill paths (`merge` entries matching
      `.claude/skills/<name>/**`) into a new **`installSkills`** bucket; at apply, each declared skill
      dir is installed **only if absent**. An absent skill (e.g. `local-mirror` on an upgrader) has no
      user state to clobber; an already-present engine skill (possibly user-customized, e.g.
      `prepare-1-1`) is left **byte-identical**. Content-refresh of an already-installed engine skill =
      **out of scope** (future Phase 2 3-way, like the other `merge` files).
- [x] **Q3 — MCP server source of truth → the fetched `.mcp.json.template`.** Confirmed it exists at
      launcher root, carries both `vault-rag` + `local-mirror` with the `{{PROJECT_ROOT}}` placeholder,
      and is reachable from the fetched source (the installer already substitutes it,
      `installer.mjs:453`). The update reads it, substitutes `{{PROJECT_ROOT}}` → brain dir, and **adds
      only the missing `engineMcpServers`**. Reuse `connectors-merge.mjs:addServerToMcpJson` as the
      idempotent primitive.
- [x] **Q4 — Safety invariant (asserted by every new test):** _Only skills/servers the manifest
      declares as engine-owned are ever written, and only when ABSENT; everything else under
      `.claude/skills/` (any non-declared/custom skill), every user-added `.mcp.json` server, the vault,
      `.env`, the constitution and settings are untouchable._ The destructive buckets
      (`overwrite`/`regenerate`) stay sacred-scrubbed → only the additive `installSkills` path can ever
      write a skill, and only when none exists.
- [x] **Lot C decision → two-cycle self-heal, doc only** (no extra code; confirmed with Thomas, given a
      tiny reachable cohort). Re-exec-from-fetched **rejected** (doesn't help the current cohort, real
      complexity) — see ADR 0025 "Rejected alternatives".
- [x] **ADR** — [`0025-update-engine-installs-missing-engine-skills-and-servers.md`](../decisions/0025-update-engine-installs-missing-engine-skills-and-servers.md)
      (ACCEPTED 2026-06-19, Scope: *Second brain (runtime)*).

## Lot A — Install engine-declared skills on update

- [x] RED→GREEN: `computeApplyPlan` exposes an `installSkills` bucket = the manifest-declared
      engine-skill paths (`merge` entries matching `.claude/skills/<name>/**`), carved out of the
      blanket skills scrub (`engine-apply-plan.mjs`).
- [x] SAFETY test: a skill mis-declared in `replace`/`regenerate` is still scrubbed — only the additive
      `merge`→`installSkills` path can ever carry a skill; a custom/non-declared skill is never in it.
- [x] RED→GREEN (apply): `updateEngine()` installs a **missing** engine-declared skill from the fetched
      source (install-if-absent at the **skill-dir** level); the gate's SACRED set (incl. the custom
      `zzz-mine` skill) stays byte-identical.
- [x] Triangulation: an **already-present** (user-customized) engine skill is preserved byte-identical
      (never clobbered).
- [x] Refactor; full harness suite green (300/300).
- [ ] Verify empirically on the golden master (grouped with Lot B — single restore cycle).

## Lot B — Reconcile `.mcp.json` from `engineMcpServers`

- [x] RED→GREEN: new pure lib `mcp-reconcile.mjs` — `reconcileMcpServers({brainMcp, templateMcp,
      engineServerIds})` ADDS only the missing engine servers from the (path-substituted) template.
- [x] Tests: a **user-added** server is preserved; re-running is **idempotent** (no duplicate, no diff).
- [x] GREEN (wiring): `update-engine` reads the fetched `.mcp.json.template`, substitutes
      `{{PROJECT_ROOT}}` → brain dir (posix, cf. installer `toPosix`), reconciles the brain's
      `.mcp.json`, writes it back. Gate test proves `local-mirror` registered (cwd = brain dir) +
      `vault-rag` and a user server preserved.
- [x] Refactor; full harness suite green (304/304).
- [ ] Verify empirically on the golden master (grouped with Lot A, run once pre-ship — Lot Ship §QA).

## Lot C — Self-heal for already-broken v3.2.0 brains

- [x] Q1 resolved: apply runs from **installed** code → no automatic one-cycle self-heal possible for
      the existing cohort. **Chosen path: two-cycle self-heal, documented** (no extra code): run 1 lays
      down the new engine logic, run 2 executes it. Tiny reachable cohort → acceptable.
- [x] Documented in the brain-side `update-engine` skill (new edge case + the touches table now lists
      additive skill/MCP install) and in ADR 0025 ("Rejected alternatives" covers re-exec-from-fetched).

## Lot D — npm vulnerability remediation

- [x] `npm audit fix` (non-breaking) in `rag/` → patched **hono** (high) + **protobufjs** (moderate)
      via the lock (4 → 2 vulns); `package.json` untouched by it.
- [x] **js-yaml** DoS (GHSA-h67p-54hq-rp68, all `<=4.1.1`; **no patched 3.x** exists). The plan's
      "downgrade gray-matter" was wrong (it's at `^4.0.3`; `audit fix --force` would drop it to 2.0.1).
      Instead: **`overrides: { js-yaml: ^4.2.0 }`** + js-yaml as a direct dep. The **full RAG suite
      caught** that gray-matter 4.x calls the removed `yaml.safeLoad` → fixed by routing gray-matter's
      YAML through js-yaml 4's safe `load` (`frontmatter-parser.ts`, `GRAY_MATTER_OPTIONS`). The
      pre-existing frontmatter test was the fail-first; green after the engine wiring.
- [x] `npm audit` → **0 vulnerabilities**. RAG suite **178/178**, `tsc` clean.
- [x] Bumped `rag` engine version `1.1.0 → 1.1.1` (`rag/package.json` + `engine-manifest.json`).
- [x] **`local-mirror` carried the same advisories** (mcp-sdk→hono, gray-matter→js-yaml). Same fix:
      audit fix + js-yaml `^4.2.0` override; a js-yaml-4 engine (`parse`+`stringify` via `load`/`dump`)
      in `markdown.ts` (its `stringify` write path is exercised across the acceptance suite), with a
      `parseLocalMirrorMarkdown` reader the round-trip test now uses. `local-mirror` **84/84**, `tsc`
      clean, **0 vulnerabilities**. Bumped `local-mirror` `0.1.0 → 0.1.1`.

## Lot Ship

- [x] All three suites green (harness **305** / rag **178** / local-mirror **84**) + `tsc` clean + **0 vulns**. _(2026-06-19)_
- [x] `/code-review` on the branch; no correctness bugs. Finding **A** (the update summary never
      named the newly-installed engine skill / registered MCP server) fixed in TDD: `updateEngine`
      now returns `installedSkills` + `mcpServersAdded`, `formatReport` names both _(commit `442658e`)_.
      Findings B (minor dup) / C (planTouches oracle, no runtime hole) logged as backlog, not blocking.
- [x] Verified empirically end-to-end on the v3.1.0 golden master (working-tree `updateEngine` logic,
      source = `git archive` snapshot of the branch): `.claude/skills/local-mirror/` installed,
      `.mcp.json` gained `local-mirror` (cwd = brain dir) with `vault-rag` + all custom skills
      preserved byte-identical, manifest advanced to rag 1.1.1 / local-mirror 0.1.1 / ref v3.2.1. _(2026-06-19)_
- [ ] Push, PR, merge to `main` on Thomas's explicit green light.
- [ ] Tag **v3.2.1** + codename; update README `latest` expectation.
- [ ] Archive this plan (`plans/archived/`, ✅ status + proof); tick QA finding #1 + #2 as resolved.
- [ ] Purge / restore the golden master; confirm no confidential data leaked.

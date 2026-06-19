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
- [ ] **Lot A — Install engine-declared skills on update** (TDD)
- [ ] **Lot B — Reconcile `.mcp.json` from `engineMcpServers`** (TDD)
- [ ] **Lot C — Self-heal path for already-broken v3.2.0 brains** (decided in Lot 0)
- [ ] **Lot D — npm vulnerability remediation** (TDD where it touches behavior)
- [ ] **Lot Ship — verify green, `/code-review`, merge, tag v3.2.1, archive, re-run QA §3**

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

- [ ] RED: test — given a manifest declaring `.claude/skills/local-mirror/**` as engine-owned and a
      brain without it, the apply plan **installs** the skill.
- [ ] RED: test — a **user** skill (`.claude/skills/zzz-mine/**`, NOT in the manifest) is **never**
      written/removed (sacred preserved).
- [ ] GREEN: carve the manifest-declared engine-skill paths out of the blanket `SACRED_TREES` scrub
      in `engine-apply-plan.mjs`; route them to the chosen regime (per Q2).
- [ ] Refactor; full `scripts/lib` suite green.
- [ ] Verify empirically on the golden master: after update, `.claude/skills/local-mirror/` exists.

## Lot B — Reconcile `.mcp.json` from `engineMcpServers`

- [ ] RED: test — given a brain `.mcp.json` with only `vault-rag`, reconciling against
      `engineMcpServers: ["vault-rag","local-mirror"]` **adds** `local-mirror` (cwd = brain dir).
- [ ] RED: test — a **user-added** server in `.mcp.json` is **preserved** (never clobbered).
- [ ] RED: test — re-running is **idempotent** (already-present engine server → no duplicate, no diff).
- [ ] GREEN: implement the reconcile step (read fetched `.mcp.json.template`, substitute path, merge
      missing engine servers) and wire it into `update-engine`.
- [ ] Refactor; suite green.
- [ ] Verify empirically on the golden master: after update, `.mcp.json` has `local-mirror`, and the
      conversation routes "wire up a Notion zone" → the **local-mirror** skill (asks the
      mirror-vs-native disambiguation), not `sync-sources`.

## Lot C — Self-heal for already-broken v3.2.0 brains

- [ ] Based on Q1: if apply runs from fetched code → confirm self-heal is automatic (add a test that
      simulates the broken→fixed transition). If it runs from installed code → implement a one-shot
      idempotent heal in the v3.2.1 update, **or** document a manual heal for the few v3.2.0 early
      adopters (re-install toward a fresh brain, or copy the skill + add the MCP entry).
- [ ] Record the chosen path in the plan + ADR.

## Lot D — npm vulnerability remediation

- [ ] `npm audit fix` in `rag/` for the **non-breaking** ones (`hono`, `protobufjs`); re-run audit.
- [ ] `gray-matter` 1.x→2.x (js-yaml fix) is **breaking** → bump behind the **full RAG test suite**
      (frontmatter parsing is core); fix any fallout, tests green.
- [ ] Re-run `npm audit` → confirm clean (or document any residual + rationale).
- [ ] Bump `rag` engine version + manifest accordingly.

## Lot Ship

- [ ] All three suites green (harness / rag / local-mirror) + `tsc` clean.
- [ ] `/code-review` on the branch; fix findings in TDD (commit-only-green).
- [ ] Re-run QA `§3 local-mirror` on the golden master end-to-end (the campaign that was BLOCKED).
- [ ] Push, PR, merge to `main` on Thomas's explicit green light.
- [ ] Tag **v3.2.1** + codename; update README `latest` expectation.
- [ ] Archive this plan (`plans/archived/`, ✅ status + proof); tick QA finding #1 + #2 as resolved.
- [ ] Purge / restore the golden master; confirm no confidential data leaked.

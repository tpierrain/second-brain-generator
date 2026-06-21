# ADR 0025 — An engine update installs MISSING engine-owned skills and MCP servers (additive, never clobbering)

- **STATUS:** ACCEPTED (2026-06-19).
- **Scope:** Second brain (runtime) — a behavior of `update-engine` (engine-owned code in
  `scripts/`); it reaches ≥3.1.0 brains via the update itself and ships in fresh installs (where the
  installer already delivers skills + `.mcp.json` by construction). **Index format unchanged** → no
  schema bump, no forced reindex.
- **Related:** [`0003-...`] / [`0012-...`] (the write-allowlist safety core — this ADR adds one
  additive, conditional bucket without weakening it),
  [`0016-update-engine-is-a-skill-not-an-mcp.md`](0016-update-engine-is-a-skill-not-an-mcp.md)
  (the conversational layer), [`0022-golden-source-sync-separate-file-writing-mcp.md`](0022-golden-source-sync-separate-file-writing-mcp.md)
  (the `local-mirror` MCP, ex `golden-source-sync`). QA finding #1:
  [`../qa/qa-v3.2.0.md`](../qa/qa-v3.2.0.md); fix plan:
  [`../plans/fix-update-engine-skills-mcp-action.md`](../plans/fix-update-engine-skills-mcp-action.md).

## Crux

> - **Decision —** an engine update **adds** the engine-owned skills and MCP servers the manifest declares,
>   but **only where ABSENT** — never overwriting, never touching anything the manifest does not declare.
> - **Guarantee —** install-if-absent: a brand-new engine skill (e.g. `local-mirror`) lands on upgraders,
>   while an already-present (possibly user-customized) skill and every user-added `.mcp.json` server are
>   left byte-identical. The destructive `overwrite`/`regenerate` buckets stay blanket-sacred.
> - **Prior art (not NIH) —** these are standard declarative-provisioning *"ensure installed"* semantics
>   (apt/brew install-if-absent, Ansible `state: present`). **[ADR 0026](0026-brain-self-converges-via-idempotent-reconciler.md)
>   generalizes this** into the full desired-state reconciliation loop; **`settings.json` hook entries are
>   the third additive surface** (skills → servers → **hooks**).

## Context

Post-v3.2.0 QA, run as a real v3.1.0→v3.2.0 upgrader on a golden master, surfaced a **major** gap:
`update-engine` delivered the `local-mirror/` **code** (it is in the `replace` regime) but **neither**
its skill **nor** its MCP server. So an upgrader did not get the flagship feature; only a **fresh
install** did. Two root causes:

- **Skills are blanket-sacred.** `engine-apply-plan.mjs` scrubs everything under `.claude/skills/`
  (`SACRED_TREES`) so the engine never overwrites a user's custom skill. Correct as a default — but it
  also blocked a **brand-new engine skill** (`local-mirror`) that the user could not possibly have
  customized because it did not exist on their brain.
- **`engineMcpServers` was declared but never consumed.** The manifest lists
  `engineMcpServers: ["vault-rag","local-mirror"]`, but `update-engine` never reconciled the brain's
  `.mcp.json` against it, so the `local-mirror` stdio server was never registered.

A second fact constrains the design: **the apply runs from the brain's *installed* `update-engine`
code**, not the fetched launcher (static imports + Node module caching — self-replacement only takes
effect on the *next* run). So a logic fix only governs brains already running it (v3.2.1 → future); the
current ≤v3.2.0 cohort self-heals on the **subsequent** update (run 1 lays down the new engine code,
run 2 executes it). Given a tiny, reachable cohort, we accept that one-cycle lag rather than add a
re-exec-from-fetched mechanism (rejected below).

## Decision

**On update, additively install the engine-owned skills and MCP servers the manifest declares, but only
where they are ABSENT — never overwrite, never touch anything the manifest does not declare.**

1. **`installSkills` bucket (skills).** `computeApplyPlan` carves the manifest-declared engine-skill
   paths (`merge` entries matching `.claude/skills/<name>/**`) out of the blanket skills scrub into a
   new `installSkills` bucket. At apply, each declared skill dir is **installed only if absent** on the
   brain. An absent skill has no user state to preserve, so this is unambiguously safe; an
   already-present engine skill (possibly user-customized, e.g. `prepare-1-1`) is **left byte-identical**.
2. **`.mcp.json` reconcile (servers).** `update-engine` reads the **fetched** `.mcp.json.template`,
   substitutes `{{PROJECT_ROOT}}` → the brain dir, and **adds only the `engineMcpServers` that are
   missing** from the brain's `.mcp.json`. User-added servers are preserved; re-running is idempotent.
3. **The destructive buckets stay scrubbed.** `overwrite`/`regenerate` still refuse any
   `.claude/skills/**` path, so a buggy/hostile manifest can never overwrite a skill — only the
   additive, install-if-absent `installSkills` path can ever write one, and only when none exists.

### Safety invariant (every new test asserts it)

> Only skills and MCP servers the manifest declares as engine-owned are ever written, and only when
> ABSENT. Everything else under `.claude/skills/` (any non-declared / custom skill), every user-added
> `.mcp.json` server, the vault, `.env`, the constitution and settings are untouchable.

## Consequences

- **Upgraders get `local-mirror`** (skill + MCP) — QA finding #1 closed for every brain running this
  code or newer; the ≤v3.2.0 cohort heals on its next update (documented, no extra code).
- **Zero clobber risk.** Install-if-absent means a user-customized engine skill (the `prepare-1-1`
  "refine to your own KPIs" case) is never overwritten. Refreshing the *content* of an
  already-installed engine skill remains out of scope (it belongs to a future 3-way merge, same as the
  other `merge` files).
- **The safety core is unchanged in spirit**: still a write-allowlist; the one new bucket is additive
  and conditional, and the sacred scrub on the destructive buckets is intact.
- **No schema change, no forced reindex.**
- **Forward-note (ADR 0026):** this additive, install-if-absent pattern is later generalized into a full
  desired-state reconciler. `settings.json` **hook entries** become the **third additive surface** after
  skills and `.mcp.json` servers. The `computeApplyPlan` invariant here is **unchanged** — the hook merge,
  like the `.mcp.json` reconcile, is a surgical side-channel **outside** the write-allowlist, not a new
  allowlist bucket.

## Rejected alternatives

- **Re-exec the fetched `update-engine` so the target version drives the update (one-cycle for future
  logic fixes).** More "correct" in principle, but it does **not** help the current ≤v3.2.0 cohort
  (their installed code lacks the re-exec, so they still need two cycles) and costs real complexity:
  anti-loop guard, cross-platform spawn, seam re-wiring + tests. Over-engineering against a rare,
  bounded risk; revisit with a dedicated ADR if engine-logic changes ever become frequent.
- **Overwrite engine skills wholesale on every update (replace-like).** Would clobber legitimate user
  customization of meta-skills (`prepare-1-1`, etc.). Install-if-absent delivers the missing flagship
  skill with none of that risk.
- **Hardcode `local-mirror` as a special case.** Brittle and non-general; driving everything off the
  manifest's declared engine skills + `engineMcpServers` keeps the next engine skill/server automatic.

# ADR 0016 — `update-engine` is a Claude-driven skill + deterministic script, not an MCP tool

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — the updater is installed into the brain and runs
  brain-side.
- **Related:** [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md) (the
  `vault-rag` MCP server is a stable *retrieval* contract — what this ADR keeps clean),
  [`0002-in-house-installer-vs-plugin.md`](0002-in-house-installer-vs-plugin.md) (Claude-driven
  onboarding — the precedent this mirrors), [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (the real work lives in a testable, deterministic `.mjs`), [`0014-ship-update-engine-before-mass-deployment.md`](0014-ship-update-engine-before-mass-deployment.md)
  + [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) (what
  `update-engine` is and why now). Plan: [`engine-packaging-phase1-action.md` Step 6](../plans/engine-packaging-phase1-action.md).

## Context

Phase 1 ships `update-engine` (ADR 0014). A natural question is *how* a brain exposes it: as a **tool on
the existing `vault-rag` MCP server**, as a **bare CLI** the user runs in a terminal, or as a
**Claude-driven skill** (like the installer). The choice shapes the user journey and the architecture.

## Decision

**`update-engine` is a brain-side *skill* (the conversational, opt-in driver) backed by a pure-Node
*deterministic core* (`scripts/update-engine.mjs`). It is NOT a tool added to the `vault-rag` MCP
server, and not a terminal-only CLI.**

- The **core** (`scripts/update-engine.mjs`) does the real, testable work: clone the pinned launcher tag,
  overwrite the `replace` bucket, regenerate launchers, replace engine-owned scripts (incl. itself),
  `npm install`, reindex-if-the-schema-moved. Unit-tested, cross-platform (ADR 0015).
- The **skill** (`update-engine`, shipped into the brain by the installer) is the thin conversational
  driver: it confirms with the user (opt-in, **never** auto), invokes the core, and reports what changed.
- The user **triggers it in plain conversation** ("update my engine"); because Phase 0 made the engine
  **observable**, the brain may also **proactively offer** the update ("your engine is v1.0, v1.2 is
  available — install it?").

## Consequences

- **The MCP contract stays clean.** `vault-rag` keeps doing one thing — retrieval (ADR 0006). It never
  rewrites its own code while running, and never grows maintenance responsibilities outside its scope.
- **Consistent with the product's Claude-driven ethos** (ADR 0002): install and update are both
  conversational, opt-in, foolproof — right for non-technical users, no terminal required.
- **Testable & deterministic** (ADR 0009): the logic lives in `.mjs` under `node --test`; the skill holds
  no business logic, only UX.
- **The user journey is conversational** (documented in the PR and, when Step 6 ships, in `SETUP.md`):
  ask → confirm → it swaps the engine and reindexes if needed → it reports, leaving notes/.env/
  constitution/settings/skills untouched.

## Rejected alternatives

- **A tool on the `vault-rag` MCP server.** The server would have to rewrite its own running code and
  restart itself, and reach files outside its remit (launchers, scripts, manifest) — coupling *retrieval*
  to *self-maintenance* and eroding the stable contract of ADR 0006.
- **A bare CLI run in a terminal.** Excludes the non-technical audience the product targets (ADR 0002);
  against the Claude-driven, no-terminal ethos.
- **A "pure skill" with the logic in the prompt.** Non-deterministic and untestable — violates ADR 0009.
  The deterministic core in `.mjs` is non-negotiable; the skill only drives it.

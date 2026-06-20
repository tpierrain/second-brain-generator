# ADR 0026 — The brain self-converges to its desired state via an idempotent reconciler (auto-finalize after update + SessionStart self-heal)

- **STATUS:** ✅ ACCEPTED (2026-06-20) — captured from v3.2.2 **field QA** on a real
  v3.1.0 → v3.2.2 upgrader (a throwaway "legacy" brain); scope locked, implemented in **v3.3.0**.
  Index format unchanged → no schema bump, no forced reindex. The "residual bootstrap" caveat in
  *Consequences* is accepted as the deliberate trade-off (declarative-data convergence in one pass;
  only a rare reconciler-engine change still lags one update). The vault-sacred *Safety invariant* carries
  **one narrow, nominative exception** (Decision §5 + invariant below): the reconciler may **seed
  (write-if-absent)** the engine-owned health-check note + incrementally reindex it, so the `health_check`
  canary (ADR 0030) also works on upgraders.
- **Scope:** Second brain (runtime) + Installer — a brain-side **deterministic reconciler** invoked by
  `update-engine` (as a child process) and by the **SessionStart** hook; the installer may reuse the
  same pure libs at install time.
- **Related:** [`0009-prefer-deterministic...`](0009-prefer-deterministic-event-condition-over-probabilistic.md)
  (deterministic-first — this is its natural extension), [`0025-update-engine-installs-missing-engine-skills-and-servers.md`](0025-update-engine-installs-missing-engine-skills-and-servers.md)
  (the install-if-absent capability this **generalizes**), [`0015-mac-windows-parity...`](0015-mac-windows-parity-regenerate-launchers.md)
  (Mac/Win/Linux parity), [`0016-update-engine-is-a-skill-not-an-mcp-tool.md`](0016-update-engine-is-a-skill-not-an-mcp-tool.md)
  (skill vs MCP), the write-allowlist safety core. Field findings: [`../plans/prospective/post-v3.2.2-field-qa-findings-action.md`](../plans/prospective/post-v3.2.2-field-qa-findings-action.md).

## Context

Field QA of v3.2.2, run as a real **v3.1.0 → v3.2.2 upgrader**, reproduced the documented **"2-cycle"
self-heal** (ADR 0025): the brain needed **two** `/update-engine` runs before the `local-mirror` skill
and MCP server were installed. Empirically confirmed — run 2's report listed *"new engine skill
installed: local-mirror"* and *"new MCP server registered: local-mirror"*. Two distinct latency layers
were observed:

- **Layer A — self-update bootstrap.** The apply is driven by the brain's **installed**
  `update-engine.mjs` (static imports + Node module caching → self-replacement only takes effect on the
  *next* run). So a capability **introduced by** an update can only **execute** on the following run.
- **Layer B — Claude session config-freeze.** Skills, MCP servers, hooks and settings are loaded when a
  **conversation starts**. A freshly-installed skill/MCP becomes live only in a new — or **restarted** —
  session. Field finding: a **full Claude Desktop restart + resumed conversation is enough** to load
  **both** the new MCP server **and** the new skill in an already-brain-rooted conversation (no
  brand-new conversation required just to pick up new capabilities; that "new conversation" rule is the
  separate *initial-rooting* concern).

**The pain:** the user had to *know* to run the update twice; the brain neither **auto-finalized** nor
**warned**. That is fragile onboarding for the flagship feature.

## Decision

**Extract the "converge the brain's on-disk state to the manifest's desired state" half of `updateEngine`
into a standalone, deterministic, idempotent reconciler, and run it at two points.**

1. **`reconcile-brain.mjs` (the converger).** Driven entirely by the declarative `engine-manifest.json`:
   ensure engine-owned skill dirs present (**install-if-absent**, ADR 0025), `.mcp.json` carries the
   declared `engineMcpServers`, launchers regenerated. **No network.** Same **write-allowlist safety
   core** — never touch the vault, `.env`, the constitution, settings, or any non-declared/custom skill.
2. **Auto-finalize (solves Layer A).** At the **end** of `update-engine`, after files are placed,
   **re-exec the freshly-written reconciler in a fresh child process**. A new `node` process reads the
   just-written code/manifest from disk → escapes the in-memory module cache → executes the
   *just-installed* logic. This **collapses the 2-cycle into a single invocation**.
3. **SessionStart self-heal (mitigates Layer B).** Wire the reconciler on the **existing SessionStart
   hook**. A brain that received code but never reconciled **converges silently** at the next
   conversation start. Hard requirements: **idempotent** (true no-op when already converged → zero git
   churn / no auto-commit noise), **fail-open non-blocking** (never break session start — log loudly,
   exit 0), **fast**.
4. **Minimum bar if the full reconciler is deferred:** `update-engine` must **loudly tell the user**
   when it merely laid down code that a follow-up run will activate ("run once more" + a counter),
   instead of today's silence.
5. **Seed the engine-owned health-check note so the canary covers upgraders.** The `health_check` RAG
   canary (ADR 0030) targets a dedicated engine-owned note,
   `vault/engine-health/health-check.md` (unique invented token `Quibblethorne`, no `exemple` tag → it
   survives the demo purge). New installs get it via the install-time vault bulk-copy; upgraders would
   **not** (the vault is sacred + v3.3.0 forces no reindex), leaving their canary `unknown` forever. So:
   - **Seed-if-absent, one path.** At a **real update** (`sourceDir !== brainDir`), if the note is
     absent in the brain, **copy it** from `sourceDir/vault/engine-health/health-check.md`. **Never
     overwrite, never delete**; scoped to that **exact single path**. (SessionStart self-heal runs with
     `sourceDir === brainDir` → cannot self-seed and does not try.)
   - **Targeted incremental reindex — only on a fresh seed.** Right after seeding, run an **incremental**
     reindex (the index-manager skips unchanged docs → only the one new note is encoded; NOT the
     schema-change full re-encode v3.3.0 avoids). If nothing was seeded, **no reindex** runs.
     ⚠️ Mandatory pairing: seeding **without** indexing → note on disk + 0 index hits + embedder ran →
     `health_check` returns a **false `broken`** (worse than `unknown`).

### Safety invariant (every test asserts it)

> The reconciler only ever writes manifest-declared engine-owned skills/MCP servers (install-if-absent)
> and regenerated launchers. The vault, `.env`, the constitution, settings, every user-added `.mcp.json`
> server and every non-declared/custom skill are untouchable — **EXCEPT** the single, nominative
> carve-out below.

> **⚠️ The one vault exception.** The "vault is untouchable" rule **stands**;
> its **only** exception is that the reconciler MAY **create** (write-if-absent — **never** overwrite,
> **never** delete) the single engine-owned note `vault/engine-health/health-check.md` when it is absent,
> and incrementally reindex **only** that freshly-seeded note. `.env`, the constitution, settings, user
> `.mcp.json` servers, custom skills **and every user note** remain fully untouchable; **no other vault
> path is ever written.** Enforced by tests:
> - **One path only** — the ONLY vault path ever written is `vault/engine-health/health-check.md`; a test
>   asserts no user note is created, modified, or removed.
> - **Write-if-absent** — an existing note is never overwritten; present-and-unchanged → no write, no reindex.
> - **Idempotent** — a second reconcile run = zero writes, zero reindex, zero git churn.
> - **No false `broken`** — whenever the note is seeded, the paired incremental reindex makes the canary
>   findable, so the post-seed verdict is `ok` (or `unknown` on a missing key), never a seeded-but-unindexed
>   `broken`.

## Consequences

- **Layer A solved**: one `/update-engine` invocation finishes the job (the auto-finalize child process).
- **Layer B mitigated**: SessionStart self-heal guarantees correctness from the **next** conversation; a
  full app restart (field-proven) suffices for the current one, and the brain can **say so**.
- **Aligns with ADR 0009**: deterministic, idempotent, fail-open. This is **desired-state convergence /
  drift remediation** (the Terraform / k8s-controller pattern) — light "compliance automation" framed as
  *make on-disk state match the manifest*, not *run a sequence of migrations*.
- **Residual bootstrap (honest):** the reconciler is itself part of the payload, so if its **algorithm**
  changes, that change still lags one update. By keeping it a **stable interpreter of declarative
  manifest DATA**, **feature additions** (a new skill dir, MCP server, settings entry) land in **one
  pass**; only the **rare** reconciler-engine change lags. We move the cost from *frequent* to *rare*.
- **Upgraders get a real canary** without breaking the vault-sacred guarantee in substance: user data is
  still never read-for-mutation, never overwritten, never deleted — the engine only
  (re)places **its own** health file, in **its own** namespace (`engine-health/`), and only when missing.
  Blast radius is a single hard-coded path enforced by tests, so it cannot drift into "the reconciler may
  write the vault" in general. A brain that never re-runs `update-engine` after upgrading keeps an `unknown`
  canary (safe); the carve-out activates on the next real update. Cross-platform: the seed reuses the
  self-copy-guarded `copyInto`, the reindex the existing seam — both to be verified on `win32` (ADR 0015).

## Rejected / deferred alternatives

- **Status quo (just document the 2-cycle, ADR 0025).** Accepted as interim for the tiny ≤v3.2.0 cohort,
  but it is **fragile onboarding**: this ADR proposes to remove the manual second run.
- **Re-exec the FETCHED `update-engine`** (ADR 0025 already rejected this): doesn't help the installed
  cohort and adds spawn / anti-loop complexity. The **reconciler-as-child-process** is the same idea but
  scoped to a small, stable, tested converger rather than re-running the whole update.
- **An aggressive SessionStart reconciler that writes on every start.** Rejected unless strictly
  idempotent + fail-open: the blast radius is **every** conversation, so conservatism is mandatory.
- **Auto-register the brain's vault in Obsidian inside this reconciler at runtime.** Tempting (it
  composes), but Obsidian may be **running** at session start and would **clobber** our edit on quit →
  keep vault-registration **install-time** (see the findings plan / a future ADR), not in the runtime
  reconciler.
- **Install-only for the health-check note** (simplest, fully safe) — rejected: leaves every upgrader's
  canary permanently `unknown`, so the feature would not serve the existing cohort.
- **Seed at update WITHOUT reindex** — rejected: a note on disk with zero index hits yields a false
  `broken`; the targeted incremental reindex is mandatory.
- **Full reindex at update to pick up the note** — rejected: re-encodes the whole
  vault (minutes) for one tiny note and contradicts v3.3.0's "no forced reindex"; use the incremental,
  single-doc path. **Also rejected: seeding in the SessionStart self-heal** (`sourceDir === brainDir` →
  nothing to copy from; writing the vault on every start widens the blast radius for no gain) and
  **widening the carve-out to "engine-owned notes" in general** (premature; stays nominative to this one
  path until a second engine note ever justifies revisiting).

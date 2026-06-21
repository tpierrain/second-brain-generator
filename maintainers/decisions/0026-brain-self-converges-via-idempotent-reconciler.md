# ADR 0026 — The brain self-converges to its desired state via an idempotent reconciler (auto-finalize after update + SessionStart self-heal)

- **STATUS:** ✅ ACCEPTED (2026-06-20) — captured from v3.2.2 **field QA** on a real
  v3.1.0 → v3.2.2 upgrader (a throwaway "legacy" brain); scope locked, implemented in **v3.3.0**.
  Index format unchanged → no schema bump, no forced reindex. The "residual bootstrap" caveat in
  *Consequences* is accepted as the deliberate trade-off (declarative-data convergence in one pass;
  only a rare reconciler-engine change still lags one update). The blanket-sacred *Safety invariant* carries
  **two narrow, nominative exceptions** (Decision §5 and §6 + invariant below): the reconciler may **seed
  (write-if-absent)** the engine-owned health-check note + incrementally reindex it (so the `health_check`
  canary, ADR 0030, also works on upgraders), and may **merge (add-if-absent)** engine-owned hook entries
  into `settings.json` (so the v3.3.0 SessionStart runtime hooks reach upgraders, not just fresh installs).
- **Scope:** Second brain (runtime) + Installer — a brain-side **deterministic reconciler** invoked by
  `update-engine` (as a child process) and by the **SessionStart** hook; the installer may reuse the
  same pure libs at install time.
- **Related:** [`0009-prefer-deterministic...`](0009-prefer-deterministic-event-condition-over-probabilistic.md)
  (deterministic-first — this is its natural extension), [`0025-update-engine-installs-missing-engine-skills-and-servers.md`](0025-update-engine-installs-missing-engine-skills-and-servers.md)
  (the install-if-absent capability this **generalizes**), [`0015-mac-windows-parity...`](0015-mac-windows-parity-regenerate-launchers.md)
  (Mac/Win/Linux parity), [`0016-update-engine-is-a-skill-not-an-mcp-tool.md`](0016-update-engine-is-a-skill-not-an-mcp-tool.md)
  (skill vs MCP), the write-allowlist safety core. Field findings: [`../plans/prospective/post-v3.2.2-field-qa-findings-action.md`](../plans/prospective/post-v3.2.2-field-qa-findings-action.md);
  the upgrader convergence fix (desired-state from delivered files + `engine-skills/` staging):
  [`../plans/self-heal-converge-mcp-skill-from-pre-3.3-action.md`](../plans/self-heal-converge-mcp-skill-from-pre-3.3-action.md).

## Crux

> - **Decision —** the brain converges its own on-disk engine state to the *desired state the engine
>   DELIVERS* — read from the `replace`-regime files themselves (`settings.json.template` hooks,
>   `.mcp.json.template` server keys, `engine-skills/<name>/` skill presence), **never** the brain's frozen
>   `engine-manifest.json` (which `update-engine` never refreshes) — through one idempotent **reconciler**,
>   run after every update (an auto-finalize child process) and at every **SessionStart** (self-heal — plus,
>   for the one-time pre-3.2 jump, a bootstrap tick on the already-wired `session-status` hook).
> - **Guarantee —** the reconciler only ever **adds** engine-delivered, engine-owned things **when
>   absent**: engine skill dirs, `.mcp.json` servers, `settings.json` **hook entries**, regenerated
>   launchers, and the single health-check note. It **never** overwrites or deletes the vault, `.env`, the
>   constitution, a user skill, or any user-authored `.mcp.json` server or `settings.json` entry.
> - **Prior art (not NIH) —** this is the canonical **desired-state reconciliation loop** (Kubernetes
>   controllers, GitOps Argo/Flux, Terraform plan→apply, Chef/Puppet converge, Microsoft DSC Test/Set,
>   Windows Installer self-healing); **SessionStart is its level-triggered tick**.

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

**A second, structurally identical gap — the SessionStart runtime hooks.** The runtime trio added with
this convergence work — `session-self-heal`, `session-health`, `session-obsidian-hint` — is wired in
`.claude/settings.json`, which the write-allowlist treats as **blanket-sacred** (it is never in the
manifest, so no engine path writes it). The hook *script files* reach upgraders (they are in the `replace`
regime), but their *wiring* does not: a pre-3.2 brain stays at `SessionStart = [session-status]` no matter
how many updates run, so the trio — including the very self-heal hook meant to converge the brain — would
reach **fresh installs only**. This is the **same shape** as the `.mcp.json`-never-reconciled gap ADR 0025
closed, one level up: an engine-owned, purely-additive entry that the blanket sacred boundary blocks.

## Prior art — the desired-state reconciliation loop (this is not NIH)

This design deliberately mirrors an **established industry standard** rather than reinventing one. "Make
the on-disk state match a declared desired state, idempotently, on a recurring tick" is the **desired-state
reconciliation loop** at the heart of:

- **Kubernetes controllers** and **GitOps** (Argo CD, Flux) — a control loop continuously reconciles live
  state toward a declarative spec.
- **Terraform** `plan → apply` — diff the world against declared state, converge the gap.
- **Chef / Puppet** convergence runs and **Microsoft DSC** `Get → Test → Set` — periodic agents that
  re-assert desired configuration.
- **Windows Installer self-healing** — a missing managed resource is re-provisioned on next use.

Our mapping is one-to-one: the **files the engine delivers** (the `replace`-regime `settings.json.template`,
`.mcp.json.template`, `engine-skills/`, `engine-health/`) are the **desired state**; `reconcileBrain` is the **reconciler**
(the *Set*); `self-heal-detect` / `detectHookGap` is the **drift gate** (the *Test*); and **SessionStart is
the level-triggered tick** (the equivalent of chef-client's interval or Argo's continuous loop). Crucially,
desired-state is read from those *delivered files*, **not** the brain's `engine-manifest.json` — a manifest
frozen at install version would be a *stale* spec, the one drift a reconciler must never trust as truth.
Running an idempotent, true-no-op reconciler at every session start is therefore the
**canonical** continuous-reconciliation pattern — which is exactly why the "the first update runs the old
code" bootstrap worry dissolves: a level-triggered loop self-corrects on the next tick by design. The only
thing we add on top is naming discipline (see the terminology note in `CONVENTIONS.md`).

## Decision

**Extract the "converge the brain's on-disk state to the engine's delivered desired state" half of
`updateEngine` into a standalone, deterministic, idempotent reconciler, and run it at two points.**

1. **`reconcile-brain.mjs` (the reconciler).** Driven by the **desired state the engine DELIVERS** to the
   brain — the `replace`-regime files themselves, **not** the brain's `engine-manifest.json`:
   - **hooks** ← `.claude/settings.json.template`;
   - **MCP servers** ← the **keys of the delivered `.mcp.json.template`** (`Object.keys(...mcpServers)`);
   - **upgrader-bound skills** ← the presence of delivered **`engine-skills/<name>/`** staging dirs (plus,
     for v3.3.0+ auto-finalize, the engine merge-skill dirs the manifest still lists).

   This closes the residual gap (see §7): the brain's `engine-manifest.json` is **frozen at its install
   version** — `update-engine` rewrites only `engineVersion`/`source`/`provenance`, never `regimes` or
   `engineMcpServers` — so reading desired-state from it would re-introduce the very staleness this whole
   convergence work fights (a pre-3.3.0 brain's manifest names neither the `local-mirror` skill nor its MCP
   server, no matter how many updates run). Reading from the **files the engine actually lays on disk** is
   self-refreshing by construction. The reconciler then ensures engine-owned skill dirs present
   (**install-if-absent**, ADR 0025), `.mcp.json` carries the delivered server keys, launchers regenerated.
   **No network.** Same **write-allowlist safety core** — never touch the vault, `.env`, the constitution,
   settings, or any non-declared/custom skill.

   > Other consumers of `manifest.engineMcpServers` / `engineModuleRequirements` (the health probe,
   > status-line, version display) **keep reading the manifest** — only the reconciler's + self-heal gate's
   > *desired-state derivation* moves to the delivered files.
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
   canary (ADR 0030) is answered from a dedicated engine-owned note whose runtime home,
   `vault/engine-health/health-check.md` (unique invented token `Quibblethorne`, no `exemple` tag → it
   survives the demo purge), is **sacred** (the vault scrub, `SACRED_TREES`). New installs get it via the
   install-time vault bulk-copy; upgraders would **not** (the vault is sacred + v3.3.0 forces no reindex),
   leaving their canary `unknown` forever. So — the **same delivered-files principle** as the skill (§7):
   - **Ship the source at a non-sacred staged path, seed-if-absent in BOTH modes.** The note's canonical
     source ships at `engine-health/health-check.md` — a **non-sacred** `replace`-regime file the engine
     **delivers** (pass-1/update copies it, the vault scrub keeps it because it is not under `vault/`).
     `seedHealthNote({ sourceDir, brainDir })` then **install-if-absent**'s it into
     `vault/engine-health/health-check.md`. This converges at **a real update** (`sourceDir !== brainDir`)
     **AND at SessionStart self-heal** (`sourceDir === brainDir`): the staged source lives on the brain's
     **own disk**, and the src path `engine-health/…` differs from the dest `vault/engine-health/…`, so it
     is **never a self-copy** (exactly like `installStagedSkills`). **Never overwrite, never delete**;
     scoped to that **exact single** vault path. Seeding in self-heal is what finally gives a **pre-3.3.0
     upgrader** its canary: that cohort's *old* in-process update neither seeds the note nor auto-finalizes,
     so the note arrives at the restart's self-heal — no second update required.
   - **Targeted incremental reindex — keyed off the note's on-disk presence.** Whenever the vault note is
     present, pair an **incremental** reindex (the index-manager skips unchanged docs → only the one new
     note is encoded; NOT the schema-change full re-encode v3.3.0 avoids). Keying the pairing off
     **presence** (not a one-shot "just copied" flag) means a run that seeded the note but crashed before
     indexing it re-pairs the cheap reindex on the next run → the canary can never become a permanent
     false `broken`. ⚠️ Mandatory pairing: a present-but-unindexed note → 0 index hits → `health_check`
     returns a **false `broken`** (worse than `unknown`).
6. **Merge engine-owned hook entries into `settings.json` so the runtime hooks reach upgraders.** The
   reconciler reconciles the brain's `.claude/settings.json` against the engine's desired hook set
   (`.claude/settings.json.template`, itself in the `replace` regime so a brain compares against the
   *current* desired state, not its own stale template) — the **exact twin** of the `.mcp.json` reconcile
   (`reconcileMcpServers`) and the install-if-absent skills (ADR 0025), now one level up:
   - **Add-if-absent, dedup by the script the hook runs.** An engine hook entry is appended under its
     event (`SessionStart`, `PostToolUse`, `Stop`, …) **only if** no existing group there already runs
     that script (e.g. `scripts/session-health.mjs`). **Never overwrite, never remove, never touch a user
     entry.** Re-running is a **byte-identical no-op** once converged. The appended command reuses the
     brain's own interpreter (the `{{NODE}}` prefix is parsed from an existing hook command) and POSIX
     `{{PROJECT_ROOT}}` = `brainDir`, so it is correct on every OS (ADR 0015).
   - **The bootstrap tick (the one-time pre-3.2 jump).** On a pre-3.2 brain the *only* already-wired
     SessionStart hook is `session-status`, so **it is the bootstrap anchor**: when the now-v3.3.0
     `session-status` detects a hook-wiring gap (`detectHookGap`, drift gate), it spawns the reconciler
     **once** (the same detached, fail-soft shape as `session-self-heal`) to wire the missing hooks; the
     next restart loads them and `session-self-heal` owns steady state thereafter. The two spawners are
     **mutually exclusive by construction** — `session-status` spawns only when `session-self-heal` is not
     yet wired — so there is no race and zero steady-state overhead (a converged brain's gate is always
     false). **SessionStart is the level-triggered reconcile tick**; running an idempotent no-op
     reconciler at every start is the canonical pattern, not a hack.
   - **One-time reassurance, localized.** When the bootstrap tick wires the hooks, the brain surfaces a
     single calm message ("self-healing is now active — restart one last time; future updates apply in a
     single pass"). It is **localized via the brain's `BRAIN_LOCALE` marker** (the first localized runtime
     hook string; a tiny tested catalog, fail-soft to English), carried both in the `update-engine` report
     (Desktop-visible) and as a deterministic `session-status` CLI belt.

7. **A NEW upgrader-bound skill ships from a non-sacred `engine-skills/` staging dir, install-if-absent.**
   The write-allowlist's **sacred scrub** strips `.claude/skills/` from every engine write bucket
   (`SACRED_TREES`, ADR 0003/0012) — so a brand-new engine skill **cannot** be delivered under
   `.claude/skills/` via any regime: pass-1 (the upgrader's *old* orchestrator) scrubs it. The skill's
   canonical source therefore lives at a **non-sacred** delivered path, `engine-skills/<name>/` (in the
   `replace` regime → pass-1 copies it, the scrub keeps it because it is not under `.claude/skills/`), and a
   shared `installStagedSkills({ sourceDir, brainDir })` helper **install-if-absent**'s it into
   `.claude/skills/<name>/` — at install time (a fresh brain, `sourceDir === brainDir === TARGET`) and at
   every reconcile (auto-finalize + SessionStart self-heal). **Single source of truth** (the staging dir),
   never a delivered duplicate to keep in sync. Accepted consequence: the **launcher itself** no longer
   auto-discovers that skill — it is an engine-delivered asset that runs in a brain, not the launcher.

### Safety invariant (every test asserts it)

> The reconciler only ever writes manifest-declared engine-owned skills/MCP servers (install-if-absent)
> and regenerated launchers. The vault, `.env`, the constitution, every user-added `.mcp.json`
> server, every user-authored `settings.json` entry and every non-declared/custom skill are untouchable —
> **EXCEPT** the two narrow, nominative carve-outs below.

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

> **⚠️ The one settings exception.** The "`settings.json` is untouchable" rule **stands** for everything a
> user authors (permissions, env, their own hooks); its **only** exception is that the reconciler MAY
> **append** (add-if-absent — **never** overwrite, **never** remove) an **engine-owned hook entry** whose
> script the brain does not yet run. This is a surgical side-channel **outside** the `computeApplyPlan`
> write-allowlist (exactly like the `.mcp.json` reconcile), so the blanket "settings is sacred" rule is
> preserved for the write-allowlist core. Enforced by tests:
> - **Engine-owned only** — only hooks the engine template declares are ever appended; a user-added hook
>   entry is never modified or removed, and no non-hook section of `settings.json` is touched.
> - **Add-if-absent, dedup by script** — an event group already running that script is left as-is; entries
>   are matched by the script the hook runs, not by position.
> - **Idempotent** — a converged brain's `settings.json` is left **byte-identical** (no write → no
>   auto-commit noise); `settings.json` is written **only** when at least one hook entry was added.
> - **Cross-OS** — the appended command carries the win32-safe shape (the brain's own `{{NODE}}` prefix +
>   POSIX `{{PROJECT_ROOT}}`), unit-pinned on darwin and win32 (ADR 0015).

## Consequences

- **Layer A solved**: one `/update-engine` invocation finishes the job (the auto-finalize child process).
- **Layer B mitigated**: SessionStart self-heal guarantees correctness from the **next** conversation; a
  full app restart (field-proven) suffices for the current one, and the brain can **say so**.
- **The v3.3.0 runtime trio now reaches upgraders, not just fresh installs**: the additive hook-entry
  merge wires `session-self-heal`, `session-health` and `session-obsidian-hint` into a pre-3.2 brain's
  `settings.json`, so self-heal auto-convergence (F1), the runtime health probe + OS toast (F7) and the
  Obsidian hint (F8.3) stop being new-install-only. The first pre-3.2 jump converges via the
  `session-status` bootstrap tick; from v3.3.0 onward it converges in-band (one update + one restart).
- **First localized runtime hook string**: the one-time "self-healing is now active" reassurance follows
  the brain's locale (`BRAIN_LOCALE`), establishing the seam for future localized hook output; every other
  hook string stays English-only for now.
- **Intrinsically future-proof, no second source of truth.** Because desired-state is read from the files
  the engine **delivers**, any future skill or MCP server delivered via `replace` (a new `engine-skills/<x>/`
  dir, a new `.mcp.json.template` key) converges on its own at the next update/restart — **no manifest-refresh
  backstop and no separate `engine-spec.json` to keep in sync** (a dedicated spec file would just be a second
  declaration to maintain alongside the files it describes — the same anti-duplication reasoning that keeps
  the skill at a single staging source in §7).
- **Aligns with ADR 0009**: deterministic, idempotent, fail-open — see the *Prior art* section above for
  the industry standard this mirrors, framed as *make on-disk state match the delivered files*, not *run a
  sequence of migrations*.
- **Residual bootstrap (honest):** the reconciler is itself part of the payload, so if its **algorithm**
  changes, that change still lags one update. By keeping it a **stable interpreter of declarative
  manifest DATA**, **feature additions** (a new skill dir, MCP server, settings entry) land in **one
  pass**; only the **rare** reconciler-engine change lags. We move the cost from *frequent* to *rare*.
- **Upgraders get a real canary** without breaking the vault-sacred guarantee in substance: user data is
  still never read-for-mutation, never overwritten, never deleted — the engine only
  (re)places **its own** health file, in **its own** namespace (`engine-health/`), and only when missing.
  Blast radius is a single hard-coded path enforced by tests, so it cannot drift into "the reconciler may
  write the vault" in general. An upgrader's canary converges at the **first restart's self-heal** — no
  second real update needed, because the staged source is delivered to the brain's own disk. Cross-platform:
  the seed (`seedHealthNote`) is a guarded write-if-absent copy, the reindex the existing incremental seam —
  both verified on `win32` (ADR 0015).

## Rejected / deferred alternatives

- **Status quo (just document the 2-cycle, ADR 0025).** Accepted as interim for the tiny ≤v3.2.0 cohort,
  but it is **fragile onboarding**: this ADR proposes to remove the manual second run.
- **Re-exec the FETCHED `update-engine`** (ADR 0025 already rejected this): doesn't help the installed
  cohort and adds spawn / anti-loop complexity. The **reconciler-as-child-process** is the same idea but
  scoped to a small, stable, tested reconciler rather than re-running the whole update.
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
  single-doc path. Also rejected: **widening the carve-out to "engine-owned notes" in general**
  (premature; stays nominative to this one path until a second engine note ever justifies revisiting).
- **A separate ADR for the hook-entry merge, or for the localized message.** Rejected: both belong to the
  **same topic** as this ADR — *what the reconciler may write, and how it reaches upgraders* — so they are
  folded in here per the amend-in-place convention (`CONVENTIONS.md` §6bis), not spun off as new ADRs.
- **Make the engine write `settings.json` through the `computeApplyPlan` write-allowlist** (drop it from
  `SACRED_FILES`). Rejected: that would expose the user's permissions/env/own-hooks to engine writes. The
  additive side-channel keeps the blanket "settings is sacred" rule intact and only ever **appends**
  engine-owned hook entries — the exact shape `.mcp.json` already takes.
- **Localize every runtime hook string now.** Deferred: only the one-time reassurance is user-facing
  enough to justify the locale seam; the rest stay English-only until a concrete need appears.
- **Read desired-state from the brain's `engine-manifest.json`.** Rejected — this was the residual bug:
  `update-engine` never refreshes the manifest's `regimes`/`engineMcpServers`, so a pre-3.3.0 brain's
  manifest names neither the `local-mirror` skill nor its MCP server, and the reconciler would see "no gap"
  forever (the user stuck needing a second update). Desired-state must come from the **delivered files**,
  which are self-refreshing.
- **Deliver a dedicated `engine-spec.json` desired-state file.** Rejected — it would be a **second source of
  truth** to keep in sync with the very files it describes (the templates + `engine-skills/`). Deriving
  desired-state directly from those delivered files is strictly less to maintain and cannot drift out of
  step with what is actually on disk.
- **Punch a hole in the sacred scrub to deliver the new skill under `.claude/skills/` via `replace`.**
  Rejected — exposing `.claude/skills/` to engine writes breaks the user-sovereignty core (ADR 0003/0012).
  The non-sacred `engine-skills/` staging dir + install-if-absent (§7) delivers the skill without weakening
  the boundary.

# ADR 0030 — Each engine module exposes a standard `health_check` port; the calling context owns the policy

- **STATUS:** ✅ ACCEPTED (2026-06-20) — written **cold** after a `/clear`, per Thomas's decision to
  "start with the ADR" (option C) before touching code. **Extends and partially supersedes
  [ADR 0028](0028-brain-runs-a-non-blocking-background-health-check.md):** 0028's *runtime policy* (cached
  verdict, instant banner, detached re-probe, OS notification on a newly-broken capability) stands; what
  changes is **where the CHECK lives and how it is invoked** — it moves into each module as a standard
  `health_check` tool, called over MCP.
- **Scope:** Second brain (runtime) + Installer — a per-module health **contract** that the installer
  post-flight, the manual `verify-rag.mjs`, and the runtime SessionStart probe all consume the same way.
- **Related:**
  [`0026-brain-self-converges-via-idempotent-reconciler.md`](0026-brain-self-converges-via-idempotent-reconciler.md)
  (the *presence* layer; this is the *functional* layer, see 0028),
  [`0028-brain-runs-a-non-blocking-background-health-check.md`](0028-brain-runs-a-non-blocking-background-health-check.md)
  (the runtime policy this keeps and refines),
  [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md) (adding `health_check` extends
  the vault-rag tool contract — done additively),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (each `health_check`
  is a fixed, deterministic probe — never a Claude sub-agent),
  [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md) (one probe definition per module → no
  per-OS drift in *what* "healthy" means),
  [`0022-golden-source-sync-separate-file-writing-mcp.md`](0022-golden-source-sync-separate-file-writing-mcp.md)
  (the `local-mirror` MCP that now also exposes `health_check`),
  [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher↔brain axis the Scope sits on).

## Context

ADR 0028 shipped the brain's functional health-check (F7): a detached background probe at SessionStart
writes a cached verdict, the next session surfaces it instantly, and a newly-broken capability fires an
OS notification. That **runtime policy** is field-proven and stays.

But while finishing F7 (the installer-reuse baby-step), Thomas stepped back. The *check itself* — "does
the RAG actually answer from the vault?" — is now defined in **three** places, each blending the check
with its own reaction:

- the installer post-flight (loud, gate, `exit 1`),
- `scripts/verify-rag.mjs` (the manual loud canary),
- `rag/src/health-vitals.ts` (the runtime probe seam written for F7 baby-step 4b),

plus the canary token "Mollecuisse" is hard-coded in more than one spot. Three definitions of "operational"
drift apart over time — the classic smoke-test sprawl. Production systems solve this with **one** smoke
test per component that serves *both* as a post-deploy gate *and* as a periodic liveness probe; only the
**reaction** differs by caller.

A second force: the brain **offers** modules but the user doesn't install them all. `vault-rag` (the RAG)
is **mandatory** and always present. `local-mirror` (the Notion mirror) is **optional** — many users never
set it up. A health-check that probes every *packaged* module would cry "broken!" about a mirror the user
never wanted. So the check must run only against **activated** modules.

## Decision

**Each engine module — concretely, an engine MCP server — owns the definition of its own health and
exposes it through one standard port. The calling context decides how loudly to react.**

> **Separate the CHECK (what "operational" means — belongs to the MODULE) from the POLICY (how to react —
> belongs to the calling CONTEXT).**

### What "module" means here — precisely

A **module** in this ADR is an **engine MCP server**: a runtime service with its own **process boundary**
and **tool contract** (ADR 0006). Today there are two — `vault-rag` (mandatory) and `local-mirror`
(optional) — and any future engine MCP joins the protocol automatically. The `health_check` **port is
therefore a standard MCP tool** named `health_check`, sitting alongside the server's other tools
(`search_vault`, the mirror tools, …). "One module exposes one health port" = "one engine MCP server
exposes one `health_check` tool".

It is **not** every capability the brain ships:

- **Skills** (`import`, `sync`, `coach`, `local-mirror` the *driver*, …) and **hooks** (auto-commit,
  auto-push, self-heal, even the SessionStart health probe itself) are **code carried by the manifest**,
  not standalone runtime services. They have no "won't start / dead process / corrupt index" failure mode,
  so they expose **no** `health_check`. Their integrity is the **presence** layer (ADR 0026 self-heal: is the
  file there?), not this **functional** layer (does the service actually answer?). Note the `local-mirror`
  *skill* (a thin conversational driver, code) is distinct from the `local-mirror` *MCP server* (the
  service that gets a `health_check`).
- A module's **internal parts are not sub-modules**. vault-rag's embedder, its vector index and its search
  path are **`checks[]` entries inside vault-rag's single `health_check`** — not three separate ports. The
  granularity of a health port is the **deployable unit (the MCP server)**, not every inner hexagon or SPI
  adapter (e.g. the swappable embedder of ADR 0007 stays a *check within* vault-rag, never its own port).

So: **every engine MCP server exposes a `health_check`; nothing else does.** That keeps the protocol's reach
equal to the set of things that can be "registered but functionally dead" — exactly what this layer exists
to catch.

### 1. The contract — a standard `health_check` tool per engine MCP

Every engine MCP server exposes a tool with a fixed shape:

```
health_check() → {
  status: "ok" | "broken" | "unknown",          // aggregate
  checks: [ { name, status: "ok"|"broken"|"unknown", detail } ]
}
```

- **`vault-rag.health_check`** = the OFFICIAL functional check, lightweight, **NEVER a reindex**: embed +
  search the canary token and confirm the **dedicated health-check note** comes back (see §2), index
  integrity (store opens, ≥ 1 row), embedder readiness (in-process weights loadable / API key configured →
  a missing key is `unknown`, the separately-handled state, **not** `broken`). This is the logic currently
  in `rag/src/health-vitals.ts`, promoted into the vault-rag server as `health_check`.
- **`local-mirror.health_check`** = NEW in v3.3.0: config readable, mirror store reachable, mirror metadata
  consistent. Returns `unknown` (not `broken`) when nothing is configured yet.

`unknown` always means "couldn't determine" (cold start, missing key, no config) and never triggers an
alarm — only `broken` does. This keeps the "no crying wolf" invariant from ADR 0028 at the *module* level.

### 2. The canary is a DEDICATED engine-owned note, not a deletable demo note

The current canary ("Mollecuisse") lives in a **demo note** — and demo notes are *explicitly meant to be
purged* (`scripts/clear-example-notes.mjs` invites the user to delete them). So the moment a user clears the
examples, the canary target vanishes and `vault-rag.health_check` would scream `broken` while the RAG is
perfectly fine. Unacceptable false alarm.

**Decision: the canary is a dedicated engine-owned health-check note, decoupled from demo content.**

- A **dedicated note in a dedicated sub-folder** (decided 2026-06-20: e.g. `vault/<engine-subdir>/health-check.md`,
  kept separate from user notes) is seeded into the **indexed vault** so `search_vault` can actually find it.
  ⚠️ **Implementation constraint:** the indexer must actually scan that sub-folder — verify empirically (hidden
  `.`-prefixed dirs are commonly skipped; if so, use a plain non-hidden dedicated sub-folder). It carries a
  **unique invented token** — defined **once** as an engine constant and used both to seed the note and to
  assert the search — preserving the "not findable on the public internet" property that makes the canary
  prove *answers-from-the-vault* (the reason the demo content is invented in the first place).
- It is **engine-owned, not a demo note**: **excluded from `clear-example-notes.mjs`**, and clearly marked
  (title/body) as an engine artifact so a human is unlikely to delete it. Purging the examples no longer
  touches the health canary.
- **Probe-target-missing nuance (no crying wolf):** if the dedicated note is *absent from disk* (a user
  deleted even this), the RAG probe returns **`unknown`**, never `broken` — we cannot conclude the RAG is
  broken when the probe's own target is gone. Restoration is idempotent and happens at **install / update**
  (the note is carried like engine content), **not at check time** — the check stays read-only w.r.t. the
  vault and never triggers a reindex.
- This also **kills the token drift** the old design had (the literal split across `health-probe.mjs`,
  `verify-rag.mjs`, the demo note): one engine constant, one dedicated note, one assertion.

### 3. One runner, many policies

Every caller invokes `health_check` **the same way** — a real MCP round-trip — and only its reaction differs:

| Caller | Invocation | Policy |
| --- | --- | --- |
| Installer post-flight (`installer.mjs`) | spawn + `health_check` | **loud, gate**, `exit 1` if `broken` |
| `scripts/verify-rag.mjs` (manual) | spawn + `health_check` | **loud**, `exit 0`/`1` — becomes a thin wrapper |
| SessionStart probe (F7, runtime) | **detached** spawn + `health_check` | fail-open, silent, cache verdict, OS-notify on *newly* broken |
| Periodic monitoring (future, **not** shipped) | same | the protocol allows it — deferred |

### 4. Invocation = a real MCP `health_check` call (option A), not a shared lib (option B)

The runtime probe **really spawns the module's MCP server and calls `health_check`** (over the existing
MCP round-trip seam `scripts/lib/mcp-smoke.mjs#smokeTestMcp`), detached so session start never waits. This
**consciously revises** the earlier F7 baby-step-4b choice ("presence ping, no per-session handshake"):
checking *presence* proved the server file exists, not that the server *starts and answers*. The whole
point of the functional layer (ADR 0028) is to catch "registered but dead", so the probe must actually
exercise the tool. The detached-spawn shape keeps the "never slow startup" constraint intact.

Option B (a plain shared library both the MCP and the probe import) was rejected: it would test the
library, not the **server actually starting** — exactly the ABI-skew / won't-start failure mode (ADR 0021)
this is meant to catch. Putting the check behind the MCP boundary tests the real thing.

### 5. Health-check only ACTIVATED modules — the activation registry

The check runs only against modules the user has **activated**, not every module the package ships:

- **Activation source of truth = the brain's `.mcp.json`.** It is the *real* activation surface — Claude
  itself only spawns servers listed there. A module is "activated" iff it has an entry in the brain's
  `.mcp.json` `mcpServers`. No new bookkeeping file, no flag to keep in sync (ADR 0009: deterministic, no
  drift).
- **The manifest tags each engine module `mandatory` or `optional`.** `vault-rag` = `mandatory`,
  `local-mirror` = `optional`. (Today `engineMcpServers: ["vault-rag","local-mirror"]` is an
  unconditional list; it gains a per-module classification — `optional` defaults to existing entries being
  treated as optional unless tagged mandatory, so the change is additive.)
- **The runner's selection rule:**
  - a **mandatory** module is **always** probed; if it is *absent* from `.mcp.json`, that is itself a
    `broken` verdict (a required engine went missing — the presence concern of ADR 0026, surfaced loudly);
  - an **optional** module is probed **only if present** in `.mcp.json`; absent → **skipped silently**,
    never reported `broken` (no false alarm for a mirror the user never set up).

This is the registry the direction note asked for: not "what the package provides" but "what the user
activated", derived deterministically from `.mcp.json` × the manifest's mandatory/optional tag.

## Consequences

**On F7, already shipped (nothing is lost — the policy stays, the check moves):**

- ✅ **Kept** — the runtime **policy** layer: the verdict array, `formatHealthBanner`, the newly-broken
  diff, the cache, the OS notification, the detached re-probe orchestration
  (`scripts/health-probe-run.mjs#runProbeChild`, `scripts/session-health.mjs`). These already separate
  policy from check cleanly and need no rework.
- 🔄 **Moves** — the **check** logic of `rag/src/health-vitals.ts` becomes the vault-rag `health_check`
  tool; the runtime child does an MCP round-trip to `health_check` instead of spawning `health-vitals.ts`
  directly. `verify-rag.mjs` and the installer post-flight collapse onto the same call.
- ⚠️ **Consciously revised** — the F7 baby-step-4b "presence ping, no handshake" decision (see §4): the
  runtime probe now invokes `health_check` for real.

**General:**

- **One definition of "operational" per module** → no more three-way drift; the installer gate, the manual
  check, and the runtime probe can never disagree about what healthy means.
- **Cross-OS by construction** (ADR 0015): "healthy" is defined once in the module, not re-encoded per OS.
- **The RAG tool contract grows additively** (ADR 0006): `health_check` is a new tool; existing tools are
  untouched, so older callers keep working.
- **Optional modules stay quiet** when not activated — the headline UX win of the activation registry.
- **Extensible**: a future engine MCP gets health coverage for free by implementing `health_check` and
  declaring its mandatory/optional tag; periodic monitoring can reuse the exact same call.
- **Cost** (honest): promoting `health-vitals.ts` into the server and adding `health_check` to `local-mirror`
  is real work inside the rag/ and local-mirror/ packages (bumps their versions), and the runtime probe
  now pays an MCP spawn per activated module instead of a cheap presence check — acceptable because it is
  detached and only mandatory + activated-optional modules are spawned.

## Rejected / deferred alternatives

- **Keep the check in three places (status quo).** Rejected: guaranteed drift; the canary token already
  lives in more than one file.
- **Option B — a shared library both the MCP and the probe import.** Rejected (§4): tests the lib, not the
  server actually starting; misses the ABI-skew / won't-start failure mode (ADR 0021).
- **Presence ping only, no handshake (the prior F7 choice).** Superseded (§4): presence ≠ function.
- **Probe every packaged module regardless of activation.** Rejected: false "broken" alarms for optional
  modules the user never enabled (§5).
- **A dedicated activation-flag config file.** Rejected: extra state to keep in sync; `.mcp.json` already
  *is* the activation surface (ADR 0009 — prefer the deterministic existing signal).
- **Auto-repair functional breaks.** Out of scope here as in ADR 0028: `health_check` reports; repair
  (reindex / re-install) stays a user-consented action.
- **Periodic background monitoring / a health dashboard.** Deferred: the contract permits it, but it is not
  in v3.3.0's scope.

## Scope of work for v3.3.0 (what this ADR authorizes)

`health_check` contract + implement it on **vault-rag** (mandatory) and **local-mirror** (optional, probed
only when activated) + the activation registry (`.mcp.json` × manifest mandatory/optional) + migrate the
three consumers (installer post-flight, `verify-rag.mjs`, runtime probe) onto one MCP `health_check` call +
the **dedicated engine-owned health-check note** with its single-source canary token (decoupled from
deletable demo notes, excluded from the example purge). **Deferred:** periodic monitoring, dashboard,
future MCPs.

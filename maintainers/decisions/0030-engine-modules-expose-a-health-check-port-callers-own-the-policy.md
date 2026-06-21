# ADR 0030 — Each engine module exposes a standard `health_check` port; the calling context owns the policy

- **STATUS:** ✅ ACCEPTED (2026-06-20). **Extends [ADR 0028](0028-brain-runs-a-non-blocking-background-health-check.md):**
  0028's *runtime policy* (cached verdict, instant banner, detached re-probe, OS notification on a
  newly-broken capability) stands; this ADR defines **where the check lives and how it is invoked** — one
  standard `health_check` per engine module, read at a depth proportional to the caller (§3/§4/§6).
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

ADR 0028 defines the brain's functional health-check (F7) **runtime policy**: a detached background probe at
SessionStart writes a cached verdict, the next session surfaces it instantly, and a newly-broken capability
fires an OS notification. That policy stands.

The check *itself* — "does the RAG actually answer from the vault?" — must not fragment across the **three**
contexts that need it, each tempted to blend the check with its own reaction:

- the installer post-flight (loud, gate, `exit 1`),
- `scripts/verify-rag.mjs` (the manual loud canary),
- the runtime SessionStart probe,

with the canary token at risk of being hard-coded in more than one spot. Three definitions of "operational"
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
  a missing key is `unknown`, the separately-handled state, **not** `broken`). The logic lives in one place,
  `rag/src/lib/health-check.ts`, and the server exposes it as `health_check`.
- **`local-mirror.health_check`**: config readable, mirror store reachable, mirror metadata consistent.
  Returns `unknown` (not `broken`) when nothing is configured yet.

`unknown` always means "couldn't determine" (cold start, missing key, no config) and never triggers an
alarm — only `broken` does. This keeps the "no crying wolf" invariant from ADR 0028 at the *module* level.

### 2. The canary is a DEDICATED engine-owned note, not a deletable demo note

A canary that lived in a **demo note** would be fragile: demo notes are *explicitly meant to be purged*
(`scripts/clear-example-notes.mjs` invites the user to delete them). The moment a user clears the examples,
the canary target would vanish and `vault-rag.health_check` would scream `broken` while the RAG is perfectly
fine — an unacceptable false alarm.

**Decision: the canary is a dedicated engine-owned health-check note, decoupled from demo content.**

- A **dedicated note in a dedicated sub-folder** (e.g. `vault/<engine-subdir>/health-check.md`, kept separate
  from user notes) is seeded into the **indexed vault** so `search_vault` can actually find it.
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
- **No token drift:** one engine constant, one dedicated note, one assertion — the canary token is never
  duplicated across files.

### 3. One CHECK definition, three INVOCATION depths, many policies

The check is defined **once** (`rag/src/lib/health-check.ts` — see §1). It is **invoked at a depth and cost
proportional to the caller's frequency**, and only the reaction (policy) differs. **Only the installer
post-flight boots a server** (see §4 for why):

| Caller | Frequency | Invocation | Policy |
| --- | --- | --- | --- |
| Installer post-flight (`installer.mjs`) | once, at install | **spawn + MCP `health_check`** (nothing is running yet; this proves the server *boots and answers* under the real `.mcp.json`/PATH/ABI) | **loud, gate**, `exit 1` if `broken` |
| `scripts/verify-rag.mjs` (manual) | on demand, **while the live server runs** | **HEADLESS, in-process, read-only** — runs the same `health-check.ts` logic at **full depth** (real embed + search of the canary). **Never spawns a 2nd `vault-rag`.** | **loud**, `exit 0`/`1` |
| SessionStart probe (runtime) | every session, background | **HEADLESS, in-process, read-only** at **light depth** (disk/DB reads only — see §6); **detached**, never boots a server | fail-open, silent, cache verdict, OS-notify on *newly* broken |
| Periodic monitoring (future, **not** shipped) | n/a | the protocol allows any of the above | deferred |

> The installer post-flight is the **only** legitimate place to boot a server: at install time nothing is
> running, and what we genuinely need to prove there is **deployment** ("does it start and handshake under
> the real launcher/PATH/ABI?", the ABI-skew concern of ADR 0021). At runtime, a server is already alive —
> booting a second one would test a *different* process, not the live one, and waste resources.

### 4. Invocation depth is governed by the MCP stdio transport

**The mental model that decides this.** A `vault-rag` MCP server is a **child process of Claude** that
talks over **stdin/stdout pipes** — a *private* channel between Claude and that one server. **There is no
socket or port**, so no third party (a hook, a CLI, our probe) can attach to the **live** server. Its
lifecycle: Claude spawns it when a rooted conversation initialises (reads `.mcp.json` → spawns the launcher
→ handshake → background auto-reindex → file watcher → lazy ONNX); it lives as long as that conversation
keeps it (≈ one process per conversation, two windows = two processes); it dies on close / `/mcp` / quit;
it **never self-restarts** (Claude decides, if it crashes).

**Consequence — there are only two ways to "probe", and they answer different questions:**

- **(A) Boot a NEW process** and call `health_check` over a fresh handshake. This tests **deployment**
  ("*a* server can start and answer under this config"), **not the live server** — it spawns a *second*
  `vault-rag` next to the running one. Legitimate **only at install** (nothing is running, and deployment
  is exactly the question — the ABI-skew concern of ADR 0021).
- **(B) Read the on-disk state HEADLESS, read-only** (the index, the canary note, the embedder weights/key),
  optionally running the same embed+search the server would. This answers **"is the DATA the live server
  serves actually sound?"** — without spawning anything.

**Principle: a probe must NEVER boot a `vault-rag` when one may already be running.** So the runtime probe
and `verify-rag` use **(B), headless** (`verify-rag` at full depth, the runtime probe light — §6); **only the
installer post-flight uses (A)**.

**The division of labour that falls out of the transport:**

| Concern | Who owns it | How |
| --- | --- | --- |
| **Liveness** of the live server (is *this* process answering right now?) | **Claude itself** — *not us* | Claude shows the server `failed`; tool-calls error. The user *sees* it. We cannot reach the live process (private stdio pipe), so we do not try. |
| **Data / function** (index intact, canary findable, embedder ready) | **Us — headless, read-only** | Read the index + canary + embedder state on disk; this is the layer Claude is *blind* to. |
| **Deployment** (does a server boot + handshake under the real launcher/PATH/ABI?) | **MCP smoke — once, at install** | Spawn + `health_check` in the post-flight; the only place booting is legitimate. |

This sharpens the refocused North. If Claude already surfaces a **dead** server, then the one mode that is
*truly silent* — that nobody sees — is **a live server answering from DEGRADED DATA** (empty / stale index,
missing or wrong embedder): Claude returns few/no results and may answer confidently anyway. **Catching
degraded data behind a live server is the unique value of this health-check**, and it is precisely a
headless, read-only, disk-level job — never a server boot.

The headless read and the install-time boot test **different** things and do not substitute for each other:
the boot proves a server *starts* under the real launcher/PATH/ABI (deployment), the headless read inspects
the *data a running server serves* (function). A server spawn at runtime could not even observe more — it
would re-open the same files the headless read opens directly, for the price of a process. Right tool, right
concern, right frequency.

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

Activation is therefore **not "what the package provides" but "what the user activated"**, derived
deterministically from `.mcp.json` × the manifest's mandatory/optional tag.

### 6. Probe DEPTH: light for the background probe, full for `verify-rag`

Headless reading (§4 option B) can be done at two depths. The choice is made **per caller, by frequency**:

- **Light (the background SessionStart probe)** — **file/DB reads only**: index has ≥ 1 row? the dedicated
  canary note is present on disk? embedder weights present (in-process) / API key configured (API)? →
  **milliseconds, zero ONNX load, zero boot.** This catches **every realistic *silent* degraded mode**
  (index empty / never built, index stale vs the vault, embedder weights gone, key missing → `unknown`). It
  only misses "embedder loads but emits bad vectors" — which is **rare and already visible** (search returns
  nonsense). Cost has to be near-zero here because it runs every session and must never slow startup (hard
  constraint, ADR 0028).
- **Full (`verify-rag`, manual)** — a **real embed + search** of the canary token through the same
  `health-check.ts` logic. Deliberate, on-demand, so the extra ONNX cost is fine; it additionally catches the
  bad-vectors / corrupt-index tail.

⚠️ **Startup race to respect:** at session init the live server kicks off a background auto-reindex. If the
light probe reads "index freshness" mid-reindex it could shout "stale" wrongly → any freshness signal must
be **tolerant** (grace window) or surfaced only as a **soft nudge**, never a red "broken" banner.

## Consequences

**On the runtime policy layer (ADR 0028, reused as-is):**

- The verdict array, `formatHealthBanner`, the newly-broken diff, the cache, the OS notification and the
  detached re-probe orchestration (`scripts/health-probe-run.mjs`, `scripts/session-health.mjs`) already
  separate policy from check, and are reused unchanged.
- The check is **one** `rag/src/lib/health-check.ts` definition, exposed as the vault-rag `health_check` MCP
  tool (for the install-time boot) **and** runnable **headless, read-only** (for `verify-rag` and the runtime
  probe). All callers share that one definition, invoked at the depth of §3/§6.

**General:**

- **One definition of "operational" per module** (`health-check.ts`) → no more three-way drift; the installer
  gate, the manual check, and the runtime probe can never disagree about what healthy means — even though they
  invoke it at different depths (MCP boot at install, headless full for `verify-rag`, headless light at runtime).
- **Cross-OS by construction** (ADR 0015): "healthy" is defined once in the module, not re-encoded per OS.
- **The RAG tool contract grows additively** (ADR 0006): `health_check` is a new tool; existing tools are
  untouched, so older callers keep working.
- **Optional modules stay quiet** when not activated — the headline UX win of the activation registry.
- **Extensible**: a future engine MCP gets health coverage for free by implementing `health_check` and
  declaring its mandatory/optional tag; periodic monitoring can reuse the exact same call.
- **Cost** (honest): promoting the check into one `health-check.ts` definition + adding `health_check` to
  `local-mirror` is real work inside the rag/ and local-mirror/ packages (bumps their versions). The runtime
  probe stays **cheap** (headless light disk reads, no spawn); the only boot is the **once-per-install**
  post-flight smoke. `verify-rag` pays a real embed+search, but it is manual and deliberate.

## Rejected / deferred alternatives

- **Keep the check in three places (status quo).** Rejected: guaranteed drift; the canary token already
  lives in more than one file.
- **An MCP round-trip for every caller (boot a server to run `health_check` everywhere).** Rejected for the
  runtime probe and `verify-rag`: booting is a *deployment* test that spawns a second `vault-rag` next to the
  live one (§4). Boot only at install; read headless at runtime.
- **Boot a server at runtime to test the LIVE one.** Rejected: impossible by construction — the live server
  is a private stdio child of Claude; a spawn always creates a *different* process (§4). Liveness is Claude's
  job, not ours.
- **A mere presence ping (does the server file exist?) instead of exercising function.** Rejected: presence ≠
  function; only the headless data/function read (§4) catches silent degraded data behind a live server.
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
only when activated) + the activation registry (`.mcp.json` × manifest mandatory/optional) + one shared
`health-check.ts` definition invoked at three depths: **MCP boot** at the installer post-flight, **headless
full** read in `verify-rag.mjs`, **headless light** read in the detached runtime probe (§3/§4/§6) +
the **dedicated engine-owned health-check note** with its single-source canary token (decoupled from
deletable demo notes, excluded from the example purge). **Deferred:** periodic monitoring, dashboard,
future MCPs.

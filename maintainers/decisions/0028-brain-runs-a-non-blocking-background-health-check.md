# ADR 0028 — The brain runs a non-blocking background health-check and reports cached health at session start

- **STATUS:** ✅ ACCEPTED (2026-06-20) — scope locked by Thomas during the v3.3.0 self-converging
  work: the self-heal reconciler (ADR 0026) detects *missing* engine skills/MCP (file presence) but
  **not functional breakage** (the RAG returns nothing, the embedder weights are gone, the index is
  corrupt, an MCP won't start). This ADR adds the **functional** layer, implemented in **v3.3.0** (F7).
- **Scope:** Second brain (runtime) + Installer — a brain-side **deterministic health probe** invoked by
  the **SessionStart** hook (background) and reusable by the installer's post-flight (which already runs
  the RAG canary). No new MCP server, no new conversation surface.
- **Related:** [`0026-brain-self-converges-via-idempotent-reconciler.md`](0026-brain-self-converges-via-idempotent-reconciler.md)
  (the *presence* layer this complements with a *functional* layer),
  [`0009-prefer-deterministic-event-condition-over-probabilistic.md`](0009-prefer-deterministic-event-condition-over-probabilistic.md)
  (deterministic Node probe, **not** a Claude sub-agent), [`0015-mac-windows-parity-regenerate-launchers.md`](0015-mac-windows-parity-regenerate-launchers.md)
  (Mac/Win/Linux parity — the OS-notification + probe paths each carry three OS branches). Reuses the
  field-proven `rag/src/lib/notify.ts` (cross-OS OS notification) and `scripts/verify-rag.mjs` (the
  "Mollecuisse" RAG canary).

## Context

ADR 0026 made the brain **self-converge** its on-disk state: a missing engine skill or unregistered MCP
server is detected (file presence) and reconciled. But a brain can be **fully present on disk yet
functionally broken**:

- the in-process embedder's model weights were deleted / never finished downloading → search throws;
- the vector index (SQLite) is corrupt or empty → search returns nothing;
- an engine MCP server is registered but **won't start** (ABI skew, missing dep) → the tool is dead;
- a `local-mirror` source vanished / its mirror dir was wiped.

None of these are visible to the presence-only gate. The user discovers them **mid-task**, when they ask
the brain something and it silently fails — exactly the "looks installed, doesn't work" trap.

**Hard constraint (Thomas):** the check must **never slow session start**. A user who opens a session to
use the brain *now* must not wait on a smoke test. So the probe runs **in parallel, in the background**,
and surfaces its verdict **fast** ("by the way, if you meant to use the Notion mirror, it's broken — do
X") **without** holding up the session.

## Decision

**Run a deterministic functional health-check as a detached background child at SessionStart, and report
the LAST KNOWN health instantly (a file read) at the top of the session.** Two halves, like ADR 0026:

1. **Report cached health — synchronous, instant.** SessionStart reads `engine-health.json` (the previous
   probe's verdict). If a capability is `broken`, it surfaces ONE loud `systemMessage` banner immediately
   ("⚠️ Last health-check: <capability> wasn't working — restart Claude / run /update-engine"). This is a
   **file read only** → zero added latency. No file / all green → emits nothing.
2. **Re-probe — detached background, non-blocking.** The same hook spawns a detached Node child
   (`process.execPath`, `{ detached, stdio: "ignore", windowsHide: true }`, `unref()` — the ADR-0026
   spawn shape) that runs the functional probes, writes the fresh verdict to `engine-health.json`, and on
   a **newly-detected break** fires an **OS notification** via the existing `notify.ts` seam. The hook
   itself returns immediately, `exit 0`.

**The probes (broad from the start, per the locked scope) — each deterministic, each best-effort:**

- **RAG core canary:** `search_vault` for the demo canary token ("Mollecuisse") must return the vault
  note (reuses `verify-rag.mjs` logic). Proves the embedder + index + search path actually answer.
- **Index integrity:** the vector store opens and holds ≥ 1 row (not corrupt, not empty).
- **Embedder readiness:** in-process → the model weights are present/loadable; API embedders → the key is
  configured (a missing key is a *known, separately-handled* state, not a silent break).
- **Engine MCP reachability:** each declared engine MCP server (e.g. `local-mirror`) starts and answers a
  trivial handshake; a registered-but-dead server is reported broken.

**Surfacing = both channels, complementary:** an **OS notification** the moment the background probe finds
a break (seconds, even before the user looks), **plus** a guaranteed in-conversation banner from the
cached verdict at the very next session start (covers the case where notifications are muted/headless).

### Why a deterministic Node child, not a Claude sub-agent

Considered (Thomas floated it): a sub-agent that "checks everything works". Rejected per ADR 0009 — a
sub-agent is probabilistic, costs tokens on every session start, and adds latency. A plain detached Node
process running fixed canaries is deterministic, free, fast, and unit-testable. Keep the intelligence in
the probes, not in an LLM.

### Safety + noise invariants (every test asserts them)

> The health-check is **read-only** w.r.t. the user's data: it searches, opens the index read-only, and
> pings servers — it **never writes** the vault, `.env`, the constitution, settings or skills. Its only
> write is `engine-health.json` (engine-owned state). It is **fail-open** (any probe error → that
> capability is "unknown", never a thrown hook; the hook always `exit 0`) and **quiet when healthy** (all
> green → no banner, no notification — no crying wolf).

## Consequences

- **Functional breakage is caught**, not just missing files — closing the gap ADR 0026 left open.
- **No session-start slowdown:** the user-facing path is a single file read; the probe is detached.
- **Fast, dual surfacing:** OS toast within seconds of a break + a guaranteed next-start banner.
- **Reuses proven seams** (`notify.ts`, `verify-rag.mjs`, the ADR-0026 detached-spawn shape) → small new
  surface, cross-OS by construction.
- **Cached-not-live caveat (honest):** the banner at session start reflects the *previous* probe, so a
  break that happened since the last probe is surfaced via the OS toast (this session) and the banner
  (next session), not as a synchronous in-conversation block this instant. That is the deliberate price of
  "never slow session start".
- **`engine-health.json` is engine-owned state** (like the manifest) — declared in the manifest regimes so
  upgraders receive the producing scripts; the JSON itself is gitignored/transient per brain.

## Rejected / deferred alternatives

- **Synchronous smoke test at session start.** Rejected: violates the hard "no slowdown" constraint (the
  RAG canary loads the embedder → seconds).
- **A Claude sub-agent health-checker.** Rejected (ADR 0009): probabilistic, token cost, latency.
- **Auto-repairing functional breaks in the background.** The reconciler (ADR 0026) already repairs
  *presence* breaks; for functional breaks (corrupt index, missing weights) the safe action is often a
  reindex / re-install the user should consent to — so this ADR **reports + points at /update-engine**,
  it does not silently re-encode the vault on session start.

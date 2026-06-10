# ADR 0006 — The RAG's MCP server is a stable interface contract

- **STATUS:** ACCEPTED (2026-06-06).
- **Related:** [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md)
  (reinforces its invariant "RAG server = standard MCP, no dependency on a proprietary API"),
  [`0003-pas-upgrade-capacites-cerveaux.md`](0003-pas-upgrade-capacites-cerveaux.md) (tension
  examined below), [`0005-support-onglet-code-desktop.md`](0005-support-onglet-code-desktop.md).
- **Associated implementation plan:** [`../plans/archived/onglet-code-desktop.md`](../plans/archived/onglet-code-desktop.md) (§8).

## Context

The RAG first **emerged in Thomas's actual local second brain**, then was **generalized into the
generator**. It will **keep improving** — and Thomas anticipates wanting to **change tech**: leave
Google/Gemini (privacy, cost, lock-in), go **100% local** (Ollama / open-source embeddings), change
the vector store, the chunking strategy, etc.

But **the RAG's MCP interface (the exposed tools) is, by contrast, fairly stable.** The whole user
harness depends on it: `CLAUDE.md`, skills, `sync-sources` consume the **MCP tools**, not the tech
behind them. Without an explicit decision, nothing stops provider-specific details from leaking into
that surface (it's already happening: `vault_stats` talks about "Gemini quota") and **re-coupling**
what is already decoupled.

## Hexagonal architecture framing

The `vault-rag` server is a **hexagon**:

- **API port (public contract, STABLE)** = the **MCP tools** exposed and their input/output schemas:
  `search_vault`, `get_document`, `list_documents`, `vault_stats`, `reindex` (list to
  freeze/version). That's **all** the user harness depends on.
- **SPI / adapters (internal details, INTERCHANGEABLE)** = embedding engine (Gemini today, via
  `EMBEDDING_MODEL` in `rag/src/lib/config.ts` + `embedder.ts` — **already partially modular**),
  vector store (SQLite / `better-sqlite3`), chunking strategy, quota guardrails.

## Decision

**The RAG's MCP surface (tool names + I/O schemas) is a stable, versioned public contract.**

- Any change to this contract is an **explicit breaking change** (versioning / announced migration),
  never a side effect of an internal refactor.
- What is **behind the port** (embedder, vector store, chunking, quota guardrails) is **freely
  replaceable** without touching the harness. The user chooses via `.env` (`EMBEDDING_MODEL` /
  equivalent).
- **No provider-specific vocabulary should leak into the contract.** Accepted action: generalize
  `vault_stats` — drop "Gemini quota X/7600", "reserve 50" in favor of **agnostic** terms
  ("embedding budget", "remaining requests"), so that a **local embedder with no quota** satisfies
  the contract without inconsistency (it would return e.g. "unlimited / N/A").

## Consequences

- **Changing adapters never breaks an already-deployed brain.** Gemini → local/Ollama, SQLite →
  another store: at worst the user **re-indexes**. Their harness (skills, constitution) doesn't
  move. That's what makes the RAG's continuous improvement **safe** for people.
- **Reinforces 0004:** keeps the cross-platform door open at low cost (a clean MCP contract, with no
  provider leak, is consumable by any MCP-capable client).
- **Imposes design discipline:** every RAG evolution asks the question "does this touch the port
  (→ breaking, versioned) or only the SPI (→ free)?". The `vault_stats` provider leak becomes a
  **debt to fix**, not a fatality.
- **Costs a bit of rigor:** you have to resist exposing a handy but specific detail (a "Gemini
  model" field, a SQLite error code) directly in an MCP tool.

## Tension with ADR 0003 — examined and settled

ADR 0003 establishes that we **do not propagate** capability upgrades to already-generated brains
(they are frozen at install). **No contradiction with the present ADR**, which speaks only of
**interface stability**, not distribution:

- 0006 says: *the MCP port is stable, the SPI is swappable* → a user can change their embedder **in
  their own brain** (a local gesture, via `.env`), exactly the "local iteration" spirit of 0003. No
  upstream propagation channel is created.
- The two ADRs are therefore **complementary**: 0003 = no synchronized fleet; 0006 = when a brain
  evolves (locally, or via a regeneration), the interface doesn't break under it.

**What would rub against 0003 is scoped OUT of this ADR**: the sibling idea of "packaging the RAG as
a **shared, upgradable component**" (potentially published/versioned). The stable MCP contract is
the **prerequisite** for it (hexagonal extractability), but a *shared upgradable component* would
reintroduce a propagation channel that 0003 specifically ruled out. **Deferred decision, to escalate
to Thomas**: either the packaging respects 0003 (each brain keeps ITS frozen copy, update = explicit
opt-in, non-destructive gesture), or it requires an addendum to 0003. **We don't settle it here.**

## Addendum (2026-06-08) — Embedder swap = confirm-gate, never a silent reindex

Clarification settled with Thomas while making this ADR concrete (plan
[`../plans/embedder-spi.md`](../plans/embedder-spi.md)): **how** an already-deployed brain reacts
when its embedder changes (the "at worst the user re-indexes" above).

**Technical finding:** the index stores vectors as raw `Float32` BLOBs **with no trace of the model
that produced them** (no provider, no model, no **dimension**). Since each embedder has its own
dimension (Gemini ≈ 3072, Mistral 1024, local ~768), a swap **without** reindex makes search
**silently wrong** (comparing vectors of incompatible dimensions). Nothing detects it today.

**Decision:**

1. **The index is stamped** with an **embedder identity** (`providerId` / `model` / `dimension`).
2. At search time, if the current identity **differs** from the stamped one (or is absent), the RAG
   **does not return wrong results**: it surfaces a **"stale index" signal**.
3. **Natural-language confirm-gate, never a behind-the-back reindex.** Claude **explains** to the
   user that the search config has changed, that the documents must be **re-indexed** (unchanged —
   just re-encoded), that **it takes a little time**, and **waits for explicit confirmation**.
   **By default: we reindex nothing** ("we're not going to index for nothing").
4. **No new MCP surface:** the signal travels through the return of `search_vault`, and the reindex
   through the existing `reindex` tool — **called only after the "yes"**. The MCP port thus remains
   the stable contract of this ADR (zero breaking change, zero provider leak in the schemas; the
   message names models **dynamically** via the identity, nothing hardcoded "Gemini").

This is the direct application of the project's **fail-loud + opt-in budget** posture (cf. revised
ADR 0005): an explicit, actionable refusal rather than a search that lies, and never any embedding
budget consumed without human agreement.

## Rejected alternatives

- **Coupling the harness directly to Gemini / the SQLite schema** (quick in the short term) —
  re-couples what is already decoupled, breaks the 0004 invariant, and forbids going local. Refused.
- **Leaving the provider leak in `vault_stats`** ("it works today") — a trap: the first local
  embedder with no quota would make the tool inconsistent. Fixed by the accepted generalization.
- **Freezing the SPI too** (vector store / embedder set in stone) — would kill exactly the freedom
  to evolve that motivates this ADR. Refused.

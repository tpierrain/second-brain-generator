# ADR 0004 — Claude-only for now, cross-platform not excluded

- **STATUS:** ACCEPTED (2026-06-05).
- **Related:** [`0002-installateur-maison-vs-plugin.md`](0002-installateur-maison-vs-plugin.md),
  [`0003-pas-upgrade-capacites-cerveaux.md`](0003-pas-upgrade-capacites-cerveaux.md).

## Context

The generator, and the brains it produces, are today tailored for **Claude Code and its
ecosystem**: `CLAUDE.md` constitution, `.claude/skills/` skills, `settings.json` **hooks**
(`PostToolUse` auto-commit, `SessionStart`), onboarding driven in chat by Claude.

Yet, looking at the layers, the essential part is **already AI-agnostic**:

- **The substrate (vault)** = Markdown + frontmatter + `[[wikilinks]]`, an open format, Obsidian-
  compatible, readable by any tool.
- **The engine (`rag/`)** = a **standard MCP server** (official SDK, stdio transport). MCP is an
  **open protocol** consumable by a growing range of clients (Claude, and beyond).

What's genuinely coupled to Claude is **the driving layer**: hooks, skills, constitution format,
conversational install.

## Decision

For now, we assume **Claude-only**: we do **not** seek to make the generator or the brains
cross-platform. We don't complicate the product for clients we don't yet know are used. **But it's
not excluded**: the decision to port cross-AI will be made **on real feedback** from users.

## Consequences

- **Guarantees simplicity and coherence:** a single target (Claude + its hooks), no multi-client
  abstraction layer to design/test/maintain before the need is proven.
- **Costs the immediate portability of the full experience**: on another client, today you only
  get to query the brain (via MCP), not the auto-commit nor the skills.
- **Invariant to preserve:** **do not re-couple** what's already agnostic. The **vault** must
  stay pure Markdown, and the **RAG server** a standard MCP with no dependency on a proprietary
  Claude API. That's what keeps the cross-platform door **open at low cost**.

## What will remain to address on cross-platform day

The bulk is already multi-AI — what will remain is mostly the **reliability / ergonomics /
automation layer**:

1. **Already portable, nothing to do:**
   - the **vault** (Markdown) — readable by any tool (Obsidian, another RAG, upload, grep…);
   - the **`vault-rag` server** — pure MCP, consumable as-is by any MCP-capable client.
2. **To adapt per client (the driving layer):**
   - **Constitution**: `CLAUDE.md` is the Claude convention. Plan an equivalent / an output to an
     emerging cross-tool format (e.g. `AGENTS.md`) as the cheapest hedge.
   - **Hooks** (`PostToolUse` auto-commit, `SessionStart`): these are Claude Code events.
     Elsewhere → the client's equivalent, **or** move them out of the AI. *Note: the auto-commit
     could migrate into the file watcher the RAG server already starts (`startVaultWatcher`),
     which would make it agnostic for free.*
   - **Skills** (`coach`, `sync-sources`, `prepare-1-1`…) and **chat-driven onboarding**: Claude
     format and mechanics → to re-express in the target client's mechanics.

## Rejected alternatives

- **Multi-client abstraction right now** — design/maintenance overhead for hypothetical clients;
  premature without a usage signal. We prefer to **wait for feedback**.
- **Deliberately locking onto proprietary Claude APIs** (to go faster) — would break the already-
  acquired agnosticism of the vault and the RAG, and would close the cross-platform door.
  Refused: see the invariant above.

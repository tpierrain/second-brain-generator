# ADR 0027 — Local citations open via a Claude-invoked allowlisted opener, not a chat click

- **STATUS:** ✅ ACCEPTED (2026-06-20).
- **Scope:** Second brain (runtime) — the deterministic `search_vault` citation block the engine renders for
  every answer.
- **Related:**
  [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md) (the citation block is part of
  the `search_vault` engine-owned output),
  the Obsidian chapter (Obsidian — the opener's target — is a recommended-but-optional vault viewer, and its
  vault auto-registration makes the open land without a manual "Open folder as vault"),
  [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher↔brain axis the Scope sits on).

## Context

Each `search_vault` result already renders a clickable 🧠 *local copy* link (`obsidian://open?path=<absolute>`)
and, for a mirror note, a 🔗 *Notion source* link (`https://…`). On the surface both look equivalent: two
clickable links.

They are not, in the brain's primary client. **Claude Desktop routes only `http(s)` clicks; it silently
drops custom-scheme (`obsidian://`) clicks.** So the 🔗 Notion link works, while the 🧠 local link *looks*
clickable but does nothing — a dead click with no feedback. A user who clicks it and gets nothing concludes
"local citations are broken", when the note is right there and openable.

The renderer is correct: `obsidian://open?path=<absolute>` resolves the vault by absolute path and works
through the system opener wherever custom schemes are honoured (CLI, web). The gap is purely the Desktop
client's handling of the click — not something the citation markup can change.

## Decision

**Keep both emoji links exactly as they are, and make the block self-explanatory so the dead Desktop click is
no longer a trap.** Concretely, each citation also carries a plain-text affordance:

```
🧠 local copy · 🔗 Notion source
`vault/notes/foo.md`
_Ask me to "open citation 2" and I'll open it in Obsidian._
```

- The 🧠 `obsidian://` link stays — harmless and genuinely useful in the clients that honour custom schemes.
- The 🔗 `https` link stays — it already works everywhere.
- The relative `vault/…` path stays visible as plain text (grep-/copy-friendly).
- The **affordance** is the load-bearing addition: the user asks Claude to "open citation N", and Claude
  opens the note via the **allowlisted opener** (`open` / `xdg-open` / `start` on `obsidian://…`). The number
  matches the citation heading, so "open citation 2" is unambiguous.

The opener path is already field-proven and allowlisted; this ADR only commits to **routing the open through
Claude rather than relying on a chat click**, because the click is unreliable in the primary client and a
human-invoked tool call is not.

### Why not the alternatives

- **Drop the `obsidian://` link, keep only `https`.** Loses the local-copy open entirely on CLI/web (where
  the scheme works), and a mirror note's local copy is often what the user wants over the live Notion page
  (offline, the exact indexed text). The link is useful where honoured; the fix is to stop *relying* on the
  click, not to remove a working link.
- **Render the local path as a bare `file://` link.** Opens the raw Markdown in a browser/finder, not in the
  vault-aware editor, and is dropped by Desktop just like `obsidian://`. No improvement.
- **Have Claude auto-open every cited note.** Noisy and presumptuous — most answers cite several notes the
  user never wants to open. Opening is on demand, by citation number.

## Consequences

- The citation block is **self-explanatory**: a user who can't click reads how to open the note. No more
  silent dead click.
- The open lands cleanly **only if** Obsidian is installed and the vault is registered — owned by the
  Obsidian chapter (guided install + opt-in auto-register). Without Obsidian, Claude still surfaces the note
  inline.
- The change lives in the engine-owned renderer (`rag/src/lib/citation-renderer.ts`), so it reaches **every**
  brain through `/update-engine`, not just new installs.
- The block is one line longer per citation — accepted: the clarity it buys (no dead-click trap) outweighs the
  added height.

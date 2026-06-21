# ADR 0027 — Local citations open via a Claude-invoked allowlisted opener, not a chat click

- **STATUS:** ✅ ACCEPTED (2026-06-20).
- **Scope:** Second brain (runtime) — the deterministic `search_vault` citation block the engine renders for
  every answer.
- **Related:**
  [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md) (the citation block is part of
  the `search_vault` engine-owned output),
  the Obsidian chapter (Obsidian is *one* recommended-but-optional viewer the OS may pick as the default
  Markdown editor — but the citation never assumes it),
  [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher↔brain axis the Scope sits on).

## Context

Each `search_vault` result renders a 🧠 *local copy* link to the note's real file in the vault and, for a
mirror note, a 🔗 *Notion source* link (`https://…`). On the surface both look equivalent: two clickable links.

They are not, in the brain's primary client. **Claude Desktop routes only `http(s)` clicks; it silently
drops any other scheme** — a custom scheme like `obsidian://`, but `file://` too. So the 🔗 Notion link works,
while a local link that *looks* clickable does nothing — a dead click with no feedback. A user who clicks it
and gets nothing concludes "local citations are broken", when the note is right there and openable.

So the local link can never be *relied on* as a click in the primary client; that is a property of the
client, not something the citation markup can fix. Whatever scheme we emit, the load-bearing way to open a
local note has to be something else.

## Decision

**Render the local link as a real-file `file://<absolute>` URL, and make the block self-explanatory so a
dropped click is no longer a trap.** Concretely, each citation carries a plain-text affordance:

```
🧠 local copy · 🔗 Notion source
`vault/notes/foo.md`
_Ask me to "open citation 2" and I'll open it in your Markdown editor (Typora, Obsidian, …)._
```

- The 🧠 link is a **real-file `file://` URL** — not an app-specific custom scheme. Where a client routes the
  click, the OS opens the note in whatever the user has set as their **default Markdown editor** (Typora,
  Obsidian, VS Code, …): editor-agnostic, editable, no lock-in to one app.
- The 🔗 `https` link stays — it already works everywhere.
- The relative `vault/…` path stays visible as plain text (grep-/copy-friendly).
- The **affordance** is the load-bearing addition: the user asks Claude to "open citation N", and Claude
  opens the note via the **allowlisted opener** (`open` / `xdg-open` / `start` on the file path), which hands
  it to the OS default editor. The number matches the citation heading, so "open citation 2" is unambiguous.

The opener path is already field-proven and allowlisted; this ADR commits to **routing the open through
Claude rather than relying on a chat click** (the click is unreliable in the primary client; a human-invoked
tool call is not), and to a **real-file link rather than an app-specific scheme** (so the open is editor-
agnostic, not tied to Obsidian).

### Why not the alternatives

- **Emit an `obsidian://open?path=…` custom scheme.** Ties the local-copy open to one app — yet many users
  read/edit Markdown in Typora, VS Code, or another editor, and the OS opener already routes a plain file to
  whatever is the default. The custom scheme buys nothing the file link doesn't, and is *also* dropped by
  Desktop, so it has no click advantage either. A real-file link is the portable, no-lock-in choice.
- **Drop the local link, keep only `https`.** Loses the local-copy open entirely (CLI/terminal clients DO
  route `file://`), and a mirror note's local copy is often what the user wants over the live Notion page
  (offline, the exact indexed text).
- **Have Claude auto-open every cited note.** Noisy and presumptuous — most answers cite several notes the
  user never wants to open. Opening is on demand, by citation number.

## Consequences

- The citation block is **self-explanatory**: a user who can't click reads how to open the note. No more
  silent dead click.
- The open lands in the user's **default Markdown editor**, whatever it is — Obsidian is no longer special or
  required. With Obsidian installed and set as the default, the same `open` lands there; without it, the OS
  picks the user's editor, and Claude can always surface the note inline as a last resort.
- The change lives in the engine-owned renderer (`rag/src/lib/citation-renderer.ts`), so it reaches **every**
  brain through `/update-engine`, not just new installs.
- The block is one line longer per citation — accepted: the clarity it buys (no dead-click trap) outweighs the
  added height.

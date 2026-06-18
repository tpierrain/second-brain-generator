---
name: golden-source
description: "Declare and synchronize a GOLDEN SOURCE — a live zone of an internal tool (Notion today) whose content is mirrored into this brain's vault as Markdown, so the RAG can search and cite it. Use when the user wants to connect / declare / set up a golden source, sync / refresh / update one (e.g. 'sync the PA-SC golden source from Notion', 'refresh my product golden source', 'connecte la source de vérité Notion'), check whether one is behind, list them, or remove one. The actual work runs in the golden-source-sync MCP server; this skill is the thin conversational driver."
version: 1.0.0
---

# /golden-source — Mirror a live internal source into your vault (opt-in, safe)

> Brain-side skill. A **golden source** is a zone of an internal tool (Notion for the MVP)
> that you declare once; the brain then **mirrors its pages into `vault/golden-sources/<name>/`
> as plain Markdown**. From there the existing RAG indexes and cites them like any other note —
> *the central RAG you don't have yet, but local and right now, plugged onto your live sources.*
>
> ⚠️ **This skill holds no logic.** All the real, testable work lives in the **`golden-source-sync`
> MCP server** (its own package, Outside-in TDD). This skill only **recognizes intent, gathers the
> declaration, guides the token into `.env`, calls the right MCP tool, and reports.**

## When to use it

Load this whenever the user wants to work with a golden source, in any language:

- *"connect / declare / set up a golden source from Notion"* — onboarding → `setup_source`
- *"sync / refresh / update the `<name>` golden source"* — delta + deletions → `sync`
- *"is `<name>` up to date? / what's its status?"* — → `check_freshness` / `status`
- *"list my golden sources"* — → `list_sources`
- *"remove / disconnect the `<name>` golden source"* — → `remove_source`

> Routing (the harness's job, not the MCP's — PRD §8): when a question is clearly **about a declared
> source's topic** (the `description` you captured at setup), it is good practice to **`sync` that one
> source first** so the answer is fresh, then search. Sync only the relevant source, never all of them.

## Terminology — what to call it when speaking to the user

In **English**, "golden source" is fine. In **French**, the user-facing term is **« source de vérité »**
— **never** "source d'or" (a literal calque that sounds wrong). Mirror the user's own wording when they
have one. The **identifiers stay English everywhere** regardless of the spoken language: the skill name
`golden-source`, the frontmatter key `golden_source`, the folder `vault/golden-sources/<name>/`, the MCP
tools — never translate those.

## Golden rule — the token NEVER travels through the chat

The Notion integration token is a secret. It goes **only into `.env`**, referenced by name
(`token_env`) — **never** pasted into the conversation, **never** passed as a tool argument, **never**
committed. The `setup_source` tool takes the **name of the env var**, not the token.

## Onboarding flow (`setup_source`)

1. **Gather the declaration** (ask in chat, conversationally):
   - `name` — short technical id = the vault subfolder (e.g. `pa-sc`). Lowercase, no spaces.
   - `title` — human label (e.g. "PA / SC zone").
   - `description` — the **topics** this source covers, in natural language. This is the **routing
     key**: it's how you'll later know which question should refresh which source.
   - `root_page_url` — the URL of the **root Notion page** of the zone to mirror (its whole sub-tree
     is in scope; pages outside it are not).
   - `token_env` — the **name** of the env var that will hold the integration token (e.g.
     `NOTION_TOKEN_PASC`). One token/scope per source.
2. **Guide the token into `.env`** (only if it isn't set yet): tell the user to open `.env` and add a
   line `^<token_env>=<their integration token>` (e.g. `NOTION_TOKEN_PASC=secret_…`), save, and that
   the Notion integration must be **shared on the root page** (Notion → page → ••• → Connections) so
   the scoped read works. Free integration: <https://www.notion.so/my-integrations>.
3. **Narrate, then call `setup_source`.** `setup_source` and the first sync are a **single, silent,
   possibly long call** (no live progress): it explores the whole perimeter, then downloads & converts
   every page. **Before** calling it, tell the user what's about to happen and roughly how long — e.g.
   *"I'll connect, explore the zone (a few seconds to ~1 min on a large one), then download & convert each
   page — this can take a minute or two; I'll report what came in."* — so the wait doesn't read as a
   freeze. Then call it with the five fields. It **tests the scope** (a scoped search that returns only
   the zone), does the **first sync**, writes the config (`golden-source-sync.config.json`, the versioned
   source of truth) and the sidecar state, and returns a step-by-step `message`.
4. **Report** what came back. A **0-pages** result means "the integration is not connected to the root
   page yet" → have the user share it, then re-run. An **enumeration/401 error** is distinct from
   "0 pages" — relay it as-is, do not pretend it synced.

> The produced `.md` files land in `vault/golden-sources/<name>/`. The **existing FileWatcher** indexes
> them and the **auto-commit hook** commits them — `golden-source-sync` is unaware of the RAG (PRD §7).
> Nothing else to wire on a freshly-installed brain: the server is already declared in `.mcp.json`.

## Already-installed brain that predates this feature

If the `golden-source-sync` tools are not available (a brain installed before this engine version),
it just needs the same one-time wiring every other server got at install. *(On the CLI you can confirm
with `/mcp`; in the Desktop app `/mcp` opens the connectors **Directory**, not the local server list, so
don't rely on it there — just check whether the tools respond.)*

1. Add the server block to `.mcp.json` (idempotent — skip if already present):
   ```json
   "golden-source-sync": { "type": "stdio", "command": "npx",
     "args": ["tsx", "golden-source-sync/src/server.ts"], "cwd": "<brain-root>", "env": {} }
   ```
   (On a bare-PATH desktop app, point it at the self-heal launcher instead — `command: "/bin/sh",
   args: ["golden-source-sync/launch.sh"]` on macOS/Linux, the `.cmd` on Windows — exactly like
   `vault-rag`.)
2. Install its deps once: `cd golden-source-sync && npm install`.
3. **Pick up the new server** (the MCP list is frozen at session start). In the **Desktop app**, the
   reliable way is to **quit & relaunch Claude Desktop, then reopen the _same_ conversation** — do **not**
   tell the user to "open a new conversation" (it spawns a duplicate of a pinned/named conversation and
   can leave two windows on one vault). On the **CLI**, relaunch `claude` in the brain folder. Then run
   `setup_source`.

> Note: the per-source **token** no longer requires any restart — it is read fresh from `.env` at
> call-time (F3). A restart is only ever needed to make Claude pick up a **new `.mcp.json` entry**.

> Running `/update-engine` delivers the server's code and launchers to such a brain automatically;
> this manual wiring only covers the `.mcp.json` entry, which is per-machine and never overwritten.

## Maintenance tools

- **`sync <name>`** (or `"all"`) — pulls the delta and reconciles deletions for one source. A page
  renamed → same file rewritten; a page deleted or moved out of scope → its `.md` removed. **Guardrail:**
  if the perimeter enumeration fails (network/401/429), **zero deletions** happen, the run is `partial`,
  and the watermark does not advance — an API hiccup never reads as "the zone is empty".
- **`check_freshness <name>`** — light, watermark-only: is the source behind, and by how much? Pulls no
  content.
- **`status <name>`** — last sync, watermark, item count, lateness.
- **`list_sources`** — all declared sources and their state.
- **`remove_source <name>`** — de-registers it from the config. Pass `cleanup: true` to also delete the
  synced `.md` files and the sidecar state (the notes leave the vault → the RAG de-indexes them).

## Exploit the sync, and never give a confident false negative (important)

The sync result tells you exactly what just landed — **use it**, don't sync then search blind:

- **After a sync, name what changed.** Report the **titles** of the pages written/updated (and removed),
  not just counts — e.g. *"I pulled in 2 updated pages: **Naxos**, **Onboarding checklist**."* The user
  recognizes their content and trusts the mirror.
- **Before concluding "there's nothing on this in your vault", stop.** A golden source you just synced
  may not be searchable **yet**: the FileWatcher reindexes the new files a moment after they hit disk, so
  the index can briefly **lag the disk**. So:
  - **List the perimeter titles** (cheap — `status` / the just-synced report, or a quick look at
    `vault/golden-sources/<name>/`) before declaring absence. The page may be right there, freshly
    written, just not embedded yet.
  - **Search by the actual title/keywords**, not only by theme — a page titled "Naxos" won't surface
    under "Greek islands" if only its body is matched (and titles are now indexed precisely for this).
  - **Temper confidence**: say *"I just synced it; the index may need a moment — the page **Naxos** is in
    the perimeter"* rather than a flat *"nothing found"*. A confident false negative is the worst outcome.

## What it touches vs NEVER touches

| Touched (golden-source content) | **NEVER touched** |
| --- | --- |
| `vault/golden-sources/<name>/**` (produced Markdown) | your own notes, demo notes, attachments |
| `.golden-source-sync/<name>.state.json` (sidecar, committed, NOT indexed) | `.env` (only read for the token), `CLAUDE.md`, settings |
| `golden-source-sync.config.json` (declarations) | the RAG index/config (it just reacts to the files) |

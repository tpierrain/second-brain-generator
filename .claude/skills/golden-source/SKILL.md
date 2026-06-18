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

> **Scope — golden sources only; do NOT invent other "source types".** This skill mirrors a Notion
> zone into the vault, full stop. When the user asks the **generic** *"I'd like to connect a source"*,
> do **not** improvise a multiple-choice "what type of source?" menu — and **never** offer a "live
> connector / sync delta" option (background Slack/Drive/Calendar live querying is the **separate**
> `sync-sources` mechanism, not this skill; "sync delta" already means a golden source's incremental
> delta — keep the term unambiguous). If you must disambiguate, ask **one neutral line**: *"Do you want
> to **mirror a Notion zone into your vault** as a searchable golden source? (That's what I set up
> here.)"* — then proceed with the onboarding flow below. No invented option list.

> Routing (the harness's job, not the MCP's — PRD §8): when a question is clearly **about a declared
> source's topic** (the `description` you captured at setup), stay **local-first** — exactly like the
> rest of the brain (Slack/Drive/Calendar): **answer NOW from the local RAG**, and verify freshness
> **in the background**, never block the answer on a network sync. See "Local-first routing" below for
> the exact pattern and wording. Sync only the relevant source, never all of them — and only when a
> background freshness check actually reports `behind`.

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
     is in scope; pages outside it are not — see the perimeter disclaimer below).
   - `token_env` — the **name** of the env var that will hold the integration token (e.g.
     `NOTION_TOKEN_PASC`). One token/scope per source.
2. **Guide the token into `.env` — ONE path, no chat paste-block** (only if it isn't set yet).
   `.env` is a *hidden* file a non-dev can't locate, so **don't** ask them to find it, and **don't**
   print a `<token_env>=…` block to copy into the chat (that duplicates what then has to be cleaned up,
   R2-3). Instead run the deterministic helper, **from the brain folder**, which writes a single
   `<token_env>=` placeholder line into `.env` (idempotent — never a second line) and pops their editor
   right on it:
   ```bash
   node scripts/open-env.mjs <token_env>      # e.g. node scripts/open-env.mjs NOTION_TOKEN_PASC
   ```
   Then tell them: *"Your `.env` just opened — paste your Notion token right after `<token_env>=`, save
   (⌘S), and tell me when it's done."* The token stays **in `.env`**, never in the chat (golden rule).
   *(If no editor pops — headless / `SBG_NO_OPEN_ENV` — the command still prints the `.env` path; relay
   it so they can open it themselves.)*

   **How to get that Notion token** (walk a non-dev through it):
   1. Open <https://www.notion.so/my-integrations> → **New integration** → type **Internal** → give it
      a name (e.g. "second brain — PA/SC") → **Save**.
   2. Copy the **Internal Integration Secret** (it starts with `secret_` or `ntn_`) — that's the value
      to paste into `.env`.
   3. **Share the integration on the root page** so the scoped read works: open the root Notion page →
      **•••** (top-right) → **Connections** → add your integration. Without this share, the first sync
      returns **0 pages**.
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
   "0 pages" — relay it as-is, do not pretend it synced. **In the recap, restate the perimeter**: e.g.
   *"27 pages mirrored — the whole sub-tree under \<root>. Pages linked out to other Notion spaces are
   not included (see below)."*

> ⚠️ **Perimeter disclaimer — say this clearly at connection time (and again in the recap).** Only the
> **declared root page and everything beneath it** (its sub-tree of sub-pages) is mirrored. **Pages
> merely *linked* from inside the zone but living in another Notion space / another tree are NOT pulled
> in** — a link is just a link, not a local copy. So the user knows up front what their brain does and
> does **not** hold. Don't let them assume "the whole HUB" includes everything it links to. (Multi-root
> sources / following outbound links is a future option, not the MVP.)

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

## Local-first routing — answer NOW, verify freshness in the background (important)

A golden source is **local-first like every other source in the brain**. On an in-perimeter question,
**never** run a blocking `sync` before answering — that reintroduces exactly the latency the brain's
whole design avoids (Phase 2 doctrine: *answer from local immediately, sync sources in the background*).
The pattern, in order:

1. **Announce the local-first move.** e.g. *"Je te réponds tout de suite avec le local, et je vérifie
   en parallèle."*
2. **Fire `check_freshness <name>` in the background — NOT `sync`.** It is watermark-only (cheap, pulls
   no content), so the answer stays near-instant. Narrate it with the validated 🔄 wording:
   *"🔄 Je lance en tâche de fond un check de fraîcheur sur \<source> (delta Notion) — je complète si ça
   change quelque chose."*
3. **Answer right away from the local RAG.** Don't wait on the network.
4. **Close with a freshness line.** If `check_freshness` reports the delta is empty:
   *"🔄 Mise à jour fraîcheur : \<source> n'a pas bougé, ces infos sont à jour côté source."* Only **if it
   reports `behind`** do you then run `sync <name>` and **amend** the answer with what changed
   (*"🔄 Mise à jour : j'ai trouvé du neuf — …"*).

> Blocking is reserved for the **explicit** case where the user asks for freshness itself ("is it up to
> date?", "resync first"). It is **never** the default. And **don't re-sync a source you connected or
> synced earlier in this same session** — if it was just `setup_source`'d or synced, treat it as fresh
> and skip even the background check unless the user signals otherwise.

**Cap the RAG passes.** On a precise question, do **one targeted** local search (by title/keywords) and
answer. Don't stack 3–4 sequential searches "to be sure" by default — widen to extra/parallel passes
**only** if that first pass comes back thin. Over-searching is the second latency sink after blocking sync.

### Exploit the sync result, and never give a confident false negative

When you *do* sync (because freshness came back `behind`, or the user asked), the result tells you
exactly what landed — **use it**:

- **Name what changed.** Report the **titles** of the pages written/updated (and removed), not just
  counts — e.g. *"I pulled in 2 updated pages: **Naxos**, **Onboarding checklist**."* The user recognizes
  their content and trusts the mirror.
- **Before concluding "there's nothing on this in your vault", stop.** A golden source just synced may
  not be searchable **yet**: the FileWatcher reindexes a moment after files hit disk, so the index can
  briefly **lag the disk**. This safeguard is **cheap and local** — keep it, but decoupled from any
  blocking sync:
  - **List the perimeter titles** (cheap — `status` / the just-synced report, or a quick look at
    `vault/golden-sources/<name>/`) before declaring absence. The page may be right there, freshly
    written, just not embedded yet.
  - **Search by the actual title/keywords**, not only by theme — a page titled "Naxos" won't surface
    under "Greek islands" if only its body is matched (and titles are now indexed precisely for this).
  - **Temper confidence**: say *"the index may need a moment — the page **Naxos** is in the perimeter"*
    rather than a flat *"nothing found"*. A confident false negative is the worst outcome.
- **Flag when a link leaves the mirrored perimeter.** If the answer would rely on a page that is only
  **linked** from the zone but lives outside the declared sub-tree, say so — *"this page is linked from
  the HUB but lives outside the mirrored perimeter, so I don't hold it locally"* — instead of silently
  returning nothing. Same anti-false-negative principle: name the boundary rather than hide it.

## What it touches vs NEVER touches

| Touched (golden-source content) | **NEVER touched** |
| --- | --- |
| `vault/golden-sources/<name>/**` (produced Markdown) | your own notes, demo notes, attachments |
| `.golden-source-sync/<name>.state.json` (sidecar, committed, NOT indexed) | `.env` (only read for the token), `CLAUDE.md`, settings |
| `golden-source-sync.config.json` (declarations) | the RAG index/config (it just reacts to the files) |

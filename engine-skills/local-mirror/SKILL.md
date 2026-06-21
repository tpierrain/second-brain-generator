---
name: local-mirror
description: "Declare and refresh a LOCAL MIRROR — a one-way local copy of a chosen zone of an internal tool (Notion today) replicated into this brain's vault as Markdown, so the LOCAL RAG can search and cite it OFFLINE. A mirror is a 'synchronized source' kept locally: copied once, then refreshed on demand. Use when the user wants to mirror / replicate / copy a Notion zone locally, declare / set up / connect a local mirror, refresh / sync / update one (e.g. 'mirror the Team A zone from Notion', 'refresh my product mirror', 'réplique cette zone Notion en local', 'mets en place un miroir local pour ce Notion', 'mets en place une synchronisation miroir avec ce Notion', 'fais que mon cerveau puisse chercher dans ce Notion'), check whether one is behind, list them, or remove one. DO NOT use this skill when the user simply wants to read, write, create, edit, fetch or SEARCH Notion content live and ad hoc — that is the job of the NATIVE Notion connector (a different tool); this skill is ONLY for mirroring a Notion zone locally for the RAG. When the intent is genuinely ambiguous (durable / offline / 'puisse chercher' → mirror; one-off / live / now → native connector), ask the balanced 2-option question first. The actual work runs in the local-mirror MCP server; this skill is the thin conversational driver."
version: 1.0.0
---

# /local-mirror — Mirror a live internal source into your vault (opt-in, safe)

> Brain-side skill. A **local mirror** (a *copie miroir* / *réplica locale*) is a zone of an
> internal tool (Notion for the MVP) that you declare once; the brain then **mirrors its pages
> into `vault/mirrors/<name>/` as plain Markdown**. From there the existing RAG indexes and cites
> them like any other note — *the central RAG you don't have yet, but local and right now, plugged
> onto your live sources.*
>
> ⚠️ **This skill holds no logic.** All the real, testable work lives in the **`local-mirror`
> MCP server** (its own package, Outside-in TDD). This skill only **recognizes intent, gathers the
> declaration, guides the token into `.env`, calls the right MCP tool, and reports.**

## First — a local mirror, or the native Notion connector? (don't mix them up)

A brain can touch Notion **two completely different ways**. Put yourself in the user's shoes and route
to the right one **before** doing anything:

- **They just want to read, write, create, edit, fetch or search something in Notion — live, ad hoc?**
  → that's the **native Notion connector** (the brain's general, real-time Notion access:
  `notion-fetch`, `notion-search`, `notion-create-pages`, …). **NOT this skill.** Let that connector
  handle it; do **not** onboard a local mirror for it.
- **They want a sub-zone of Notion replicated locally** so the **local RAG** can search & cite it —
  offline, framed, refreshed on demand, without re-querying Notion every time? → **that's a local
  mirror. This skill.** (Mirror = one-way read-only copy into the vault; this skill never writes back
  to Notion.)

> 🧭 **One-line litmus:** *live read/write in the ocean → native Notion connector; a local **mirror** of
> a slice of the ocean for the RAG → local mirror (this skill).*

### Disambiguate first — the balanced 2-option question (don't guess)

The exact fault line is a phrasing like *"je veux que mon cerveau puisse chercher dans ce Notion"*. It
can mean either tool. When the intent is **genuinely ambiguous**, don't assume — **ask one honest,
balanced question** (not a sales funnel that pushes the mirror):

> *Two ways, depending on your need:*
> *— **one-off, live** (native connector): I read Notion directly, right now. Always up to date, but
>   online, basic search, and it doesn't stay in your brain's memory;*
> *— **durable (local mirror)**: I copy this zone once, then your brain searches it **semantically
>   (RAG)**, **offline**, **cites** it, and crosses it with the rest of your notes — in exchange you
>   ask me to **refresh** it when the source changes.*
> *Given your phrasing I'd lean toward the **local mirror** — shall I set it up?*

**Discriminators** — only ask when it's actually unclear:
- **durable / recurring** ("puisse", "à chaque fois", "qu'il garde", "hors-ligne") + **citable** →
  **local mirror** (this skill).
- **one-off / live / now** ("lis", "va voir", "cherche maintenant") → **native connector**, not this skill.

If the discriminators clearly point one way (e.g. *"mets en place un miroir local pour ce Notion"* →
obviously a mirror; *"va me lire cette page Notion"* → obviously the connector), **don't** ask — just
route. The question is for the genuine grey zone, not a reflex.

## When to use it

Load this whenever the user wants to work with a local mirror, in any language:

- *"mirror / replicate / set up a local mirror of a Notion zone"* — onboarding → `setup_source`
- *"refresh / sync / update the `<name>` mirror"* — delta + deletions → `sync`
- *"is `<name>` up to date? / what's its status?"* — → `check_freshness` / `status`
- *"list my local mirrors"* — → `list_sources`
- *"remove / disconnect the `<name>` mirror"* — → `remove_source`

> **Scope — local mirrors only; do NOT invent other "source types".** This skill mirrors a Notion
> zone into the vault, full stop. When the user asks the **generic** *"I'd like to connect a source"*,
> do **not** improvise a multiple-choice "what type of source?" menu — and **never** offer a "live
> connector / sync delta" option (background Slack/Drive/Calendar live querying is the **separate**
> `sync-sources` mechanism, not this skill; "sync delta" already means a mirror's incremental delta —
> keep the term unambiguous). If you must disambiguate, ask **one neutral line**: *"Do you want to
> **mirror a Notion zone into your vault** as a locally-searchable copy? (That's what I set up here.)"*
> — then proceed with the onboarding flow below. No invented option list.

> Routing (the harness's job, not the MCP's — PRD §8): when a question is clearly **about a declared
> mirror's topic** (the `description` you captured at setup), stay **local-first** — exactly like the
> rest of the brain (Slack/Drive/Calendar): **answer NOW from the local RAG**, and verify freshness
> **in the background**, never block the answer on a network sync. See "Local-first routing" below for
> the exact pattern and wording. Sync only the relevant mirror, never all of them — and only when a
> background freshness check actually reports `behind`.

## Terminology — what to call it when speaking to the user

In **English**, say **"local mirror"** (or just "mirror"). In **French**, lead with **« copie miroir »**
or **« réplica locale »**; **« source synchronisée »** is fine *as a property*, but **always framed
local / chez toi / hors-ligne** so it never drifts back into the ambiguous native-connector "sync".
**Never** use "golden source" / "source de vérité" anymore — they over-claim and confuse. Mirror the
user's own wording when they have one. The **identifiers stay English everywhere** regardless of the
spoken language: the skill name `local-mirror`, the frontmatter key `mirror`, the folder
`vault/mirrors/<name>/`, the MCP tools — never translate those.

## Golden rule — the token NEVER travels through the chat

The Notion integration token is a secret. It goes **only into `.env`**, referenced by name
(`token_env`) — **never** pasted into the conversation, **never** passed as a tool argument, **never**
committed. The `setup_source` tool takes the **name of the env var**, not the token.

## Onboarding flow (`setup_source`)

1. **Gather the declaration** (ask in chat, conversationally):
   - `name` — short technical id = the vault subfolder (e.g. `team-a`). Lowercase, no spaces.
   - `title` — human label (e.g. "PA / SC zone").
   - `description` — the **topics** this mirror covers, in natural language. This is the **routing
     key**: it's how you'll later know which question should refresh which mirror.
   - `root_page_url` — the URL of the **root Notion page** of the zone to mirror (its whole sub-tree
     is in scope; pages outside it are not — see the perimeter disclaimer below).
   - `token_env` — the **name** of the env var that will hold the integration token (e.g.
     `NOTION_TOKEN_PASC`). One token/scope per mirror.
2. **Guide the token into `.env` — ONE path, no chat paste-block** (only if it isn't set yet).
   ⚠️ **Settle `token_env` FIRST.** Gather *and confirm the exact var name with the user* (step 1)
   **before** writing anything — `open-env.mjs` writes that name as a placeholder line, so a name you
   later change leaves a stale `NOTION_TOKEN_<wrong>=` line behind (the PERSO→FACTURE placeholder dance).
   Only once the name is agreed, proceed.
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

   **How to get that Notion token** (walk a non-dev through it; the full screenshot guide is
   [`docs/notion-token-setup.md`](../../../docs/notion-token-setup.md) — point them there if they want pictures):
   1. Open <https://app.notion.com/developers/connections> → **+ New connection** → give it a name (e.g.
      "second-brain-mirroring"), authentication method **Access token**, pick the workspace → **Create
      connection**. (On the Configuration tab, keep capabilities read-only — **Read content** only.)
   2. **Grant page access** so the scoped read works: **Content access** tab → **Edit access** → search/tick
      the **root page** of the zone → **Save**. Without this, the first sync returns **0 pages**.
   3. Back on **Configuration**, **copy the Access token** (starts with `ntn_`) — that's the value to paste
      into `.env`.
3. **Narrate, then call `setup_source`.** `setup_source` and the first sync are a **single, silent,
   possibly long call** (no live progress): it explores the whole perimeter, then downloads & converts
   every page. **Before** calling it, tell the user what's about to happen and roughly how long — e.g.
   *"I'll connect, explore the zone (a few seconds to ~1 min on a large one), then download & convert each
   page — this can take a minute or two; I'll report what came in."* — so the wait doesn't read as a
   freeze. Then call it with the five fields. It **tests the scope** (a scoped search that returns only
   the zone), does the **first sync**, writes the config (`local-mirror.config.json`, the versioned
   source of truth) and the sidecar state, and returns a step-by-step `message`.
4. **Report** what came back — **from the structured `setup_source` result**, and if you want to
   double-check where things landed, **from the `status <name>` tool** (it returns config, watermark,
   item count and last-sync state). ⚠️ **Never verify the sync with a compound shell command**
   (`cd … && cat … && ls … && find …`) — that triggers a needless permission prompt and the tools
   already give you the answer deterministically. A **0-pages** result means "the integration is not
   connected to the root page yet" → have the user share it, then re-run. An **enumeration/401 error**
   is distinct from "0 pages" — relay it as-is, do not pretend it synced. **In the recap, restate the
   perimeter**: e.g. *"27 pages mirrored — the whole sub-tree under \<root>. Pages linked out to other
   Notion spaces are not included (see below)."*
   - ⚠️ **Reconcile the two counts the user will see.** `setup_source` reports *"N pages mirrored"*
     (written to disk); moments later an OS toast says *"N notes ready to search"* (the RAG watcher
     finished indexing). These are the **same content at two stages** — "written to disk" → "indexed &
     searchable" — **not** two conflicting totals. Frame it that way so the second number doesn't read
     as a surprise, e.g. *"27 pages copied locally; you'll get a 'ready to search' notification once
     they're indexed (a few seconds)."* (Small off-by-some differences are normal — empty pages produce
     no searchable note.)

> ⚠️ **Perimeter disclaimer — say this clearly at connection time (and again in the recap).** Only the
> **declared root page and everything beneath it** (its sub-tree of sub-pages) is mirrored. **Pages
> merely *linked* from inside the zone but living in another Notion space / another tree are NOT pulled
> in** — a link is just a link, not a local copy. So the user knows up front what their brain does and
> does **not** hold. Don't let them assume "the whole HUB" includes everything it links to. (Multi-root
> mirrors / following outbound links is a future option, not the MVP.)
>
> ⚠️ **Attached files aren't extracted.** Only the page's **Notion text** is mirrored — **embedded PDFs
> and Google Slides are NOT extracted** into the vault. Say so at connection time, and flag it again at
> use-time when a question would need a file's contents (the brain can't cite what it never indexed). If
> the user needs those facts searchable, have them paste the key points into the Notion page as text.

> The produced `.md` files land in `vault/mirrors/<name>/`. The **existing FileWatcher** indexes
> them and the **auto-commit hook** commits them — `local-mirror` is unaware of the RAG (PRD §7).
> Nothing else to wire on a freshly-installed brain: the server is already declared in `.mcp.json`.

## Already-installed brain that predates this feature

If the `local-mirror` tools aren't available as first-class `mcp__local-mirror__*` tools (a brain
installed before this engine version), **you can still set up the mirror right now, without any
restart** — drive the `local-mirror` module **directly** (run `setup_source` via the module code; its
deps install on first use). **A restart is only needed _later_**, and only if the user wants the
`mcp__local-mirror__*` tools available as first-class tools in the session (the MCP list is frozen at
session start). So: **do the onboarding now**, and mention the restart only as an optional follow-up —
never present it as a blocking prerequisite. *(On the CLI you can confirm the tools with `/mcp`; in the
Desktop app `/mcp` opens the connectors **Directory**, not the local server list, so don't rely on it
there — just check whether the tools respond.)*

The one-time wiring (so a **future** session exposes the tools as first-class):

1. Add the server block to `.mcp.json` (idempotent — skip if already present):
   ```json
   "local-mirror": { "type": "stdio", "command": "npx",
     "args": ["tsx", "local-mirror/src/server.ts"], "cwd": "<brain-root>", "env": {} }
   ```
   (On a bare-PATH desktop app, point it at the self-heal launcher instead — `command: "/bin/sh",
   args: ["local-mirror/launch.sh"]` on macOS/Linux, the `.cmd` on Windows — exactly like
   `vault-rag`.)
2. Install its deps once: `cd local-mirror && npm install`.
3. **To pick up the new server as first-class tools** (optional, later): in the **Desktop app**, the
   reliable way is to **quit & relaunch Claude Desktop, then reopen the _same_ conversation** — do **not**
   tell the user to "open a new conversation" (it spawns a duplicate of a pinned/named conversation and
   can leave two windows on one vault). On the **CLI**, relaunch `claude` in the brain folder.

> Note: neither the onboarding nor the per-mirror **token** requires a restart — the token is read fresh
> from `.env` at call-time (F3), and you can drive the module directly today. A restart only ever serves
> to expose the `mcp__local-mirror__*` tools as first-class tools in a session.

> Running `/update-engine` delivers the server's code and launchers to such a brain automatically;
> this manual wiring only covers the `.mcp.json` entry, which is per-machine and never overwritten.

## Maintenance tools

- **`sync <name>`** (or `"all"`) — pulls the delta and reconciles deletions for one mirror. A page
  renamed → same file rewritten; a page deleted or moved out of scope → its `.md` removed. **Guardrail:**
  if the perimeter enumeration fails (network/401/429), **zero deletions** happen, the run is `partial`,
  and the watermark does not advance — an API hiccup never reads as "the zone is empty".
- **`check_freshness <name>`** — light, watermark-only: is the mirror behind, and by how much? Pulls no
  content.
- **`status <name>`** — last sync, watermark, item count, lateness.
- **`list_sources`** — all declared mirrors and their state.
- **`remove_source <name>`** — de-registers it from the config. Pass `cleanup: true` to also delete the
  synced `.md` files and the sidecar state (the notes leave the vault → the RAG de-indexes them).

## Local-first routing — answer NOW, verify freshness in the background (important)

A local mirror is **local-first like every other source in the brain**. On an in-perimeter question,
**never** run a blocking `sync` before answering — that reintroduces exactly the latency the brain's
whole design avoids (Phase 2 doctrine: *answer from local immediately, sync sources in the background*).
The pattern, in order:

1. **Announce the local-first move.** e.g. *"Je te réponds tout de suite avec le local, et je vérifie
   en parallèle."*
2. **Fire `check_freshness <name>` in the background — NOT `sync`.** It is watermark-only (cheap, pulls
   no content), so the answer stays near-instant. Narrate it with the validated 🔄 wording:
   *"🔄 Je lance en tâche de fond un check de fraîcheur sur \<mirror> (delta Notion) — je complète si ça
   change quelque chose."*
3. **Answer right away from the local RAG.** Don't wait on the network.
4. **Close with a freshness line.** If `check_freshness` reports the delta is empty:
   *"🔄 Mise à jour fraîcheur : \<mirror> n'a pas bougé, ces infos sont à jour côté source."* Only **if it
   reports `behind`** do you then run `sync <name>` and **amend** the answer with what changed
   (*"🔄 Mise à jour : j'ai trouvé du neuf — …"*).

> Blocking is reserved for the **explicit** case where the user asks for freshness itself ("is it up to
> date?", "resync first"). It is **never** the default. And **don't re-sync a mirror you connected or
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
- **Before concluding "there's nothing on this in your vault", stop.** A mirror just synced may
  not be searchable **yet**: the FileWatcher reindexes a moment after files hit disk, so the index can
  briefly **lag the disk**. This safeguard is **cheap and local** — keep it, but decoupled from any
  blocking sync:
  - **List the perimeter titles** (cheap — `status` / the just-synced report, or a quick look at
    `vault/mirrors/<name>/`) before declaring absence. The page may be right there, freshly
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

| Touched (local-mirror content) | **NEVER touched** |
| --- | --- |
| `vault/mirrors/<name>/**` (produced Markdown) | your own notes, demo notes, attachments |
| `.local-mirror/<name>.state.json` (sidecar, committed, NOT indexed) | `.env` (only read for the token), `CLAUDE.md`, settings |
| `local-mirror.config.json` (declarations) | the RAG index/config (it just reacts to the files) |

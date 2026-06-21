# PRD — `golden-source-sync`: synchronizing the second brain's golden sources

> **For:** the Claude working on the *Second Brain Installer* project.
> **Purpose:** frame the solution to package/bundle into the second brain. Self-contained document.
> **Status:** design frozen, implementation to do. First demo target: a second brain answers a
> business question while citing a **golden source**.
>
> **In one line (the promise):** the central RAG you don't have yet — but **local, right now**,
> plugged onto your live internal sources.
>
> **Vocabulary:**
> - **`golden-source-sync`** = the **engine / MCP server** that **synchronizes** golden-source content
>   into the vault. It is the name visible in `/mcp` (explicit by construction).
> - **"a Notion golden source synced onto `<zone>`"** = on the user side, **one instance**: a golden
>   source whose connector is Notion, pointed at a zone. That is what we install ("set up the sync of a
>   Notion golden source on the Team A hub").
>
> **Amendments applied when integrating this PRD into the repo** (consistent with the action plan +
> ADR 0022): config file is **JSON** (`golden-source-sync.config.json`, §20.4 resolved); the module
> is described with plain **hexagonal architecture (ports & adapters)**, *not* "The Hive" (this is an
> MCP, not a modular-monolith application — §5); the wording is uniformly **"synchronize a golden
> source's content"** (no "vacuum" metaphor).

---

## 0. The idea in one sentence

We promote a first-class concept — the **Golden Source** — and we ship **`golden-source-sync`, an MCP
that declares golden sources and synchronizes their content into the vault**, kept up to date. Once the
files are in the vault, **the second brain already does the rest on its own**: auto-indexing
(FileWatcher) and auto-commit/push (hook). `golden-source-sync` **does not touch the RAG** and **exposes
no search**: it feeds the vault, full stop.

## 1. Problem & positioning

A second brain (local semantic RAG) can only answer on what it has indexed. We want to **plug it onto
live internal golden sources** (Notion first, but not only), so it answers **framed + sourced + up to
date**, with no copy-paste and no manual reindex.

### Who it's for — and why now

In an ideal world, there would be a **central search platform**: a central MCP, a single **hosted
index**, plugged in real time onto all internal sources, available to everyone — including those who
don't have a second brain. That is the **target** (cf. §19 Trajectory). That platform **does not exist
yet** in the company.

`golden-source-sync` is the **local-first** mode in the meantime: rather than waiting for central
infrastructure, **each person synchronizes locally** their second brain with the golden sources that
concern them. Zero infra to operate, zero dependency on a third-party platform, it works today. It is a
**pragmatic, autonomous** mode — assumed as a **stepping stone**, not the end of the story: same concept,
same vault contract, same connectors as the central target; **only hosting and distribution will
change** (cf. §19), not the code.

> **In plain terms:** when the central search infrastructure does not exist (or not for you),
> `golden-source-sync` replaces it **locally** — one source at a time, on the zone that concerns you.
> The day the central platform arrives, we switch over without rewriting the engine.

**MVP target:** the "knowers" who **already have a second brain** and want to plug live internal sources
into it **right now**, without waiting for a central platform. Pilot case: Thomas, golden source Team A
(team workflows).

> **User-facing counterpart:** the "why & when" of a golden source is surfaced for end users in
> [CONNECTORS.md → "Why a golden source"](../../CONNECTORS.md#-why-a-golden-source--and-when-its-not-worth-it)
> (with the target-vs-local diagram). Keep the two in sync when the positioning evolves.

## 2. Central concept: the Golden Source

A **Golden Source** = a live reference documentary source, reflected in the second brain. It is
**declared** (not coded):

| Field | Role |
|---|---|
| `name` | short technical id = **name of the subfolder** in the vault (e.g. `team-a`). |
| `title` | human label. |
| `description` | **natural-language text** of the topics covered. **Routing key**: the agent matches the question against it to know *when/which* source to refresh. |
| `connector` | type (`notion` \| `drive` \| `slack` \| …) + config. **For Notion: the root page URL** (golden-source-sync extracts the page id from it) + the name of the env var holding the token. |
| `target_dir` | dedicated subfolder of the vault (e.g. `golden-sources/team-a`). |

Example (Notion config via **URL**, JSON):

```json
{
  "golden_source": {
    "name": "team-a",
    "title": "Team A — team workflows",
    "description": "Questions about invoices, the support process, billing, the Sample error catalog.",
    "connector": {
      "type": "notion",
      "config": {
        "root_page_url": "https://www.notion.so/acme/Page-...-0123abc...",
        "token_env": "GOLDEN_TEAM_A_NOTION_TOKEN"
      }
    },
    "target_dir": "golden-sources/team-a"
  }
}
```

> This config file is the **versioned source of truth** of the declared golden sources. It is *written*
> by the `setup_source` tool (guided creation UX), not hand-edited — cf. decision §20.2.

## 3. End-user promises

- **Bounded + sourced answers** (extract + Notion link). No invention.
- **The right passage, not just the right page** (semantic search, ensured by the RAG).
- **Up to date by itself**: change the source → the second brain picks up the delta and uses it.
- **Pluggable sources**: Notion today, Drive/Slack tomorrow — same concept, same vault, same capabilities.

## 4. Architecture — we don't touch the RAG

```
   ┌──────────────────────────────────────────────────────────────┐
   │ SECOND BRAIN (the agent / Claude)                             │
   │   routes questions, triggers syncs, cites its sources         │
   └───────────────┬───────────────────────────┬──────────────────┘
                   │ MCP (declare/sync/setup)   │ MCP (search)
                   ▼                            ▼
   ┌───────────────────────────────┐  ┌───────────────────────────────┐
   │ golden-source-sync (NEW)      │  │ existing RAG (vault-rag)      │
   │  golden-source registry       │  │  chunk + embed + search        │
   │  + connectors (pluggable SPI) │  │  NOT modified                  │
   │  + watermark + private state  │  └───────────────▲────────────────┘
   │  writes files, FULL STOP      │                  │
   └───────────────┬───────────────┘                  │ (auto, already in place)
                   │ writes/deletes .md                │ FileWatcher → indexes
                   ▼                                   │ hook → git commit/push
                   └──────────► VAULT ◄────────────────┘
                                golden-sources/<name>/<pageId>.md
```

**`golden-source-sync` writes files, and that's all.** The second brain **already** has: a
**FileWatcher** that auto-indexes vault files, and a **hook** that auto-commits/pushes. So
`golden-source-sync`:
- **does not index** (the FileWatcher does it when it sees files change),
- **does not commit** (the hook does it — otherwise race / double commit),
- **has no awareness of the RAG**. The only useful "awareness" is *negative*: "the vault is watched +
  auto-committed, so I neither index nor commit — I write/delete files cleanly".

**Decoupling via the filesystem.** golden-source-sync and the RAG **never** talk directly: the only
point of contact is the **vault** (a folder of files). This is deliberate — it keeps the two modules
independent and makes "where/how to deploy" a packaging variable.

**Connectors = pluggable SPI ports.** `golden-source-sync` is a single-responsibility module. **MVP:
one adapter, `NotionConnector`.** The seam exists (Drive/Slack later), but we only implement Notion now.
Detail of the hexagonal decomposition (API/SPI ports): §5.

**Why an MCP (not a script):**
- A second brain **interacts natively** with an MCP.
- The MCP is a **portable, stable packaging unit** (stdio/JSON-RPC, the tool surface = a frozen
  contract). We will want to distribute `golden-source-sync` other than bundled locally (central,
  remote MCP, plugin) → "where/how to deploy" becomes a **packaging variable, not a rewrite**.

## 5. Hexagonal decomposition (ports & adapters)

`golden-source-sync` is a single, self-contained **local MCP** with a clean **API port**, and the MCP
surface is merely a **driving adapter** on top of it. (This is plain hexagonal architecture — *not*
"The Hive": it's an MCP, not a modular-monolith application.) We start with one source type (Notion);
**ports & adapters** is precisely what lets us add more golden-source types later without touching the
core.

**API port (driving side) — `IGoldenSourceSync`.** The domain contract, transport-independent. The MCP
tools (§9) are a **1:1 translation** of this port; one could drive it from a CLI or HTTP without touching
the domain.
- `setupSource(req) → SetupResult`
- `listSources() → SourceState[]`
- `sync(name | "all") → SyncReport`
- `checkFreshness(name) → FreshnessReport`
- `status(name) → SourceStatus`
- `removeSource(name, cleanup?) → RemoveResult`

> The MCP server (stdio/JSON-RPC, `@modelcontextprotocol/sdk`) is the **driving adapter**: it validates
> the arguments (zod), calls the API port, serializes the result. **No business logic in the adapter.**
> That is what makes "where to deploy" (local, remote, plugin) a packaging variable (§4).

**SPI ports (driven side) — everything external is stubbable.**
- `ISourceConnector` — `{ listItems(), fetchContent(item), lastEditedTime(item) }`. **MVP:
  `NotionConnector`** (Drive/Slack later).
- `IVaultWriter` — `{ write(path, content), delete(path) }`, **atomic write** (temp + rename). Filesystem
  adapter.
- `IStateStore` — `{ load(name), save(name, state) }`. Adapter on the sidecar
  `.golden-source-sync/<name>.state.json` (§10).
- `IClock` — to make watermark/timestamping **deterministic in tests**.

**No outbound coupling — the absence of coupling is a choice.** golden-source-sync **calls no other
module** — least of all the RAG (that's the whole point). The decoupling from the RAG is done **via the
filesystem** (§4). Conversely, the day a central orchestrator wants to drive golden-source-sync, it will
consume its **API port** — hence the value of having that clean port now, independent of MCP.

## 6. What `golden-source-sync` writes into the vault (thin contract)

The contract is NOT "the RAG's internal format". It is just: **write good Markdown files in the right
folder, cleanly.**

- **1 source item (Notion page) = 1 `.md` file** under `vault/golden-sources/<name>/`.
- **Named by the stable Notion ID**, not by the title: `<pageId>.md` (or `<slug>--<pageId>.md`). → a
  page **renamed** in Notion rewrites the **same** file instead of creating a new one + orphaning the
  old. The title goes into the frontmatter.
- **Mandatory frontmatter** (this is *what golden-source-sync writes*, not a RAG requirement):
  - `source_url`: Notion URL → **indispensable for the citation** (without it, the second brain cannot
    cite the link).
  - `last_edited_time`: Notion edit date → watermark.
  - `golden_source`, `source_id`, `title`.
- **Atomic write**: write to a temp file then `rename` → the FileWatcher never indexes a half-written file.
- **Delta only**: only rewrite files whose page changed (content hash). Rewriting the whole corpus on
  every sync = pointless reindexing (embedding quota) + noise commits.

> `golden-source-sync` does **not** trigger reindexing and does **not** commit: it writes/deletes files,
> the FileWatcher and the hook do the rest.

## 7. Lifecycle & structuring (the critical point)

The watermark catches **edits and additions**. It does **not** catch **deletions** or **scope exits**
(page deleted, moved out of zone). Without reconciliation, the RAG keeps indexing — and the second brain
keeps **citing** — dead content.

**Reconciliation mechanism:**
- `golden-source-sync` keeps a **private state** per golden source: `pageId → { last_edited_time,
  vault_path, hash }` + the watermark (exact schema: §10).
- This state lives in a **sidecar OUTSIDE the indexed vault**: `/.golden-source-sync/<name>.state.json`
  at the repo root. → **committed** (continuity across laptops, like the RAG's DB) but **not
  watched/indexed** by the FileWatcher (otherwise it would end up in the index).
- On each sync: enumerate the current Notion perimeter, compare to the state → **write** new/modified
  (delta), **delete** the `.md` whose source page disappeared, **update** the state.

**⚠️ Deletion guardrail (non-negotiable):** delete a `.md` **only if the perimeter enumeration fully
succeeded**. An API error (token, network, truncated pagination) must **never** be read as "empty
perimeter" → otherwise catastrophic deletion of the whole corpus. No complete and reliable enumeration →
we **skip** the deletion phase and **log** it (cf. §12).

**De-index on deletion: OK (confirmed, tested).** The existing RAG correctly purges a deleted file from
its index. So: remove a Notion page → delete the corresponding `.md` → the page leaves the index. Nothing
more to do on the RAG side.

**Resulting structure:**
```
vault/golden-sources/team-a/<pageId>.md   ← synced · indexed (FileWatcher) · never hand-edited
.golden-source-sync/team-a.state.json      ← private state · committed · NOT indexed
```

## 8. Freshness & routing (no read-through, no search)

`golden-source-sync` does not expose `search` → freshness is not triggered inside a search request, but
via the second brain's **existing Phase 1/2/3 flow**:

```
question ──► immediate answer from the already-indexed vault              ① Phase 1
   │
   └─Phase 2─► the agent reads the golden sources' `description`,
              spots the ones the question concerns,
              calls golden-source-sync.sync(name) on them
                   │  freshness check (watermark) → if behind:
                   ▼  synchronize the delta + reconcile deletions → write/delete .md
                   ▼  (the FileWatcher reindexes, the hook commits)
              amends the answer if something new arrived                   ③ Phase 3
```

- **Routing is a HARNESS rule, not `golden-source-sync` code.** "Which source to refresh given the
  question" lives in the second brain's prompt/CLAUDE.md (via the `description`). `golden-source-sync`
  stays a deterministic engine (registry + sync + watermark + reconciliation). Do not bake this behavior
  into the MCP, otherwise we trap something specific inside it.
- **Lateness detection (Notion):** `search` (Notion API) sorted by `last_edited_time` ↓, scoped by the
  token. ⚠️ editing a **sub-page** does not bubble up the **parent's** `last_edited_time` → watermark =
  **max of the perimeter**.
- **No cron** → it only refreshes while a session is open (24/7 = the central target).

## 9. MCP surface — exposed tools (no `search`)

Each tool is the translation of a method of the `IGoldenSourceSync` API port (§5).

| Tool | Role |
|---|---|
| `setup_source` | **Interactive onboarding** of a source: receives the root page URL + the token env-var name, **tests the connection/scope**, does the 1st sync, **explains each step**, reports OK/KO. (cf. §13) |
| `list_sources` | Lists the declared golden sources + their state. |
| `sync` | Synchronizes the delta + **reconciles deletions** for one source (`name`) or all (`all`). Returns what changed. |
| `check_freshness` | Light check (watermark): behind? by how much? Without pulling anything. |
| `status` | A source's state: last sync, watermark, item count, lateness. |
| `remove_source` | De-registers a source (and optionally cleans up its folder + its sidecar). |

> No `search` (that's the RAG). No reindex/commit tool (that's the FileWatcher + the hook).

## 10. The `state.json` sidecar contract

A golden source's private state. One file per source, outside the indexed vault, **committed**.
Persistence **incrementally (per item)** → at worst one item is lost at the quota/network wall, never the
whole batch; free resume on the next run.

```jsonc
// .golden-source-sync/team-a.state.json
{
  "schemaVersion": 1,
  "name": "team-a",
  "connector": "notion",
  "rootPageId": "0123abc…",
  "watermark": "2026-06-15T09:32:00.000Z",  // max(last_edited_time) of the perimeter at the last SUCCESSFUL sync
  "lastSyncAt": "2026-06-15T09:35:12.000Z",
  "lastSyncStatus": "ok",                     // "ok" | "partial" | "failed"
  "items": {
    "<pageId>": {
      "title": "Sample error catalog",
      "vaultPath": "golden-sources/team-a/<pageId>.md",
      "lastEditedTime": "2026-06-12T14:21:00.000Z",
      "contentHash": "sha256:…",              // hash of the PRODUCED MARKDOWN (not the raw Notion JSON)
      "lastWrittenAt": "2026-06-12T14:30:00.000Z"
    }
  }
}
```

- `contentHash` is over the **produced markdown**, not the raw Notion JSON → robust to insignificant
  changes (Notion metadata moving without changing the text) → fewer pointless rewrites/reindexes.
- `watermark` = **max of the perimeter** (cf. sub-page trap §16). Advanced **only if the sync fully
  succeeded** (`lastSyncStatus: "ok"`), otherwise a partial sync would miss edits on the next run.
- `schemaVersion` → future migration without breakage.
- `items` is the **reconciliation map**: what is no longer there but still has a `.md` = candidate for
  deletion (under the §7 guardrail).

## 11. Auth & security — Notion connector

1. `notion.so/profile/integrations` → **New integration** → **Internal**, **Read content** only.
2. Get the `ntn_…` secret.
3. **Scope = connect the root page** to the integration (••• → Connections). Access **cascades** over
   the whole sub-tree, and **nothing else**.
4. **Config by URL**: the user pastes the **root page URL**; golden-source-sync extracts the page id.
   (Human name → URL resolved by Claude if needed.)
5. Check: the scoped `search` only returns the zone. 0 pages = root not connected.

**Non-negotiable security:**
- Token in an **env var** (`token_env`), **never committed, never re-displayed in clear** by Claude.
  `setup_source` guides the user to place it in the env; it does not let it travel through Claude's
  context.
- Widening/narrowing the perimeter = connecting/disconnecting pages in Notion. **Zero code.**
- ⚠️ Creating an integration is sometimes **admin-only**.

## 12. Notion robustness — errors, rate-limit, resume

The engine hits a remote API: it must fail **cleanly and without damage**. Guiding principle: **when in
doubt, we don't write and above all we don't delete** — we log and resume on the next run.

- **Rate-limit (429).** The Notion API caps (~3 req/s on average). Respect `Retry-After`, exponential
  backoff + jitter, retry cap. Beyond that → `partial` sync, keep the existing, resume next run.
- **Pagination.** `search` and `blocks.children.list` paginate (`start_cursor` / `has_more`, 100 max).
  **Always page through completely**: a truncated enumeration makes it look like pages disappeared →
  false deletions. Incomplete pagination ⇒ **no deletion reconciliation** (guardrail §7).
- **Invalid token / lost scope (401).** Distinguish **"0 pages because not connected"** from **"auth
  error"**. On 401: clear message ("reconnect the root page to the integration"), **no write, no
  deletion**. Never re-display the token (§11).
- **Timeout / fetching a large page.** Bounded retry; as a last resort, **skip that page keeping its
  previous version** — never overwrite a valid `.md` with emptiness.
- **Sync interrupted mid-way.** Per-item persistence (§10) → free resume; `lastSyncStatus: "partial"`
  until the perimeter has been fully traversed, watermark not advanced.
- **Idempotence.** A sync replayed with no upstream change = **no-op** (hash): no write, no commit, no
  reindex.
- **Single-writer lock** per golden source (§14) → two concurrent syncs don't trample each other.

## 13. Installation — two layers

An MCP that hasn't been launched yet can't "install itself". Hence two layers, with a clean split
(aligned on the **determinism** principle: the intelligence for conversation = Claude; the mechanical
checks = `golden-source-sync`):

**Layer 1 — Bootstrap (one-time), by a skill/installer.**
User trigger: **"sync the `<zone>` golden source from Notion"**.
The skill: adds `golden-source-sync` to the second brain's MCP config, creates `golden-sources/` and
`.golden-source-sync/`. (Before golden-source-sync runs → it can't be golden-source-sync.)

**Layer 2 — Source onboarding (repeatable), by `golden-source-sync` itself.**
Once `golden-source-sync` is running, its **`setup_source`** tool drives:
1. **Zone resolution**: the user said "on `<zone>`". Claude resolves the human name → **root page URL**
   (Notion search + confirmation), or the user pastes the URL.
2. `golden-source-sync` **asks the remaining questions** (token via env) → Claude **relays** them to the
   user.
3. `golden-source-sync` **tests**: does the scoped `search` only return the zone? (0 pages = root not
   connected → clear message).
4. **1st sync** (+ writing the sidecar) → **verifies** → **explains what's happening** at each step.

Split: *the user names the target · Claude resolves zone→URL and dialogues · the skill bootstraps the
MCP · `golden-source-sync` onboards/tests/syncs/explains.*

## 14. Technical stack (recommended)

> Aligned on the existing RAG: **TypeScript (ESM)**, not .NET. Same building blocks as `vault-rag` to
> stay homogeneous and installable on the second brain side.

- **Runtime / language**: TypeScript + `tsx`, ESM (`"type": "module"`), like `rag/`.
- **MCP**: `@modelcontextprotocol/sdk` (same SDK as the RAG). Tool schemas validated by **`zod`**.
- **Notion SDK**: `@notionhq/client`. **Conversion**: `notion-to-md` (no home-made converter).
- **Frontmatter**: `gray-matter` (same lib as the RAG → consistent frontmatter).
- **Concurrency**: a single-writer lock **per golden source** (avoid two concurrent syncs) — same spirit
  as the RAG's lock, but **specific to golden-source-sync** (not a coupling to the RAG).
- **State/watermark**: sidecar `.golden-source-sync/<name>.state.json`, incremental persistence (§10).
- **Deterministic engine**, connectors = SPI adapters testable alone.

## 15. Test strategy (Outside-in)

Development in **outside-in TDD**: coarse-grained acceptance tests, driven by the **driving (MCP-shaped)
adapter**, SPI ports stubbed. (Method: skill `outside-in-diamond-tdd`; discipline: skill
`tdd-discipline`.)

- **Scope under test = the whole module**: API port `IGoldenSourceSync` + domain. **We test at the API
  port level, not the MCP transport** (the MCP server is a thin adapter, tested separately / by smoke
  test).
- **SPI ports stubbed**: `ISourceConnector` (Notion) returns a **controlled page perimeter**
  (scripted add/edit/delete/rename); `IClock` freezes time; `IVaultWriter`/`IStateStore` → in-memory
  fakes **or** a real `tmpdir` depending on the test.
- **Builder** that wires the Domain Service (the concrete API port) with its SPI stubs and returns the
  port — `aGoldenSourceSync().withNotionPages([...]).build()`.
- **Varied data**: generate pageIds, titles, contents with varied values (no hard-coded constants) to
  reveal hidden assumptions (the *Diverse* / fuzzing spirit, in TS).
- **Stack**: **`node:test`** runner + `tsx` (like the RAG: `node --import tsx --test src/**/*.test.ts`),
  test doubles by hand or via `node:test`'s `mock`.

**Pivotal acceptance scenarios** (each drives a step): 1st sync writes N `.md` + frontmatter; rename →
same file; deletion → `.md` deleted; **enumeration error → NO deletion** (guardrail §7); sub-page edit
detected (watermark = max); no-change sync = no-op; two sources without perimeter leak.

## 16. Notion specifics (the first connector's traps)

1. **Everything is a page, pages nest.** A Notion golden source = a root page + its tree.
2. **Access cascades.** Connect the root only → it sees everything below, nothing else.
3. **`last_edited_time` does not bubble up.** Watermark = max of the perimeter.
4. **Databases**: special pages made of rows (pages); the sync traverses nested databases.
5. **Confidentiality**: a second brain is **private**, so no leak stake in itself. The only need is to
   **isolate each golden source's receptacle** (already covered by `target_dir`: a dedicated subfolder,
   to follow the lifecycle and synchronize cleanly between the source and that destination). There
   remains a real question of **read access model** (who sees what) → cf. §20.1.

## 17. Acceptance criteria (MVP)

- [ ] `setup_source` with a root page **URL** + token env → tests the scope, does the 1st sync, explains
      the steps.
- [ ] Read-content scoped token → access to the sub-tree only (0 pages if root not connected).
- [ ] Sync produces `golden-sources/<name>/<pageId>.md`: frontmatter `source_url` + `last_edited_time` +
      `golden_source`; **atomic write**.
- [ ] The existing FileWatcher indexes these files **with no RAG change**; the hook commits them.
- [ ] **Rename** of a Notion page → rewrites the same file (no duplicate/orphan).
- [ ] **Deletion / scope-exit** of a page → the `.md` is deleted and **purged from the index** (verify
      FileWatcher de-index on delete).
- [ ] **Perimeter enumeration error (429/401/network) → NO deletion**; sync marked `partial`, watermark
      not advanced.
- [ ] **Sub-page** edit detected (watermark = max of the perimeter).
- [ ] Delta only: a no-change sync rewrites nothing (no noise commit/reindex).
- [ ] Routing: a PA question → refreshes `team-a`, not `team-b`.
- [ ] **Bounded + clickable citation** answer; no secret in the repo/logs; two sources without perimeter
      leak.

## 18. Implementation sequencing (MVP milestones)

Outside-in: we start from an acceptance test at the **API port** with stubbed SPI, then fill the
adapters. Each milestone is shippable and tested.

1. **Module skeleton + API port + MCP transport.** `IGoldenSourceSync` defined, tools declared (zod),
   `list_sources` answers empty. 1st acceptance test red→green at the API port (all SPI stubbed).
2. **VaultWriter (SPI) + atomic write.** 1 item → 1 `.md` frontmatter (temp+rename). Criterion: the
   FileWatcher indexes it.
3. **StateStore + watermark + delta.** Sidecar §10; a sync only rewrites what changed (hash). Idempotence.
4. **NotionConnector (SPI), read-only.** `listItems` (scoped search + full pagination), `lastEditedTime`,
   `fetchContent` (`notion-to-md`). Tested alone.
5. **Deletion reconciliation + reliable-perimeter guardrail** (§7) — the riskiest step, isolated on
   purpose.
6. **`setup_source` (onboarding).** Scope test, 1st sync, step-by-step explanation (§13).
7. **`check_freshness` / `status` / `remove_source`.**
8. **End-to-end (the demo).** PA question → harness routing → `sync(team-a)` → FileWatcher reindexes →
   **bounded + clickable citation** answer.

## 19. Trajectory (out of MVP)

Same concept, same vault contract, same connectors. The target only changes hosting + distribution +
multi-sources, **not the `golden-source-sync` code** (cf. positioning §1):

| | MVP (today) | Target (later) |
|---|---|---|
| Form | a second brain syncing its golden sources | central service for everyone |
| For whom | knowers (have a second brain) | everyone, even without a second brain |
| Connectors | Notion | Notion + Drive + Slack + … |
| Freshness | at the question (Phase 2, routed sync) | push webhooks (real time) |
| Index | local, N copies | 1 single hosted index |
| Infra | zero (local MCP) | central service to host/operate |

> This MVP-vs-target contrast is mirrored for end users in
> [CONNECTORS.md → "Why a golden source"](../../CONNECTORS.md#-why-a-golden-source--and-when-its-not-worth-it)
> (target-central-MCP vs local Golden Source diagram). Update both together.

## 20. Decisions & residual points

### 20.1 Read access model — **settled for the MVP: Option A**

For **synchronization**, the Notion API needs **broad** access to the perimeter (the zone's integration
token, which sees the whole sub-tree). For **reading**, one might want to filter by a person's rights.

- **A — Shared integration token** *(retained for MVP)*: a token scoped on the zone sees the whole
  sub-tree; whoever queries this second brain sees everything that was synced. Simple, no per-person
  filtering.
- **B — Per-user access (Notion OAuth per person)** *(deferred to the central target)*: the read layer
  only surfaces what **the user** has access to in Notion. Natively respects rights, but imposes two
  paths (broad sync vs filtered read).

**Decision:** **A** now. Rationale = the **local-first positioning** (§1): the MVP is a **personal,
single-user** second brain (Thomas, Team A) — per-rights filtering only makes sense in **multi-user with
heterogeneously-permissioned sources**, which is precisely the **central target** (§19). We note that the
"sync API (broad access) vs filtered read view" split is already natural in the target architecture → B
will plug in without renouncing A.

### 20.2 Declaring golden sources — **settled: both (convergence)**

- **Versioned config file** (`golden-source-sync.config.json`) = **source of truth**. Declarative,
  reproducible, git-reviewed, trivial migration between laptops.
- **`setup_source` (MCP tool)** = guided, conversational **creation UX**, tested in the process.

**Decision:** these are **not** two worlds. `setup_source` **writes** the config file (and the sidecar
§10); `golden-source-sync` reads the file at startup. The file stays the versioned source of truth;
`setup_source` is the **guided way to feed it** — one does not hand-edit it day-to-day.

### 20.3 Name — settled

MCP server name: **`golden-source-sync`** (decided). Explicit in `/mcp` (server + tools `setup_source` /
`sync` / `list_sources` / `status`), and semantically right (the tool *synchronizes*; the *sink* is the
vault). Rejected: `golden-source-sink` (homophone of `sync` → reading ambiguity, the opposite of the goal).

### 20.4 Genuinely still open

- **Config file format**: **resolved to JSON** when integrating this PRD (`golden-source-sync.config.json`)
  — zero new dependency, validated by `zod`, consistent with the sidecar (the PRD originally left YAML vs
  JSON open).
- **Model B (per-user OAuth)**: detailed design to do when the central target (§19) is on the table —
  out of MVP.

---

*Framing document — to be confronted with the reality of the second brain installer and amended. Choices
deliberately settled: Golden Source as a first-class concept; **local-first** positioning (an autonomous
alternative to central search infrastructure that does not exist yet — §1); `golden-source-sync` has no
awareness of the RAG (it writes files, the FileWatcher + the hook do indexing/commit); a clean API port +
pluggable SPI ports (MVP Notion-only); no `search`; naming by page id + deletion reconciliation under a
guardrail via the `.golden-source-sync/` sidecar state; two-layer install (bootstrap skill +
`setup_source`); Notion config by URL; routing by `description` on the harness side; read access = shared
token for the MVP (§20.1); config = versioned source of truth written by `setup_source` (§20.2).*

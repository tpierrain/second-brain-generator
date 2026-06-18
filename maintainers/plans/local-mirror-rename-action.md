# Rename `golden-source-sync` → `local-mirror` (component + concept)

> **Why.** While reviewing PR #12, Thomas judged "golden source" / "sync" to be confusing:
> *every* MCP is a connector that syncs, and "golden source" is his own jargon that over-claims
> (it is not necessarily *the* authoritative source). The feature is really a **one-way local
> mirror** of a chosen external zone (Notion today) into the vault, so the local RAG can search &
> cite it **offline**. We rename to make that legible to everyone.

## Decisions (locked)

- [x] **MCP component name** = `local-mirror` (was `golden-source-sync`)
- [x] **Skill name** = `local-mirror` (was `golden-source`) — same word as the MCP, on purpose:
      one concept = one name. Skill and MCP live in different namespaces → no technical clash, and
      a single name kills the "is it source- or local-?" vocabulary confusion.
- [x] **User-facing vocabulary** (product, localized): lead with **« copie miroir »** / **« réplica
      locale »**, and **« source synchronisée »** as a *property* (always framed "locale / chez toi /
      hors-ligne" so it never drifts back into the ambiguous native-connector "sync"). **Drop**
      "golden source" AND "source de référence" from the live product.
- [x] **Execution** = one pass, **two atomic commits** (Lot 1 identity, Lot 2 concept), each green.
- [x] **Branch** stays `golden-source-sync` (dies at merge — renaming a branch with an open PR is
      pure hassle for zero gain).
- [x] **Release codename** = **"The One Where Notion Moves Into Your Brain"** (v3.2.0) *(confirmed)*
- [x] **Runtime persisted names** (2b): sidecar `.local-mirror/`, config `local-mirror.config.json`,
      vault subfolder `vault/mirrors/<name>/` *(confirmed)*

### The disambiguation we designed (must land in the rewritten SKILL.md)

When a user says *"je veux que mon cerveau puisse rechercher dans ce Notion"* — the exact fault line
with the **native Notion connector** — the brain must **ask** (don't guess), with an **honest,
balanced** 2-option question (not a sales funnel):

> *Two ways, depending on your need:*
> *— **one-off, live** (native connector): I read Notion directly, now. Always up to date, but
>   online, basic search, and it doesn't stay in your brain's memory;*
> *— **durable (local mirror)**: I copy this zone once, then your brain searches it **semantically
>   (RAG)**, **offline**, **cites** it, and crosses it with the rest — in exchange you ask me to
>   **refresh** it when the source changes.*
> *Given your phrasing I'd go with the **local mirror** — shall I set it up?*

Discriminators: durable/recurring ("puisse", "à chaque fois") + offline/citable → mirror;
one-off/live/now → native connector. Only ask when genuinely ambiguous.

## Tracking

- [x] **Lot 1 — component identity → `local-mirror`** *(2026-06-18 · `1857af5`)*
  - [x] `git mv golden-source-sync/ → local-mirror/`
  - [x] `src/index.ts` `SERVER_NAME`, `src/server.ts` comment + log tags
  - [x] `.mcp.json.template` server key + args path
  - [x] `CLAUDE.md.template` tool prefixes `mcp__local-mirror__*`
  - [x] `rag-launcher.mjs` (server.ts paths, `mcpServers["local-mirror"]`, launch.sh/.cmd) + test
  - [x] `engine-manifest.json` (paths, `engineMcpServers`, `engineVersion` key), `package.json` name
  - [x] `installer.mjs`, `update-engine.mjs` paths, `.gitignore`
  - [x] **Green**: local-mirror 84/84, harness 295/295, tsc 0, boot smoke `[local-mirror]` OK
- [x] **Lot 2a–c — purge "golden source" from CODE** *(2026-06-18 · `a898506`)*
  - [x] **2a. Domain**: class `GoldenSourceSync` → `LocalMirror`, iface → `ILocalMirror`,
        file `golden-source-sync.ts` → `local-mirror.ts` (+ imports), comments
  - [x] **2b. Data contracts + persisted names**: config key `golden_sources` → `mirrors`,
        frontmatter `golden_source` → `mirror`, vault subfolder `golden-sources/` → `mirrors/`
        (no RAG coupling), sidecar `.local-mirror/`, config `local-mirror.config.json`
  - [x] **2c. Launcher fns** `*GoldenSource*` → `*LocalMirror*` + call sites + test
  - [x] **Green**: local-mirror 84/84, harness 295/295, rag 178/178, all tsc 0, boot smoke OK
- [x] **Lot 2d–e — docs + skill rewrite** (commit 3, the judgment part) *(2026-06-18)*
  - [x] **2d. Skill rename + rewrite**
    - [x] `git mv .claude/skills/golden-source/ → .claude/skills/local-mirror/`
    - [x] `SKILL.md` `name:` + **`description:` trigger** — catches « réplica locale / copie locale /
          source synchronisée / miroir local / synchronisation miroir / "que mon cerveau puisse chercher
          dans ce Notion" », KEEPs the native-connector disambiguation, drops "golden source" / "source
          de référence"
    - [x] added the **"Disambiguate first"** section (balanced 2-option question)
    - [x] body wording + persisted paths (`vault/mirrors/`, `local-mirror.config.json`, `.local-mirror/`)
          + the bootstrap `.mcp.json` snippet (server key `local-mirror`, `launch.sh`)
    - [x] `/golden-source` skill references in `SETUP.md` → `/local-mirror`
  - [x] **2e. Docs**: `CONNECTORS.md` (heading 🪞 + mermaid + anchor), `SETUP.md`, `README.md`,
        `maintainers/README.md`, `CLAUDE.md.template`, `docs/notion-token-setup.md` (anchor re-pointed)
        prose → "local mirror / copie miroir"; dropped "golden source"
  - [x] **2f. Green**: local-mirror 84/84, tsc 0 (markdown-only — harness/rag unaffected) → commit 3
- [x] **Lot 3 — archives: DO NOT rewrite** (ADRs 0023/0024, plans `golden-source-*`,
      `prd-golden-source-sync.md` = history, Thomas's no-rewrite rule). Added the *optional* forward-note
      line in **ADR 0022** (renamed `golden-source-sync` → `local-mirror`); ADR body kept verbatim.
- [ ] **Ship** (on Thomas's green light)
  - [x] update **PR #12** title/body with the release codename (EN; pre-flight EN check) *(2026-06-18)*
  - [ ] `/code-review` → fix findings TDD, commit-only-green
  - [ ] manual QA on a fresh disposable brain installed from the branch
  - [ ] merge → tag **v3.2.0** → archive this plan (`git mv` to `archived/` + STATUS ✅ with proof) →
        purge test brains

## Open decisions — RESOLVED

- [x] **2b names** — sidecar `.local-mirror/`, config `local-mirror.config.json`, vault subfolder
      `vault/mirrors/<name>/` *(confirmed 2026-06-18)*.
- [x] **Release codename** — "The One Where Notion Moves Into Your Brain" (v3.2.0).

## Context for a fresh session (after `/clear`)

- Branch `golden-source-sync`, **not pushed since Lot 1** (`1857af5` is local). PR #12 open.
- Test commands: MCP suite `cd local-mirror && npm test` (+ `npm run typecheck`); harness
  `node --test $(find . -name '*.test.mjs' -not -path '*/node_modules/*')`.
- macOS has no `timeout`; boot smoke = self-terminating node spawn (see this session's history).
- Untracked, pre-existing, NOT part of this work — leave out of commits: `local-mirror/qa-driver.mts`,
  `rag/qa-search.mts`, `maintainers/plans/golden-source-qa-*-feedback.md`.
- Memory pointer: `golden-source-sync-progress.md` — update with the rename once Lot 2 ships.

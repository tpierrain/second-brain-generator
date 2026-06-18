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
- [ ] **Release codename** (Friends style, "The One…"): recommended **"The One Where Notion Moves
      Into Your Brain"** (alt: "…Moves In With Your Brain"). Likely **v3.2.0**. *Thomas to confirm.*

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
- [ ] **Lot 2 — purge the "golden source" CONCEPT** (commit 2)
  - [ ] **2a. Domain code rename**
    - [ ] class `GoldenSourceSync` → `LocalMirror`; interface `IGoldenSourceSync` → `ILocalMirror`
    - [ ] file `src/domain/golden-source-sync.ts` → `src/domain/local-mirror.ts` (`git mv`)
    - [ ] fix imports: `index.ts`, `server.ts`, `test/builder.ts`, `test/sync-all.test.ts`
    - [ ] comments in `domain/types.ts`, `domain/ports.ts`, `lib/markdown.ts`, etc.
  - [ ] **2b. Runtime persisted names** *(decide first — see Open decisions)*
    - [ ] sidecar dir `.golden-source-sync/<name>.state.json` → `.local-mirror/…`
    - [ ] config file `golden-source-sync.config.json` → `local-mirror.config.json`
    - [ ] vault subfolder `vault/golden-sources/<name>/` → e.g. `vault/mirrors/<name>/`
    - [ ] touches: `lib/config.ts`, `adapters/fs-state-store.ts`, `adapters/fs-config-store.ts`,
          `domain/ports.ts`, `domain/types.ts`, tests (`config.test.ts`, `fs-config-store.test.ts`,
          `fs-state-store.test.ts`), `CLAUDE.md.template` (line ~180)
  - [ ] **2c. Launcher fn names** (concept): `buildGoldenSource*Launcher`, `applyGoldenSourceLauncher`
        → `*LocalMirror*` in `rag-launcher.mjs` + call sites (`installer.mjs`, `update-engine.mjs`,
        `server.ts`) + `rag-launcher.test.mjs`
  - [ ] **2d. Skill rename + rewrite**
    - [ ] `git mv .claude/skills/golden-source/ → .claude/skills/local-mirror/`
    - [ ] `SKILL.md` `name:` + **`description:` trigger** — catch « réplica locale / réplication /
          copie locale / source synchronisée / "que mon cerveau puisse chercher dans ce Notion" »,
          KEEP the native-connector disambiguation, drop "golden source" / "source de référence"
    - [ ] add/Update the **"Disambiguate first"** section (balanced 2-option question above)
    - [ ] body wording + the bootstrap `.mcp.json` snippet (server key `local-mirror`)
    - [ ] `/golden-source` skill references in `SETUP.md` → `/local-mirror`
  - [ ] **2e. Docs**: `CONNECTORS.md`, `SETUP.md`, `maintainers/README.md`, `CLAUDE.md.template`
        prose → "local mirror / copie miroir"; drop "golden source"
  - [ ] **2f. Green**: local-mirror suite, harness suite, tsc 0 → commit 2
- [ ] **Lot 3 — archives: DO NOT rewrite** (ADRs 0022/0023/0024, plans `golden-source-*`,
      `prd-golden-source-sync.md` = history, Thomas's no-rewrite rule). *Optional*: one forward-note
      line in ADR 0022 ("component since renamed `local-mirror`").
- [ ] **Ship** (on Thomas's green light)
  - [ ] update **PR #12** title/body with the release codename (EN; pre-flight EN check)
  - [ ] `/code-review` → fix findings TDD, commit-only-green
  - [ ] manual QA on a fresh disposable brain installed from the branch
  - [ ] merge → tag **v3.2.0** → archive this plan (`git mv` to `archived/` + STATUS ✅ with proof) →
        purge test brains

## Open decisions (need Thomas before Lot 2b)

- [ ] **2b names** — propose: sidecar `.local-mirror/`, config `local-mirror.config.json`, vault
      subfolder **`vault/mirrors/<name>/`** (shorter than `local-mirrors`, and the folder is already
      under the brain = "local" is implied). OK, or other?
- [ ] **Release codename** final pick.

## Context for a fresh session (after `/clear`)

- Branch `golden-source-sync`, **not pushed since Lot 1** (`1857af5` is local). PR #12 open.
- Test commands: MCP suite `cd local-mirror && npm test` (+ `npm run typecheck`); harness
  `node --test $(find . -name '*.test.mjs' -not -path '*/node_modules/*')`.
- macOS has no `timeout`; boot smoke = self-terminating node spawn (see this session's history).
- Untracked, pre-existing, NOT part of this work — leave out of commits: `local-mirror/qa-driver.mts`,
  `rag/qa-search.mts`, `maintainers/plans/golden-source-qa-*-feedback.md`.
- Memory pointer: `golden-source-sync-progress.md` — update with the rename once Lot 2 ships.

# DEVELOPING — context for working on the generator itself

> This file is for **whoever develops the template** (you + Claude), not the end
> user. Read it at the start of a dev session to get the context.

## Project goal

`second-brain-generator` is an **installable template** for a second brain: a versioned
Markdown vault that a Claude Code agent queries in natural language via a RAG engine.
Extracted from a personal second brain to be reusable by anyone.

**Guiding principle**: ship a *generator*, not a ready-made brain. The engine is ready;
the harness is a template the user adapts. Stay **generic and neutral** — no personal
data, no company name, no real person's name.

## 3-layer architecture

- 🟢 **Engine** (`rag/`) — TypeScript MCP server: chunking, **à la carte** embeddings (in-process / key / Ollama), semantic
  search, quota guardrails, single-writer lock. Generic. Tests: `cd rag && npm test`
  (must stay green), typecheck: `cd rag && npx tsc --noEmit`.
- 🟡 **Harness** — `*.template` files (`CLAUDE.md.template`, `.mcp.json.template`,
  `.claude/settings.json.template`) + generic skills (`sync`, `improve`) +
  `.claude/skills/EXAMPLES.md`. The installer generates the real files from the templates.
- 🟢 **Onboarding** — `installer.mjs` (foolproof installer, pure Node → multi-OS), example
  `vault/`, `README.md`, `SETUP.md`. The hooks (`scripts/session-status.mjs`,
  `scripts/auto-commit.mjs`) are also in Node → no bash/jq/sqlite3 dependency, works on
  macOS / Linux / Windows.

> 📁 **`maintainers/`** — versioned dev context (decisions/ADRs, plans), **synced across
> the maintainer's machines** but **never shipped** to the user (excluded from the install copy
> via `filterCopyable`, not auto-loaded by Claude). See [`maintainers/README.md`](maintainers/README.md).
> This is where the decision history lives — this folder replaces the old Claude "memory",
> which wasn't portable between laptops.

### Design note — Claude-driven onboarding

Two install paths coexist (README "Option A / B"): **manual** (`node installer.mjs`
interactive) and **Claude-assisted** (a single natural-language instruction). The guiding
principle of the assisted path is **determinism**: everything mechanical + critical + repeatable stays
**in the script** (generation, `git init`, RAG install, self-judged smoke test); **Claude is
just a conversational wrapper** — it gathers the answers in chat, calls **a single command**
`--non-interactive`, relays the script's verdict, then handles the 3 final instructions (`.env` key,
remote repo, restart). We do **not** hand off the install sequence to Claude. The `CLAUDE.md`
bootstrap stub (marker `installer-stub`) carries that runbook; `scripts/lib/installer-args.mjs`
(`parseAnswers`, `resolveTargetDir`) and `scripts/lib/tracked-files.mjs` (`parseLsFilesZ`,
`filterCopyable`) are its pure, tested building blocks.

### Design note — hooks via `run-node.*` (the desktop app's minimal PATH)

Claude Desktop's Code tab launches the **hooks** (and MCP servers) in a
**non-interactive, minimal-PATH shell** — measured on a bare Mac: `PATH=/usr/local/bin`, without the
`nvm`/`asdf` shims or `/opt/homebrew/bin`. If `node` was installed via **nvm** or Homebrew, it is then
**unreachable**: a hook that calls `node …` directly **fails SILENTLY**. The worst part —
the **auto-commit** never runs → notes get written to disk but are never versioned
(the central promise, broken without a sound). This is the "silent failure" anti-pattern the project
fights.

**Fix.** The 3 hook commands in `.claude/settings.json.template` go through `{{NODE}}` (resolved
by the installer per OS) instead of `node` directly → a **self-heal** launcher `scripts/run-node.*`
that replays the same proven PATH prepend as the RAG server (`scripts/lib/rag-launcher.mjs`,
`buildNodeRunnerSh/Cmd`), then `exec node "$@"`. Portable, **no machine path baked in** (we only
prepend the existing folders, nvm glob included). The installer **smoke-tests** `run-node` at
install time (`-e "process.exit(0)"`): a failure = **loud install** (non-zero exit), not a warning.
On top of that, `scripts/session-status.mjs` **shouts at startup** (via `scripts/lib/repo-status.mjs`)
if any vault notes were left **uncommitted** — turning a future auto-commit failure into a visible
alert rather than silence.

**Smoke test under an impoverished PATH (real proof, not a false positive).** The smoke test no longer runs
`run-node` with the install shell's rich PATH (where `node` is always reachable → it was in fact
only testing "does node exist somewhere?"). It now goes through `minimalPathEnv(platform, env)`
(`scripts/lib/rag-launcher.mjs`), which **neutralizes the PATH** (posix: `""`; Windows: just
`System32` to keep `cmd.exe`) while preserving `HOME`/`LOCALAPPDATA`/etc. that the self-heal
needs. We thus prove, **at install time and under real desktop-app conditions**, that the wrapper ALONE
finds node — and an **uncovered** manager fails **loudly and early** (an actionable message
listing the supported locations) rather than silently at runtime. The self-heal's **coverage**
is a **curated list** (POSIX: `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, asdf,
nvm, volta, nodenv, fnm Linux+macOS; Windows: nodejs, npm, Volta, `NVM_SYMLINK`) — not an
exhaustive enumeration: the impoverished smoke test is the **safety net** for everything else.

## Dev rules

1. **Manual commits.** No auto-commit hook in this repo (it only exists in
   `.claude/settings.json.template`, generated on the user's side). After progress:
   `git add -A && git commit -m "..." && git push`.
2. **Neutrality.** Before any commit, check for leaks:
   `grep -rniE "<names/companies to exclude>" .` must come up empty. No hardcoded absolute path
   (except `{{PROJECT_ROOT}}` placeholders in the templates).
   **Deliberate exception — Thomas Pierrain (`tpierrain`) himself.** The rule forbids
   **third-party** names (colleagues, clients, employers), but **not** the repo owner and author of
   the method: this public repo also serves as **personal branding**. Citing "Thomas Pierrain" /
   `@tpierrain` and his Medium articles ("second brain" series) is **intended**, not a leak —
   do not genericize or remove them (the README in particular).
3. **Generated files not versioned.** `.mcp.json`, `.claude/settings.json`, `.env`,
   `rag/.cache/`, `node_modules/` are gitignored. Do not commit them.
   **Exception — the "bootstrap stub" `CLAUDE.md`.** A `CLAUDE.md` **is** shipped at the root, but it's
   a **pre-install bootstrap stub**: it carries the marker `<!-- second-brain-generator:installer-stub -->`
   and signals to Claude that the repo isn't installed yet (→ guides the user toward
   `node installer.mjs`). The installer **replaces** it with the real personalized `CLAUDE.md`: the
   detection is in `scripts/lib/claude-md.mjs` (`isInstallerStub`), wired into `gen()` in
   `installer.mjs`. A `CLAUDE.md` **without** that marker (= a real user constitution) is
   always **preserved**. So: **do not delete** this stub, and only touch it via the marker.
4. **Test the installer in a throwaway copy** (never in place), so as not to pollute the
   template with generated files / `node_modules`:
   ```bash
   # non-TTY stdin → the installer goes into non-interactive mode (default values)
   cp -R . /tmp/sbg-test && cd /tmp/sbg-test && node installer.mjs < /dev/null
   ```
5. **Keep the engine syncable** with the source second brain: `rag/` has stayed nearly
   identical to the original → fixes can be ported back and forth either way.
6. **Strict TDD on all code — engine AND harness.** Detailed, actionable discipline
   in the **`tdd-discipline`** skill (`.claude/skills/tdd-discipline/`, loaded as soon as you write
   code): baby-steps, fail-first, triangulation, mandatory refactor. It applies to
   **all the repo's logic**, not just the engine:
   - **RAG engine** (`rag/`): tests `rag/src/lib/*.test.ts`, green suite `cd rag && npm test`
     + typecheck `cd rag && npx tsc --noEmit`.
   - **Harness / installer** (`installer.mjs`, `scripts/lib/*.mjs`): tests
     `scripts/lib/*.test.mjs`, green suite `node --test scripts/lib/*.test.mjs`.

   Every change goes **red → green → refactor**: write the failing test first,
   see it red for the right reason, then the minimum code to make it green, then refactor while
   green. Deliberate and **explicitly flagged** exception: the purely mechanical / not unit-testable
   (renaming, a message, trivial config, the Gemini network integration) — no artificial test
   just for form's sake.
7. **Resuming a multi-session plan — the "one open PR of mine" convention (harness rule).** *Rationale &
   rejected alternatives: [`maintainers/decisions/0013-resume-via-single-open-pr.md`](maintainers/decisions/0013-resume-via-single-open-pr.md).* Long plans
   run across several fresh sessions (one big step per window, to avoid context rot). So that the
   maintainer **never has to say where we are or which branch**, resumption is anchored on **his open
   PR**, and this is a standing rule — **not to be re-described each time**:
   - **Invariant: at most ONE open PR authored by the maintainer (`tpierrain`) at a time.** The agent
     **must refuse to open a second** while one of his is open, and must **never merge/close** it on its
     own. (Other people's / bots' open PRs don't count — scope strictly to `author:tpierrain`.) This is
     what removes any ambiguity (and merge-conflict risk) about which work is "in flight".
   - **Resume = "reprends le plan où on en était sur la PR ouverte".** The agent then: lists the **open
     PRs authored by `tpierrain`** → expects **exactly one** → **checks out its head branch** → reads
     that branch's **Progress checklist** in the active plan under `maintainers/plans/` → does **the
     first unchecked `- [ ]` big step**. The open PR is discoverable from **any** starting branch (even
     `main`), which closes the gap where the work branch's name only lived on the work branch.
   - **Ambiguity → make him pick from a menu; never guess, never require him to recall names.** If it
     finds **several** of his open PRs, it **lists them** (number, title, head branch, last-updated) and
     asks him to **choose which to resume** via `AskUserQuestion` — he selects from the menu, with **no
     need to know any PR/branch name by heart**. If it finds **zero**, it asks whether to start one. It
     **never** picks one on its own. This keeps the everyday command dead-simple while removing the
     multi-PR conflict risk.
   - **Source of truth = the plan's checklist** on the PR branch (ticked in the step's finishing commit);
     the **PR body mirrors it** for at-a-glance tracking. The per-plan **Session protocol** section
     spells out the step-by-step etiquette (stop-and-ask before each next big step, etc.).
   - *Note:* a local hook can't stop a human from clicking "New PR" on GitHub; this rule binds **the
     agent's** behaviour (never opens a 2nd, flags any extra it sees), which covers the practical risk.

8. **Cross-platform parity — Mac AND Windows are first-class, at parity (HARD requirement).** *Rationale:
   [`maintainers/decisions/0015-cross-platform-parity.md`](maintainers/decisions/0015-cross-platform-parity.md).*
   The generator, the installer, the Engine and every hook/launcher **must work on macOS, Linux AND
   Windows** — Windows is not a "later" target, it is a release gate. Concretely, on **any** change:
   - **Never ship a POSIX-only path.** Any shell launcher gets **both** a `.sh` **and** a `.cmd` variant
     (`run-node.{sh,cmd}`, `launch.{sh,cmd}`); the `engine-manifest.json` `regenerate` bucket must list
     **both**. A new launcher with only one half is a regression.
   - **Pure Node at the core** (no `bash`/`jq`/`sqlite3`/`sed` dependency in hooks or the installer);
     spawn external tools cross-platform (`process.platform` switch), never assume a POSIX shell.
   - **Paths:** build with `path`/`path.posix` as appropriate, normalise JSON-stored paths to `/`
     (`toPosix`), never hardcode `/` separators or `$HOME`-only expansions; resolve via env, not literals.
   - **No Unix-only commands** (`open`, `xdg-open`, `start` all have OS variants — see
     `CLAUDE.md.template` Obsidian/timestamp blocks for the pattern).
   - **Verify the Windows half**, at least by unit test on the `win32` branch (as `run-node` already does),
     even when the dev machine is a Mac. ⚠️ Known carve-out: **in-process embedder excludes Intel Macs**
     (`darwin/x64`) — that's a documented hardware limit (ADR 0007), not a license to drop Windows.

## Improvement ideas (informal backlog)

- ~~Optional external connectors (Slack/Drive/Notion)~~ ✅ shipped: guided wizard at step
  5/8 of the installer (catalog `scripts/lib/connectors-catalog.mjs` + idempotent merge
  `connectors-merge.mjs`/`connectors-apply.mjs`), docs `SETUP.md §6`. Next: enrich the
  catalog (more community MCP connectors) as needed.
- ~~Local embedder (100% private mode)~~ ✅ shipped (D1, ADR 0007): embedder choice at install
  (fully-local in-process **EmbeddingGemma** / API key / Ollama) via `EMBEDDING_PROVIDER`
  (`rag/src/lib/config.ts` + adapters `in-process-embedder.ts` / `openai-compatible-embedder.ts`),
  adaptive recommendation based on the machine (`scripts/lib/embedder-choice.mjs`, 12 GB threshold). Nothing leaves in
  fully-local/Ollama mode. **Not yet shipped** next step: a "big machine" profile (reranker, GraphRAG — ADR 0008).
- ~~Installer: `--non-interactive` option~~ ✅ shipped: `parseAnswers` (`scripts/lib/installer-args.mjs`)
  → flags `--name/--owner/--lang` (+ env `SB_*`, precedence flag > env > default),
  `--non-interactive`/`--yes`/`--no-input`; **never the Gemini key** (deferred to `.env`).
  The installer CREATES the brain folder (TARGET, cf. `resolveTargetDir`/`--dest`) and does a trivial `git init`
  in it (fresh folder, 0 remotes). Docs: `SETUP.md §2`. Next: a variant with an answers file
  if needed for CI / re-provisioning.
- Internationalization: the templates are in French. Plan an EN variant?
- Actually functional example skills (a generic `prepare-meeting` wired to Calendar).

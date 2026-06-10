# SETUP — Detailed installation & customization

## 1. Prerequisites

| Tool | Why | Installation |
|---|---|---|
| **Node.js ≥ 18** | Runs the RAG engine **and** the whole harness (installer + hooks are in Node, cross-OS) | https://nodejs.org (macOS: `brew install node` · Windows: `winget install OpenJS.NodeJS`) |
| **git** | Versioning + portability across machines | https://git-scm.com |
| **Claude Code** | The agent that queries the vault | https://claude.com/claude-code |
| **Gemini key** *(optional)* | Embeddings — **only if you choose the Gemini embedder** (see note below) | https://aistudio.google.com/apikey |

> 🧩 **The Gemini key is no longer mandatory (D1, ADR 0007).** At install time, you choose your
> **embedding engine** among 3 options, with a **recommendation tailored to your machine**:
> **1. Fully on your machine** ("Gemma inside", `in-process`) — 🟢 private + free + offline,
> **nothing to install** (recommended if ≥ 12 GB of RAM and not an Intel Mac);
> **2. API key** — Gemini, OpenAI, or your company's endpoint (⚠️ "free ≠ private": Gemini's
> free tier may exploit your data; paying a few cents/month makes it private);
> **3. Local via Ollama** (advanced). Only option 2-Gemini requires the key above; options
> 1 and 3 write `EMBEDDING_PROVIDER` to `.env` (see `.env.example`) and **skip the key step**.

> **Cross-OS**: macOS, Linux and Windows (cmd or PowerShell). The installer and hooks
> are in Node — no need for bash, `jq` or `sqlite3`. Node is the only runtime prerequisite.

> ⚙️ **Node via `nvm`/Homebrew? It's handled.** The Claude Desktop app launches hooks with a minimal
> PATH where a `node` installed by `nvm` or Homebrew would be unfindable (the hooks would then fail
> **silently** — auto-commit would no longer save your notes). The installer generates a
> small launcher `scripts/run-node.*` that finds `node` on its own before each hook, and **verifies
> at install time** that it succeeds — by **simulating the app's minimal PATH**, so the proof is
> real (otherwise the install fails loudly). You have nothing to configure.
> If the install **fails** this smoke-test, it means your `node` is in an **unusual** location
> (the launcher covers `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, asdf, nvm,
> volta, nodenv, fnm — and on Windows nodejs, npm, Volta, `NVM_SYMLINK`). Solution: reinstall
> `node` via one of these paths (e.g. `nvm` or Homebrew), or report your case so we can add it.

> 🔒 **Privacy**: on the **free tier**, Gemini may use your content to improve its products
> (human review possible). For a **confidential** vault, enable **billing** (paid tier). On the
> Claude side, also consider disabling sharing for improvement. **Details in §9 (Data privacy).**

### 1.1 Get your Gemini key — a 2-minute affair

No need to touch the Google Cloud console: everything is done via **Google AI Studio**, in
a few clicks.

1. Open **<https://aistudio.google.com/apikey>** and sign in with a Google account.
2. Click **"Create API key"**.
3. Let AI Studio **create a project automatically** (or pick an existing one) — there's nothing
   else to configure.
4. **Copy the key** (it looks like `AIza…`).
5. Paste it into `<brain>/.env`, on the `GOOGLE_GEMINI_API_KEY=` line (never in the chat nor as a
   command argument — see guardrails §troubleshooting).

That's it: the **free tier is active immediately**, no credit card required to get started.

> 💳 **Switching to paid** (recommended for a confidential vault — see §9): in AI Studio, open
> the key and **enable billing** on its project (a Google Cloud billing account, created once). The
> cost stays in the range of a few cents (see the chart in §9).
>
> ⚠️ An API key is a **secret**: never commit it, never share it. It lives in `.env`,
> which is gitignored.

## 2. Installation

> **One launcher, one brain — two folders.** The installer runs from the **launcher** (this
> cloned repo) and **creates a separate brain folder** where it generates all your config. The
> launcher stays **read-only** and **reusable** (multiple brains from a single launcher). The name of
> the brain = `--name` (or the "Brain name" question); its location = `--dest` (default: your
> home → `~/<name>`). The installer **refuses if the target folder already exists** — it's the one that creates it.

```bash
cd second-brain-generator   # the cloned launcher
node installer.mjs          # interactive: asks for name, location, your name, language
```

The script:
1. checks the prerequisites (and stops cleanly if any are missing);
2. asks you for the **brain name / location / your name / language**;
3. has you **choose your embedder** (fully-local "Gemma inside" / API key / Ollama — recommendation per your
   machine, see §1); the Gemini key will be requested **only** if you take the API key option;
4. **creates the brain folder** (`<location>/<name>`, **refused if it exists**) and **copies the
   launcher's tracked files** into it, then generates your customized files there: `CLAUDE.md` (which
   **replaces the bootstrap stub**), `.mcp.json`, `.claude/settings.json`, `.env`;
5. **initializes a git repo in the brain** (1st commit, **0 remotes** — the foundation of auto-commit);
6. offers to **wire up external sources** (optional — see §6);
7. offers to **clear the example notes** (optional — keep them for the 1st test, clear them afterwards so they don't pollute your RAG);
8. installs the engine's dependencies (`npm install`) in the brain;
9. indexes the example vault;
10. **MCP smoke-test**: verifies that Claude Code will be able to talk to the `vault-rag` server (see §8).

**Refused if the folder exists.** To never overwrite a brain, the installer **refuses** when the
target folder already exists (non-zero exit, nothing is touched). To start over: choose another
`--name`/`--dest`, or delete the folder. The **launcher** itself stays reusable indefinitely.

### Manual installation (if you prefer)
> The installer **creates the brain folder** for you (copy + generation + `git init`). Manually,
> first create an empty folder separately, then from the launcher:
1. Copy all the launcher's content into your new brain folder (excluding `.git`, `node_modules`,
   `DEVELOPING.md`).
2. In the brain: copy `.env.example` → `.env`. For the **fully-local** option, set
   `EMBEDDING_PROVIDER=in-process` (no key, no app); for the **API key** option, fill in
   `GOOGLE_GEMINI_API_KEY`; for **Ollama**, follow the `openai-compatible` block of `.env.example`.
3. Copy each `*.template` to its final file (`CLAUDE.md.template` → `CLAUDE.md`,
   `.mcp.json.template` → `.mcp.json`, `.claude/settings.json.template` → `.claude/settings.json`)
   then replace the `{{...}}` placeholders (notably `{{PROJECT_ROOT}}` = absolute path of the
   **brain** with `/` slashes, and `{{TMP_DIR}}` = the OS temp folder).
4. `git init` in the brain, then `cd rag && npm install && npm run index`.

> In practice, `node installer.mjs` does all of this for you, on every OS — prefer it.

### Non-interactive installation (flags) & Claude-driven startup

The installer accepts a **non-interactive mode**: useful for scripting the install, and it's what
enables the **Claude-assisted startup** (see README "Option A"). Claude gathers the answers
in chat, then calls **a single command**:

```bash
node installer.mjs --non-interactive --name "second-brain" --owner "Jane Doe" --lang "français"
# → creates ~/second-brain. Add --dest <parent-folder> to choose the location.
```

- **Flags**: `--name` (name of the created brain folder), `--dest` (parent folder; default = your home),
  `--owner` (your name), `--lang`. Both `--x value` **and** `--x=value` forms. Mode aliases:
  `--non-interactive`, `--yes`, `--no-input`.
- **Precedence**: CLI flag > environment variable (`SB_PROJECT_NAME`, `SB_DEST`, `SB_OWNER_NAME`,
  `SB_LANGUAGE`) > default value.
- **The Gemini key is NEVER an argument** (security: no secret on the command line). In
  non-interactive mode it is **always deferred** → fill it in afterwards in `<brain>/.env`;
  the index builds at the 1st startup of the MCP server.
- **No link to the launcher, by construction.** The installer **creates a fresh folder**, copies
  the tracked files into it (never the launcher's `.git`), then runs `git init` + 1st commit in it. The brain
  therefore has **no remote** — nothing to detach, no git surgery. The launcher is never modified.
- **No leak possible: push is opt-in.** The auto-commit hook **only pushes if you have
  explicitly enabled** `git config secondbrain.autopush true` (set by the "remote repo" step
  below). By default **off** → even a stray remote never receives your notes.
- **Remote repo: decided afterwards, never imposed.** The install creates no remote. You can wire
  one up whenever you want (see §7) — remembering to enable `secondbrain.autopush`. In assisted
  startup, Claude will **offer** to create one (backup + multi-machine) — answering no is risk-free.

> ⚠️ In non-interactive mode, the **connectors** (§6) and **example-notes purge** steps are
> skipped (they stay interactive) — you'll do them by hand or by re-running the installer **toward
> a new brain**.

## 3. First test

> ⚠️ **API key option only: fill in your Gemini key in `.env` BEFORE this first startup.**
> The `vault-rag` MCP server is launched once when Claude Code opens: if it starts without a key
> while you're on the Gemini option, the RAG won't be able to respond. (At startup, the status hook
> **warns you** if the key is missing.) In **fully-local** or **Ollama**, **no key**: skip this point.

```bash
cd <location>/<name>   # the brain folder created by the installer (e.g. ~/second-brain)
claude
```
Then: *"At the outfit that helps folks quit overworking, which worker got publicly honored for
having loafed the most of anyone — and at what percentage?"*
Claude should answer **Pélagie de Mollecuisse, winner of the Inertia Trophy with a DNR of
98.7%**, citing `[[decisions/2025-11-20-inertia-trophy]]`. This is a three-stage
**canary**: the subject is **invented** (the company "Flemmr") → Claude has no answer in memory,
it is *forced* to query the vault (**routing**); the fact is unfindable elsewhere (**provenance**
— not the Internet; if it says it doesn't know the company, the RAG is down); and the question shares
**no words** with the notes (everything is *described* via synonyms) — so retrieving "Mollecuisse"
also proves search **by meaning**, not a grep.

> 🔎 **Deterministic verdict (recommended after pasting the key).** Rather than judging the answer
> by eye, run from the brain folder:
> ```bash
> node scripts/verify-rag.mjs
> ```
> It (re)indexes and **asserts** that the demo surfaces "Mollecuisse". `exit 0` = RAG OK; `exit 1` = explicit
> failure (no false green).

> **Key added afterwards?** If you launched Claude Code without the key, paste it into `.env` then
> **ask your question again**: the server re-reads `.env` on the fly and takes it into account — no need
> to reconnect. If it ever resists, reconnect the MCP server with `/mcp` (in Claude Code) or
> restart Claude Code.

> If Claude doesn't "see" the RAG server: check that `.mcp.json` exists and points to the right
> path, accept the MCP server when Claude Code starts, and — *in the API key option* — that
> `.env` contains the key.

## 4. The RAG engine in brief

- Splits each `.md` into **chunks** (one per `#`/`##`/`###` section).
- Embeds each chunk with the chosen embedder (in-process **EmbeddingGemma** by default, or
  `gemini-embedding-001` in the key option, or Ollama) → vector stored in `rag/.cache/vault.db` (SQLite).
- A search embeds the question and surfaces the closest chunks by similarity.
- **Incremental**: only modified files (content hash) are re-indexed. At MCP server startup, a background reindex catches up on the new content without blocking searches.
- **Quota guardrails**: `MAX_EMBED_REQUESTS_PER_DAY` cap + `QUERY_RESERVE` reserve (searches are never blocked by indexing). Overridable in `.env`.
- Forced rebuild: `cd rag && npm run reindex`. Tests: `cd rag && npm test`.

Exposed MCP tools: `search_vault`, `get_document`, `list_documents`, `vault_stats`, `reindex`.

## 5. Customizing your harness

| File | What to do |
|---|---|
| `CLAUDE.md` | Adapt the sections marked 🔧: privacy, vault folders, sources, tone. It's *your* constitution. |
| `vault/` | Delete the example notes, put in your own. Keep the naming conventions. |
| `.claude/skills/` | Add your skills (see `EXAMPLES.md`). `/improve` helps you evolve them. |

## 6. External connectors (optional)

The generator only provides the RAG engine. To also query your other sources
(Drive, Notion, Slack, Calendar…), three paths — choose based on your comfort level.

### Menu — which connector for which need

Some **ideas** to get started (adapt to your tools). "claude.ai native" = enable on the
account side (Settings → Connectors), nothing to write in `.mcp.json`; "community MCP" = a
server you wire up in `.mcp.json`. Full, detailed catalog: [CONNECTORS.md](CONNECTORS.md).

| Need | Recommended connector | How to wire it up |
|---|---|---|
| **Notes / wikis** | Notion | Community MCP `@notionhq/notion-mcp-server`, or **native** claude.ai connector |
| **Mail** | Gmail | **Native** claude.ai connector |
| **Calendar** | Google Calendar | **Native** claude.ai connector |
| **Files / documents** | Google Drive | Community MCP (`@modelcontextprotocol/server-gdrive`, `@isaacphi/mcp-gdrive`…), or **native** claude.ai |
| **Team chat** | Slack | **Native** claude.ai connector |
| **Meeting transcripts** (Meet) | **Google Calendar + Google Drive** | Not a separate product: the recording/transcript link is often in the **invitation** (Calendar) and the transcript doc lands on the **Drive**. Wire up both. |

> 💡 Meeting transcripts are **not** a dedicated connector: they're documents
> produced by Meet/Gemini. You catch them via the **Calendar** (link in the event) and the
> **Drive** (the transcript doc). No need for a third-party meeting-bot MCP to get started.

### (a) The installer wizard — *recommended*

During `node installer.mjs`, the **5/9 "Wire up external sources"** step offers you a
small catalog. For each **MCP** connector you accept, the script automatically merges
its server block into `.mcp.json` **and** its permissions into `.claude/settings.json`, then
shows you the reminder of credentials to fill in. It's **idempotent**: re-running the installer never
creates a duplicate. All that's left is to put your real credentials in place of the `<…>` placeholders.

### (b) By hand — *if you prefer to control everything*

Add the MCP server yourself in `.mcp.json` (adapt the command/credentials for each server):

```jsonc
{
  "mcpServers": {
    "vault-rag": { "...": "already there" },

    // Google Drive (transcripts, docs) — e.g. community package
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@isaacphi/mcp-gdrive"],
      "env": { "GDRIVE_CREDS_DIR": "/path/to/credentials" }
    }
    // Slack, Notion, Gmail, Calendar: add the MCP server of your choice here.
  }
}
```

Then remember to:
- document in `CLAUDE.md` (§ 4) **which tool for what**;
- add the corresponding permissions in `.claude/settings.json` (`mcp__<server>__<tool>`);
- enable the server on the Claude Code side at startup.

### (c) claude.ai native connectors — *≠ `.mcp.json`*

Slack, Gmail, Calendar, Notion also exist as **native connectors** on the claude.ai account
side. These **are not wired up in `.mcp.json`**: enable them from the *Connectors* of your
account (Settings → Connectors). The wizard (a) reminds you of this for these sources and writes nothing
for them.

## 7. Backup & multi-machine portability (remote repo)

Set up a private git remote, **then enable push** (without it, auto-commit stays local — it's
the opt-in guardrail that prevents any leak by default):
```bash
git remote add origin <url-of-your-private-repo>
git push -u origin main
git config secondbrain.autopush true   # ← enables the hook's automatic push
```
The auto-commit hook will then push on every change. On the other machine: `git clone <your-private-repo>`
then, **in the cloned folder**, `cd rag && npm install` and re-enter the key in `.env` (the index
rebuilds at the 1st startup). *(No need for the installer here: it serves to **generate** a brain,
not to re-hydrate an already-existing brain.)* During a session, the `/sync` skill retrieves the
changes from the other machine.

> ⚠️ **Never** commit `.env` (gitignored). On a new machine, re-enter the key.

## 8. Troubleshooting

| Symptom | Probable cause | Remedy |
|---|---|---|
| `npm install` fails in `rag/` | Node too old | Node ≥ 18 (`node -v`) |
| `npm install` fails on **`better-sqlite3`** (Windows) | Native module without a prebuild for your Node version | Use an **LTS version** of Node (prebuilds available), or install the build tools: `npm install --global windows-build-tools` (old) or the *Visual Studio Build Tools* ("Desktop development with C++"). Then `cd rag && npm install`. |
| Empty searches | Index not built / no key | `cd rag && npm run index` after setting the key |
| `RESOURCE_EXHAUSTED` / 429 | Today's Gemini quota reached | auto-resume at reset (Pacific midnight), or raise `MAX_EMBED_REQUESTS_PER_DAY` |
| RAG status "unavailable" at startup | RAG engine not yet installed / DB being written | `cd rag && npm install`; the status recovers once the index is built |
| The MCP server doesn't appear | `.mcp.json` missing / wrong path | re-run `node installer.mjs`, accept the server in Claude Code |
| **MCP smoke-test ❌** at the end of installation ("MCP connection KO") | `rag/` not installed, `.mcp.json` poorly generated, or `npx`/`tsx` unavailable | `cd rag && npm install` then re-run `node installer.mjs`; check that `.mcp.json` points to `npx tsx rag/src/index.ts` with the right `cwd`. Manual test: `npx tsx rag/src/index.ts` should start without crashing (the Gemini key is **not** required for this test). |

## 9. Data privacy

Your vault may contain **professional / confidential** material. Two services see your content —
and in both cases, you can **prevent its exploitation**.

### Claude (the reasoning)

Claude Code reads your vault to respond.
- **API, Team, Enterprise**: by default, your data is **not used** to train the models.
- **Consumer** (claude.ai Free/Pro/Max): go to **Settings → Privacy** and **disable**
  the use of your conversations for model improvement.

### The embedder (the RAG / embeddings)

> This sub-section only concerns the **API key option (Gemini)**. In **fully-local** ("Gemma
> inside") or **Ollama**, **nothing leaves**: the text of your notes never leaves your machine, and
> there is no key, no cost, no provider caveat.

In the **Gemini** option, the engine sends the **text of your notes** (and of your queries) to the Gemini API
to compute the **embeddings** — that's all: Gemini never "responds", and the vectors are
stored **locally** (`rag/.cache`).
- **Free tier**: ⚠️ Google **may use this content to improve its products**, and a
  **human review** is possible. To be avoided for confidential material.
- **Paid tier** (billing enabled on your key / Google project): Google commits to **not**
  using your content for training, with no human review. **This is the gesture that puts your
  data out of reach.**

**And it costs almost nothing** (`gemini-embedding-001`, order of magnitude ~$0.15 / million
indexed tokens):

| What you index | Approximate cost (one-shot) |
|---|---|
| ~1,000 notes (≈ 500 words each) | **~€0.10** (about ten cents) |
| ~10,000 notes | **~€1** |
| Your **queries** (a few dozen tokens) | **negligible** — tens of thousands of questions for ~1 cent |

> The index is **incremental**: only **modified** notes are re-embedded → the recurring cost
> is near zero. Bottom line: for the price of a coffee (over a whole year), you take your data out of
> the training scope.

### 100% local — **shipped** (recommended default)

So that **nothing** leaves your machine, the **fully-local** embedder is **shipped and recommended by
default** (D1, ADR 0007): `InProcessEmbedder` runs **EmbeddingGemma** *in-process* (via
Transformers.js, no key, no app to install — `EMBEDDING_PROVIDER=in-process` in `.env`). Measured at
**90%** on the eval-set (= Ollama, > Gemini 80%). Recommended from **12 GB of RAM** (excluding Intel Mac;
OS peak ~4 GB during indexing, `EMBED_BATCH=4`). **Ollama** variant (`EMBEDDING_PROVIDER=ollama`) for
Intel Mac or a specific model. The engine stays modular (`Embedder` SPI port): switching options
re-encodes in a few minutes, **without losing a single note**.

> Anthropic's and Google's terms **evolve**: check them at the time you read this (Anthropic
> Privacy Center · *Gemini API Additional Terms of Service*).

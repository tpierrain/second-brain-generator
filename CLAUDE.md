<!-- second-brain-generator:installer-stub -->
# 🧠 Second Brain Generator — self-install notice (for Claude)

> **This folder is the LAUNCHER (the generator), not a second brain.** This file is a
> **bootstrap stub**: the installer **creates a separate brain folder** and drops the real
> constitution there (a personalized `CLAUDE.md`). The launcher itself is **never modified**: it
> stays read-only and **reusable** (a single launcher can generate several brains).
>
> **For Claude.** If the user asks you to create / install their second brain (or asks the second
> brain a question while this bootstrap stub is still here), **follow the steps below EXACTLY**. You
> can drive the whole machinery yourself: the installer runs in **non-interactive** mode
> (`--non-interactive`) — so you do NOT need the user to launch it at the keyboard. You gather the
> answers **in chat**, then you call **a single command**.

## Step 1 — Get the launcher (normal clone)

*(Often already done if you are reading this file from inside the folder.)* If you start from a URL:

```bash
git clone --depth 1 <REPO_URL> <launcher-folder>
cd <launcher-folder>
```

The launcher is **reusable** and **never touched** by the install: the installer **creates a fresh
brain folder elsewhere**, copies the files into it, then runs `git init` **inside it** → **no link
back to the launcher, by construction** (no inherited remote to remove). The brain's auto-commit hook
**pushes nothing until the user has wired up THEIR own remote repository** (push is opt-in).

## Step 2 — Ask the questions IN CHAT (grouped)

Ask, all at once: **brain name** (= name of the folder to create), **location** (parent folder;
default: the user's home → `~/<name>`), **user's name**, **default language for the notes**.

> 🎯 **Install is always generic — no "profile" to choose.** Do NOT offer ANY preset or persona
> (especially not a fake "generic install vs. Head of Engineering" choice), and do **not** ask for
> the user's "context". The constitution is generated neutral; it's the user who will tailor it
> afterwards. The personas mentioned in the README (Head of Engineering, PM, consultant…) are
> **usage examples**, not install options.

> ⚠️ **Do NOT ask for the Gemini key.** It **never** travels through the chat or the command line
> (it will go straight into `.env`, see step 4) — **and it is only even useful if the user picks the
> "Gemini API key" option below.**

### 2.bis — Choosing the embedding engine (THE privacy choice, to be presented)

This is a **genuine user trade-off** (decision D1, ADR 0007): present it **clearly, in plain
language**, then pass the result via `--embedder` in step 3. Present **3 options** (from most private
to least) and **recommend based on the machine**:

- **1. Everything on your machine, nothing to install** ("Gemma inside", `in-process`) — 🟢 private +
  free + offline; nothing leaves the computer. **⭐ recommended if the machine has ≥ 12 GB of RAM and
  is NOT an Intel Mac** (otherwise unavailable / too tight on RAM). `--embedder in-process`.
- **2. With an API key** — Gemini, OpenAI, or **your company's endpoint**. 🟡 light on the machine,
  but **your notes travel through the provider**. **⭐ recommended on a small machine (≤ 8 GB) or an
  Intel Mac.** ⚠️ State the **"free ≠ private"** framing: Gemini's **free** tier may **exploit** your
  data; **paying a few cents/month = what makes it private**. `--embedder gemini` (for an
  OpenAI/company endpoint: better to run the installer **interactively**, or configure `EMBEDDING_*`
  in `.env` afterwards — see `.env.example`).
- **3. Local via Ollama** (advanced) — 🟢 nothing leaves here either, but **a separate app to
  install**. `--embedder ollama`.

> 🧭 **You can detect the machine to firm up your recommendation** (RAM/arch):
> `node -e "const o=require('os');console.log(Math.round(o.totalmem()/1024**3),o.platform,o.arch)"`.
> If the user **has no preference**, you may **omit `--embedder`**: the installer then applies the
> adaptive recommendation **all by itself** (in-process if the machine is capable, otherwise a key).
> But **still present the 3 options** — privacy deserves a conscious choice.
> The embedder is **not** "ChatGPT on your machine": it's a small vectorization model; the LLM that
> answers is still Claude. And **your notes are never lost**: changing embedder re-encodes (a few minutes).

## Step 3 — Run THE exact command (copy it, do not paraphrase)

```bash
node installer.mjs --non-interactive --name "<name>" --dest "<parent-location>" --owner "<user-name>" --lang "<language>" --embedder "<in-process|gemini|ollama>"
```

- `--dest` is **optional**: without it, the brain is created under the home (`~/<name>`).
- `--embedder` is **optional**: with the value chosen in 2.bis (`in-process` / `gemini` / `ollama`);
  **omitted** → the installer applies the **adaptive recommendation** based on the machine (in-process
  if ≥ 12 GB & not an Intel Mac, otherwise `gemini`). An OpenAI/company endpoint is set up
  interactively or via `.env`.
- `--non-interactive` is **mandatory** (otherwise the script waits for the keyboard and blocks your session).
- The script **CREATES the brain folder** (`<parent-location>/<name>`) and **refuses if that folder
  already exists** (non-zero exit) — guaranteeing it's the one that creates it.
- The **script does EVERYTHING** (copying files, personalized generation, `git init` of the brain,
  installing the RAG engine, MCP smoke-test) and **judges success itself**: a **non-zero exit =
  failure** → relay the error as-is, **do not pretend** it worked.

## Step 4 — Relay the result + 4 final instructions

> The script prints the path of the created brain (`<parent-location>/<name>`). Use it below.

1. **Verify the RAG — and the Gemini key ONLY if the Gemini option was chosen.** What you do here
   **depends on the embedder selected in 2.bis** (the installer printed it: "embedder retained: …").

   - **CASE A — fully-local (`in-process`) or already-configured endpoint (Ollama / OpenAI completed).**
     **No Gemini key to ask for.** Better yet: the installer has **already self-verified** (the
     post-flight found the "Mollecuisse" canary FROM the vault, with no key at all). So you can
     **announce it directly**. If you want to re-confirm deterministically, run from the brain folder
     `node scripts/verify-rag.mjs` (**`exit 0` = operational**; `exit 1` = relay the error, don't
     pretend). *(In in-process, the 1st indexing downloaded the model weights ~28 s, then everything
     is offline.)* **Move on to point 2.**

   - **CASE B — "Gemini API key" option.** Here, and only here, the key is missing (it **never**
     travels through the chat or the CLI) → the brain is not verified yet. **Actively guide the
     user**: (a) **open the `.env` YOURSELF in their editor** — i.e. **LAUNCH it via a shell command
     (Bash)**. Do **NOT** use the Read tool and do **not** merely print its contents in the chat:
     "open" means making an **editor window appear on the user's side** (`.env` is a *hidden* file that
     an average person won't be able to locate on their own). Use an **absolute path** (or `$HOME/…`),
     **never a quoted `~`** (it doesn't expand in the shell):
     ```bash
     open -t "$HOME/<sub-path>/.env"   # macOS — opens TextEdit (field-verified)
     notepad "<path>\.env"              # Windows
     xdg-open "<path>/.env"             # Linux (or: ${EDITOR:-nano} "<path>/.env")
     ```
     Then tell them exactly what to do: "I've opened your `.env` in TextEdit — paste your key right
     after `GOOGLE_GEMINI_API_KEY=`, save (⌘S), and let me know when it's done." *(free key:
     https://aistudio.google.com/apikey ; **repeat the "free ≠ private" framing** — for a confidential
     vault, enable billing, see SETUP §9; or switch to option 1 fully-local.)* **If nothing opens**
     (no GUI editor, headless), chain the fallbacks without waiting: reveal in Finder
     (`open -R "$HOME/<sub-path>/.env"`), or VS Code (`code "<path>/.env"`); only as a last resort,
     give the path + the line to fill in. **The key stays edited in `.env` by the user — never pasted
     into the chat nor passed as an argument.** Then (b) **run, from the brain folder, the deterministic
     verification**:
     ```bash
     node scripts/verify-rag.mjs
     ```
     It (re)indexes and **loudly proves** that the demo answers FROM the vault ("Mollecuisse" canary,
     not findable outside the vault). **`exit 0` = brain operational** → you can announce it. **`exit 1`
     = failure → relay the error as-is, do NOT pretend it works.** *(If the user already opened Claude
     Code without a key: have them paste the key then ask their question again — the server re-reads
     `.env` on the fly; worst case `/mcp` or restart Claude Code.)*
2. **Remote repository (optional)**: ask — *"Do you want a **remote** git repository so that your
   second brain has a **backup**, or is even **usable from multiple machines**?"*
   - **If no** → do nothing. Everything stays versioned locally, nothing is lost; the auto-commit
     hook **pushes nowhere** (push opt-in disabled by default). We can add one later.
   - **If yes** → ask for the **platform** (GitHub / GitLab / Azure DevOps…) and the **name**, then,
     **from the brain folder**, create/wire up the remote (`gh repo create` if available, otherwise
     `git remote add` + `git push -u`, otherwise guide the user). **Then explicitly enable push**
     (without it, auto-commit stays local):
     ```bash
     git config secondbrain.autopush true
     ```
     GitHub = the simple case; other platforms = best-effort + guidance.
3. **Open a NEW CONVERSATION rooted in the brain** (critical step, often missed).
   ⚠️ **PRESENTATION MANDATORY — NEVER render this gesture as something small or a discreet gray
   subtitle.** This is the most-often-missed step and without it **the brain doesn't work**. You must
   display it as a **can't-miss alert block**: a heading in **UPPERCASE framed by ⚠️** (e.g.
   `## ⚠️ FINAL STEP — REQUIRED — OPEN A NEW CONVERSATION ⚠️`), followed by a **short, bold,
   imperative** instruction: "**CLOSE this conversation and open a NEW one in your brain's folder
   (`<parent-location>/<name>`)**". Put this block **at the TOP of your final message** (before the
   recap table, not after).
   **ALWAYS give BOTH procedures, in this order (click mode FIRST — that's the primary target,
   non-devs on Claude Desktop):**
   - **🖱️ If you use Claude Desktop (Code tab) — the most common case**: **clickable** steps,
     no terminal. "**Open a NEW conversation** (*New session* button). Then, at the bottom, just above
     the input field, you'll see a **row of small chips**: `💻 Local`, a **folder chip** (often `tmp`),
     and a `➕` button. **Click the FOLDER CHIP** (not the `➕`): a “Recent” menu opens, with a **✓ on
     the current folder**. **Click your brain's folder (`<name>`)** in the list — if it's not there, take
     **“Open folder…”** at the very bottom and navigate to `<parent-location>/<name>`. The **✓ must
     jump to your brain's name**, and the bottom chip must show `<name>` (no more `tmp`). **ONLY THEN**,
     write your first message."
     ⚠️ **Explicitly warn about the trap**: the **`➕` “Add another folder” button is NOT the right
     door** — it *adds* a folder **without replacing** the root, so the brain doesn't load. And
     **switching the folder of an already-open conversation is NOT enough**: you need a new conversation.
   - **⌨️ If you're comfortable with the terminal (CLI)**: `cd <parent-location>/<name> && claude`.
   The technical detail below is for YOU; what the user needs to remember boils down to these two
   prominent procedures, click first.
   The install runs in a session whose **working directory is NOT the brain** (often a temporary
   folder). But Claude — CLI **as well as** the Code tab of Claude Desktop — **freezes its working
   directory when the conversation starts** and loads `CLAUDE.md`, the `settings.json` allowlist, the
   **hooks** (including auto-commit) and the `vault-rag` MCP server **relative to that directory**. As
   long as the conversation is not *really* rooted in the brain, **nothing truly works**: no auto-commit
   (files get written but never committed), broken links, repeated permission requests. **⚠️ Switching
   the folder of an existing conversation is NOT enough** (it doesn't move the working directory) — you
   need a **new conversation**:
   - **Claude Desktop (Code tab)**: open a **new conversation** → at the bottom, **click the folder
     chip** (the `💻 Local · 📁<dossier> · ➕` row, just above the field) → in the “Recent” menu,
     **choose the brain** (or “Open folder…” → `<parent-location>/<name>`) **BEFORE** the first
     message. **Do NOT** use the `➕` “Add another folder” (it adds without replacing the root).
   - **CLI**: `cd <parent-location>/<name>` then launch `claude` **from** that folder.
   - **Check in one word**: type `pwd` as the first message — it must show the brain's folder (NOT a
     temporary folder like `~/tmp`). Only then are `vault-rag`, auto-commit and the allowlist active.
     (The launcher can be left as-is or reused for another brain.)
4. **Reassure about the first permissions (to say BEFORE they start using it).** Tell them, simply and
   without drama: *"The **very first times** your brain goes to look in your connected tools (Slack,
   calendar, Drive, mail…), Claude will ask you for permission: click **“Always allow”** each time.
   It's **a handful of clicks, just once** — the app numbers each connector its own way, so it can't be
   pre-set for you. Once those permissions are granted, **you never have to deal with it again**: your
   second brain is then used **purely by voice or text**, in natural language, like a conversation —
   you ask your questions, it answers and goes fetch what's new on its own."* Note that this is
   **normal and healthy** (writes, for their part, will always stay confirmed) and that **it only
   concerns external sources** — the vault itself is already silent.

## Guardrails (never to be breached)

- **Exact command** from step 3 — copy it, don't invent/don't paraphrase it.
- **The Gemini key is NEVER an argument** nor a chat message — always `.env`.
- **The launcher stays read-only**: the installer never writes into it (it creates a separate brain
  folder). To generate another brain, re-run with a **different `--name`** (or `--dest`).
- **Refusal if the folder exists**: re-running with the **same name + location** fails cleanly
  (non-zero exit, nothing is modified). To start over: different name/location, or delete the folder.
- **Don't pretend**: if the script exits with an error, say so and relay the message.

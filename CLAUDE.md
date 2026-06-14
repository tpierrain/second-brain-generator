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

**Ask the brain name FIRST, on its own.** Then ask the remaining three **as one group**. Why split:
every later option must **reuse the exact name the user just typed** — never show a literal `<name>`
placeholder in the options or the recap. (If you asked all four at once you wouldn't have the name
yet when building the location option, and you'd be stuck with `~/<name>`.)

- **Q1 (alone): brain name** (= name of the folder to create). **Do NOT propose a default or suggested
  name** — the user provides it; just capture exactly what they type.
- **Q2–Q4 (grouped): location** (parent folder; default: the user's home → `~/<name>`), **user's
  name**, **default language for the notes**. In every Q2–Q4 label, **substitute the exact name the
  user typed at Q1** in place of `<name>` (e.g. if they typed `acme-notes`, the location option reads
  `Home (~/acme-notes)`, never the literal `Home (~/<name>)`). That token is illustrative only —
  **never suggest a name yourself**.

> 🚫 **For the location: NEVER offer the current working directory, the launcher folder, or any
> temp directory as an option** — and **especially not as the first/default option**. The brain must
> be created **outside** the launcher (the launcher stays read-only and reusable). Do **NOT** derive
> a location from `pwd` / the directory you happen to be running in (e.g. `~/tmp…`): nesting a brain
> in or beside the launcher's working dir breaks rooting and invites accidental loss when a temp dir
> is cleaned. When you present location choices, the **only** standing option is **Home (`~/<name>`, the default —
> with the name they typed at Q1 substituted in)** plus a free-text **"Other"** for the user to type their own path. If they type a
> path that is the launcher folder, the current working dir, or a temp dir, push back before running.

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
- **2. Via an API (Gemini, OpenAI, Mistral, or your own endpoint)** — 🟡 light on the machine; the
  text of your notes is sent to the provider's API. **Several providers possible** — Gemini, OpenAI,
  Mistral, or your company's / own AI endpoint. **⭐ recommended on a small machine (≤ 8 GB) or an
  Intel Mac.** 🛡️ **Don't dramatize**: in many cases your data is **NOT** used for training — it
  depends on the provider and the plan. Tell the user that, **depending on the API they pick, they
  must choose the right settings** (a paid tier, or the provider's "no-training" / data-controls
  option) so their notes aren't used for training. `--embedder gemini` (for OpenAI / Mistral / your
  own endpoint: run the installer **interactively**, or configure `EMBEDDING_*` in `.env` afterwards
  — see `.env.example`).
- **3. A model running locally on your machine, via Ollama** (`ollama`) — 🟢 nothing leaves here
  either, but a **separate app (Ollama) to install** + an embedding model to pull. **Setup for the
  most technically advanced users.** `--embedder ollama`.

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

## Step 4 — Relay the result + 5 final instructions

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
     travels through the chat or the CLI) → the brain is not verified yet. **The installer has
     ALREADY opened the user's `.env` in their editor itself** (deterministic, CASE B only — it prints
     `✓ I opened your .env in your editor`). So your job is **only to guide the paste**: tell them
     "Your `.env` is open in your editor — paste your key right after `GOOGLE_GEMINI_API_KEY=`, save
     (⌘S on macOS), and let me know when it's done." *(free key: https://aistudio.google.com/apikey ;
     **repeat the calm framing** — notes' text leaves the machine, and for a confidential vault you'd
     enable billing / data-controls so it isn't used for training, see SETUP §9; or switch to option 1
     fully-local.)*
     (a) **Only if the installer did NOT open it** (headless / no GUI editor — it prints the
     `⚠️ Gemini key not provided yet … paste it into <path>` copy instead), open it YOURSELF via a
     shell command (Bash) — making an **editor window appear on the user's side** (`.env` is a *hidden*
     file an average person won't locate). Use an **absolute path** (or `$HOME/…`), **never a quoted
     `~`** (it doesn't expand in the shell):
     ```bash
     open -t "$HOME/<sub-path>/.env"   # macOS — opens TextEdit (field-verified)
     notepad "<path>\.env"              # Windows
     xdg-open "<path>/.env"             # Linux (or: ${EDITOR:-nano} "<path>/.env")
     ```
     If even that opens nothing, chain the fallbacks without waiting: reveal in Finder
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
3. **Open a NEW CONVERSATION rooted in the brain** — present this as the **TWO WAYS TO USE YOUR
   SECOND BRAIN** (critical step, the most-often-missed; without it **the brain doesn't work**).
   ⚠️ **ANCHOR ON THE INSTALLER'S BANNER, DON'T FREE-COMPOSE.** The installer prints, as the **very
   last thing on screen**, a deterministic hand-off banner ("⚠️ THIS WINDOW IS THE INSTALLER — NOT
   your second brain", then Desktop-first / terminal-second, then the optional purge). **Reproduce
   that banner VERBATIM** in your closing message — same wording, same order — instead of writing your
   own. **NEVER** replace it with a bare `cd … && claude` line, and **never** drop the Desktop option.
   The template below mirrors that banner; keep it faithful.
   ⚠️ **PRESENTATION MANDATORY — NEVER collapse this to a single `cd … && claude` line**, and never
   render it as a small / discreet grey subtitle. Put it **at the TOP of your final message** (before
   the recap), as a **can't-miss block**: a heading in **UPPERCASE framed by ⚠️** (e.g.
   `## ⚠️ FINAL STEP — OPEN A NEW CONVERSATION IN YOUR BRAIN ⚠️`), a one-line imperative ("**CLOSE
   this conversation and open a NEW one rooted in `<parent-location>/<name>`**"), then the **TWO
   options as two clearly-separated, bold/UPPERCASE sub-headers — Desktop FIRST** (it's what most
   people, non-devs, will use), **CLI second**. **Substitute the user's actual brain name everywhere**
   (the name typed at Q1 — never a literal `<name>`, and never a name you invented). Use this template:

   > ### 🖱️ OPTION 1 — CLAUDE DESKTOP APP (the common case, no terminal)
   > **Open a NEW conversation** (*New session*). At the bottom, just above the input field, you'll see
   > a **row of chips**: `💻 Local`, a **folder chip** (often `tmp`), and a `➕`. **Click the FOLDER
   > CHIP** (not the `➕`): a “Recent” menu opens with a **✓ on the current folder** → **click your
   > brain `<name>`** (or “Open folder…” at the bottom → `<parent-location>/<name>`). The **✓ must jump
   > to `<name>`** and the chip must show `<name>` (no more `tmp`). **ONLY THEN** write your first
   > message.
   > ⚠️ **Trap**: the `➕` “Add another folder” is **NOT** the right door (it adds without replacing the
   > root → the brain doesn't load); and switching the folder of an already-open conversation is **not
   > enough** — you need a NEW conversation.
   >
   > ### ⌨️ OPTION 2 — TERMINAL (CLI, for the more technical)
   > `cd <parent-location>/<name> && claude`

   The technical detail below is for YOU; what the user must remember is exactly these two prominent
   options, **Desktop first**.
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
5. **Offer the Obsidian viewer (optional, recommended).** Their notes are plain Markdown that already
   works as-is, but installing **[Obsidian](https://obsidian.md)** (free) gives a full **read/write**
   interface — links, graph, editor — over **the same files** Claude uses. ⚠️ **Warn them about the
   very first launch**: on a brand-new Obsidian, the first run lands on a **welcome / vault-picker
   screen** — this is normal, and **they must do a one-time manual step**: open Obsidian themselves,
   click **"Open folder as vault"**, and pick the brain's folder (`<parent-location>/<name>`, with the
   real name substituted). **Until that registration is done, asking Claude to "open a note" has
   nowhere to land** (the `obsidian://` link errors or stalls on that setup screen). Once the vault is
   registered, it just works — and Obsidian stays **optional**: without it, Claude shows notes inline.
   (Full details in SETUP.md.)

## Guardrails (never to be breached)

- **Exact command** from step 3 — copy it, don't invent/don't paraphrase it.
- **The Gemini key is NEVER an argument** nor a chat message — always `.env`.
- **The launcher stays read-only**: the installer never writes into it (it creates a separate brain
  folder). To generate another brain, re-run with a **different `--name`** (or `--dest`).
- **Never install into the working/launcher/temp dir**: the brain's location must be **outside** the
  launcher — never the current working directory, the launcher folder, or a temp dir (e.g. `~/tmp…`),
  and never offered as the first/default choice. Default is Home (`~/<name>`); see Step 2.
- **Refusal if the folder exists**: re-running with the **same name + location** fails cleanly
  (non-zero exit, nothing is modified). To start over: different name/location, or delete the folder.
- **Post-install tweaks are brain-side, NOT a re-run of the installer.** `installer.mjs` **refuses an
  existing folder**, so it can never touch a brain you already created — **never** tell the user to
  re-run it to purge demo notes or add connectors. The correct commands, run **from inside the brain**
  (a new rooted conversation):
  - **Purge the example notes** → `node scripts/clear-example-notes.mjs` (the brain-side script).
  - **Connectors** are **not** replayable standalone (interactive logic lives in `installer.mjs`) →
    add/remove them by **editing `.mcp.json` / `.claude/settings.json`** by hand (or re-install
    interactively toward a **brand-new** brain).
- **Don't pretend**: if the script exits with an error, say so and relay the message.

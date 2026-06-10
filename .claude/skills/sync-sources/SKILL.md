---
name: sync-sources
description: "Fan-out/fan-in architecture to pull in the DELTA of external sources (Slack, Google Drive / transcripts, Calendar, mail…) via parallel READ-ONLY sub-agents. Internal technical reference — it's the engine of Phase 2 of the main flow (question → sync sources in background) and of a possible morning briefing. Not a user command: it's your questions that trigger the pull."
version: 1.0.0
---

# Sync sources — Fan-out/fan-in architecture (internal reference)

> **This is not a user command.** This file documents the sub-agent architecture
> of **Phase 2** of the main flow (sync sources in background — see `CLAUDE.md`). You
> never trigger the pull by hand: it's the question that triggers it. Note: `/sync`
> is a **separate** command that synchronizes the git repo between machines.
>
> 🔧 **Adapt to your connectors.** The examples below reference MCP tools generically
> (`mcp__<slack>__…`, `mcp__<drive>__…`, `mcp__<calendar>__…`). Replace them with the
> real names of the connectors you've wired up (see [SETUP §6](../../../SETUP.md)). Without a wired
> connector, this skill does nothing — the RAG engine answers on its own from the vault.

## Absolute constraint

**READ-ONLY.** Never send a message, an email, or a reaction. Never post in
a channel. Produce only local markdown files in the vault.

## Sub-agent tooling — NEVER a shell to process text

The sub-agents are **LLMs**: they read and summarize **by reasoning**, not via the shell.
**Forbidden to use `python3 -c`, `python`, `node -e`, `awk`, `sed`, `jq`, `grep`, `cat`,
`head`, `tail` — or any Bash command — to parse, load, split, slice or summarize
content.** Why this is non-negotiable (especially on Claude Desktop, Code tab):

- each ad-hoc command is **unique** → it re-triggers an **authorization prompt** on every
  call (endless prompts, impossible to pre-authorize);
- some (multi-line, `#` inside an argument, redirections) are **refused for security** and
  don't even offer "Always allow" — the user *cannot* accept them.

Instead:
- **Read content** → the **`Read`** tool (a vault file; or a large tool result
  that Claude offloaded to `…/tool-results/…`: read it with `Read`, not with `python3 -c "open(...)"`).
- **Write** the raw source / the briefing → the **`Write`** / **`Edit`** tools.
- **Split** ("up to the Details section", "the first 4000 characters"…) → **in your head**,
  not in Python.

`Read`/`Write`/`Edit` are pre-authorized and silent. The shell is not and never will be
reliably so: don't use it for text manipulation.

## Why this architecture

To avoid *context rot* (quality degrades as early as ~50-70k tokens of context), we **never**
pull the sources into the main context. We orchestrate **sub-agents in parallel**:
each reads ONE source, extracts the delta from it, and returns only a **pre-digested signal (~500 tokens)**.
The main context only receives these compact summaries and does the synthesis.

```
question (or morning briefing)
    │
    ├─► N sub-agents: transcript-extractor (one per new document/transcript)
    ├─► 1 sub-agent: chat-extractor      (mentions + DMs since the last pass)
    ├─► 1 sub-agent: my-actions          (what YOU did/wrote since the last pass)
    ├─► 1 sub-agent: calendar-reader     (today's agenda) — often fast, can stay inline
    ▼
main context = final synthesis (~3-5k tokens of input)
    → vault/briefings/YYYY-MM-DD.md  (if briefing)
    → vault/actions-log.md           (append)
```

## People registry (backlinks)

For consistent `[[people/firstname-lastname]]` backlinks (no broken links), the sub-agents
rely on the cards in `vault/people/`. Rule: **kebab-case, no accents**
(`[[people/jane-doe]]`). **Never a first name alone** (`[[people/jane]]` is forbidden). Create the
backlinks even if the target page doesn't exist (*dangling links* OK); do not create the target pages.

## Procedure

### Step 1 — Source discovery (main context)

> **Native tools only** (see constitution, "Tooling" section). To probe the state of the
> vault before the fan-out — `vault/briefings/` folders, `vault/people/` cards, presence of
> `vault/actions-log.md` — use **`Glob`** and **`Read`**, **never** a compound Bash like
> `cd … && mkdir -p … && ls … && test -f …` (prompted every time, and refused outright because
> `cd`+write). `Write` creates the parent folders at write time: no prior `mkdir`.

In parallel, spot what's **new since the last pass** (delta):

- **Recent transcripts / documents**: search your Drive for docs modified since
  yesterday (or the last working day), e.g. `mcp__<drive>__search(query="modifiedTime > 'YYYY-MM-DD…'")`.
  Collect the `id` + titles: each becomes a transcript-extractor sub-agent.
- **Today's agenda**: `mcp__<calendar>__list_events` (fast, can stay in the main context).

### Step 2 — Sub-agent fan-out (IN PARALLEL, a single message)

Launch all the sub-agents in **a single block of parallel calls**. Each writes its raw
source to the vault and **returns a ~500-token-max summary**.

#### "transcript-extractor" sub-agent (one per document)

```
Agent(
  description="Extract transcript <slug>",
  prompt="""
You are a meeting-transcript extraction agent. READ-ONLY.

TASK:
1. Read the document <DOC_ID> via your Drive connector (mcp__<drive>__read_file).
2. Save the raw content to vault/raw-sources/transcripts/YYYY-MM-DD-<slug>.md
   with this frontmatter:
   ---
   type: transcript
   source: <connector>
   meeting: "<title>"
   date: YYYY-MM-DD
   captured: <today's date>
   ---
3. Return a structured summary (~500 tokens max):

## Signals — <title>
### My commitments       # what YOU promised
- …
### Expectations of me    # what's expected of you
- …
### To escalate           # 🔧 up your hierarchy / to your peers — adapt to your org
- …
### To share              # 🔧 to your team / your contacts — adapt to your org
- …
### Backlinks
- People: [[people/firstname-lastname]]
- Topics: [[topics/topic-name]]
- Source: [[raw-sources/transcripts/YYYY-MM-DD-slug]]

RULES:
- Do NOT invent information absent from the transcript.
- Create the backlinks even if the target page doesn't exist.
- Backlinks via vault/people/ (kebab-case no accents, never a first name alone).
- NEVER a shell (python3 -c, node -e, awk, sed, jq, grep, cat…) to read/load/split the
  content: if you must re-read a file (vault or offloaded result .../tool-results/...), use
  the Read tool; splitting and summarizing are done by reasoning, not on the command line.
"""
)
```

#### "chat-extractor" sub-agent (Slack/Teams/… if wired)

```
Agent(
  description="Chat 24h scan",
  prompt="""
You are a team-messaging collection agent. READ-ONLY.

TASK: scan the last 24h (or since the last pass) for relevant signals:
1. Direct mentions of you and DMs from key people.
2. A few priority channels (🔧 to be defined according to your org — last 15-30 messages).

EXTRACT a structured summary (~500 tokens max), grouped by THEME (not by channel):

## Chat signals (24h)
### My commitments
### Expectations of me
### To escalate        # 🔧 adapt
### To share           # 🔧 adapt
### Alerts             # incidents, escalations, emergencies

RULES:
- Ignore pure conversational noise (hello/thanks/emoji) and bots/notifications.
- Backlinks via vault/people/ (never a first name alone).
- NEVER a shell (python3 -c, node -e, awk, sed, jq, grep, cat…) to read/load/split the
  content: if you must re-read a file (vault or offloaded result .../tool-results/...), use
  the Read tool; splitting and summarizing are done by reasoning, not on the command line.
"""
)
```

#### "my-actions" sub-agent (what YOU did)

```
Agent(
  description="My actions since the last pass",
  prompt="""
You are a collection agent for YOUR actions. READ-ONLY.

TASK: find the messages/decisions issued BY YOU since <LAST_PASS_DATE>, and keep only
the significant ACTIONS (announcements, decisions, framing, sign-offs, escalations).
IGNORE: "ok", "thanks", "I'll look", reactions, logistics.

EXTRACT (~500 tokens max), one line per action:
- [YYYY-MM-DD] <short action> — #channel [[people/main-recipient]]

RULES:
- EACH action = ONE distinct message (do not merge).
- Read the content before summarizing (don't guess from the channel).
- Max ~15 actions; beyond that, keep the most structuring ones.
- NEVER a shell (python3 -c, node -e, awk, sed, jq, grep, cat…) to read/load/split the
  content: if you must re-read a file (vault or offloaded result .../tool-results/...), use
  the Read tool; splitting and summarizing are done by reasoning, not on the command line.
"""
)
```

### Step 3 — Synthesis (main context)

The main context receives the compact summaries from all the sub-agents + the agenda
(~3-5k tokens). **Sort and cross-reference**: the same topic seen in a transcript AND in the chat = strong
signal. This is also where we decide whether the delta **amends the answer in progress** (Phase 3 of the flow).

### Step 4 — Writing the briefing (if morning briefing)

Write to `vault/briefings/YYYY-MM-DD.md`:

```markdown
---
type: briefing
date: YYYY-MM-DD
architecture: fan-out/fan-in
sources: ["[[raw-sources/transcripts/...]]", "chat (24h)", "calendar (day)"]
tags: [briefing]
---

# Briefing — YYYY-MM-DD

## ✅ What you did since the last briefing
- [YYYY-MM-DD] [action] — #channel [[people/recipient]]

## 🔴 Your commitments (what you promised)
- **[commitment]** — context, source [[raw-sources/...]]

## 🟡 What's expected of you
- ⚠️ Urgent: [today's deadlines]
- Pending: [[people/firstname-lastname]]: [expectation]

## 🔵 To escalate / 🟢 To share   # 🔧 sections to adapt to your organization

## 📅 Today's agenda
| Time | Meeting | Preparation |
|---|---|---|
| HH:MM | **[meeting]** | [context/action] |

## Caveats
- [transcript quality, name confusions, missing context]
```

No empty section — omit it. Each signal cites its source (brackets or backlink).

### Step 5 — Append to `vault/actions-log.md`

**Append** (create the file if it doesn't exist) one flat line per action, prefixed with the date —
no frontmatter, *grep-able* file:

```markdown
## [YYYY-MM-DD] <action> — #channel [[people/recipient]]
```

**Append-only**: never rewrite the existing lines. Usage: "what did I do on
X?" → `grep -i "X" vault/actions-log.md` then enrich via the referenced briefings.

## Re-run mode (same day)

If `vault/briefings/YYYY-MM-DD.md` already exists: re-read it, re-scan the sources, and only add
a `## 🔄 Update HH:MM` section at the top if there's something new. Otherwise show
"Nothing new" without modifying the file.

## Backlink conventions

| Context | Syntax |
|---|---|
| Person | `[[people/firstname-lastname]]` (kebab-case, no accents) |
| Transcript | `[[raw-sources/transcripts/YYYY-MM-DD-slug]]` |
| Topic | `[[topics/topic-name]]` |
| Prior briefing | `[[briefings/YYYY-MM-DD]]` |

## Success criterion

In < 1 minute of reading, you know (a) what you have to do today and (b) what you have to
push toward others — zero important signal lost since the last pass.

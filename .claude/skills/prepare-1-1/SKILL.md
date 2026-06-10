---
name: prepare-1-1
description: "Prepare a 1-1 with anyone, in both directions: with YOUR manager (the topics you want to raise, what has changed since last time) or with someone YOU manage (commitments made/delegated, operational topics, KPI review). Takes a name/alias, cross-references the person's profile, the last 1-1 and the delta of recent signals (via sync-sources, READ-ONLY). Meta skill: a structure that gives you ideas, to be refined to your own focus areas and KPIs (with /improve if needed)."
version: 1.0.0
---

# /prepare-1-1 — Prepare a 1-1 (meta version)

Produces a **briefing** scannable in 2 minutes before your next 1-1. This is a **meta skill**:
it lays out a **structure** that gives you ideas; you then **refine** it to your own focus areas,
your KPIs and the way you run your 1-1s (edit this file, or ask `/improve` to help you).

## Parameter

A **name or alias** of a person in `$ARGUMENTS` (e.g. `/prepare-1-1 jane`). Used to find
`vault/people/<firstname-lastname>.md` (kebab-case, no accents) and the cache `vault/backlog/<name>.md`.
If no profile matches, suggest the closest profiles from `vault/people/` and stop.

## Absolute constraint

**READ-ONLY.** Never send a message, email or reaction, never post anywhere.
Produce only a local markdown file in the vault.

## Step 0 — Direction of the 1-1 (determines the output structure)

Two cases, depending on your relationship with the person (infer it from their role in `vault/people/<name>.md`;
when in doubt, ask):

- **A · 1-1 with YOUR manager** (you are the managee) → "**what I want to raise**" structure.
- **B · 1-1 with someone YOU manage** (a report, or a peer you coach) → "**follow-up + operational + KPI**"
  structure.

## Step 1 — Collection (fan-out, READ-ONLY)

In parallel ([`sync-sources`](../sync-sources/SKILL.md) architecture, ~500-token summaries):

- **Backlog cache**: `vault/backlog/<name>.md` — open / recurring actions (a point raised
  2+ times without closure is a priority).
- **Last 1-1**: the note in `vault/meetings/` (or via your Calendar connector) — transcript read
  by an isolated sub-agent (never raw transcript in the main context). Also note the
  **next** 1-1 (date of the output file; otherwise today's date).
- **Delta since the last 1-1**: messaging, email, shared meetings — depending on your connectors.

## Step 2 — Writing the briefing

Write to `vault/prep-1-1/YYYY-MM-DD-prep-1-1-<name>.md` (date of the next 1-1; create the folder
if needed), according to the case detected in step 0.

### Case A — 1-1 with your manager (you carry the topics)

```markdown
# Prep 1-1 — [First name] (my manager) — [date]

## What I want to raise (Top 3)
The topics not to miss, by impact. For each: where we stand, what I expect from them
(decision, support, info, unblocking).
1. **[Title]** — [1-line context] → I expect: [decision / support / arbitration]

## Since last time
What has moved and is worth reporting or sharing (progress, risks, signals). Enough to have
"something to chew on" instead of arriving empty-handed.

## Questions / requests
What I want to clarify or obtain (priorities, resources, feedback on me).

## My commitments in progress
What I had committed to do — status kept / in progress / at risk.
```

### Case B — 1-1 with someone you manage (follow-up + operational + KPI)

```markdown
# Prep 1-1 — [First name] — [date]

## Commitment follow-up
- **What the other person committed to do** (since the last 1-1): status kept / in progress / not done.
- **What I want to delegate to them** (new delegations, responsibilities).
(Draws on the backlog `vault/backlog/<name>.md`, sorted by age.)

## Important operational topics
The 2-3 hot topics in the scope to address, with the concrete question to ask.

## KPI review            # 🔧 TO REFINE: define YOUR metrics here
Collection + review of the metrics that matter for you. Possible examples (replace with your
own): DORA (lead time, deployment frequency, MTTR, change-fail rate), quality, delivery,
satisfaction, capacity… For each KPI: value / trend / question to dig into.
| KPI | Value / trend | Question |
|---|---|---|
| [your KPI] | [↑/↓/→] | [what you want to understand] |

## Weak signals
Tensions, frustrations, overload, dodged topics — with tact, no beating around the bush. (Omit if nothing.)

## Recurring focus areas          # 🔧 TO REFINE: the 3-5 themes you track with each report
| Focus area | Detected signal | Default question |
|---|---|---|
| [your focus area] | [signal or "none"] | [question] |

## Checklist (before/during the 1-1)
- [ ] …
```

In both cases, end with a collapsible **"Full context"** block (summary of the last 1-1,
decisions, follow-up actions `| # | Action | Who | When | Status |`, verbatims, messaging/email/meeting
activity with links, source quality).

## Step 3 — Update the backlog
In `vault/backlog/<name>.md`: **add** the new actions, **check off** those with proof
of completion, **update** the `updated:` date. Append-only on facts already recorded.

## Writing rules
- English, direct and ultra-concise tone; bullet lists rather than paragraphs.
- Do not make things up; flag a partial or low-quality source.
- No empty section — omit it (except "KPI review" and "Recurring focus areas" in case B, to keep
  as a reminder even when empty, since these are the sections you must make your own).
- Never a bare URL: `[text](url)`. Backlinks `[[people/firstname-lastname]]` (never a first name alone).

## Refining this skill (that's the point of a meta skill)
The structure above is a **starting point**. Make it yours: replace the example KPIs with
your own, add/remove recurring focus areas, adjust the sections to the type of 1-1 you run.
You can do it by hand (edit this file) or ask **`/improve`** to assist you.

## Success criterion
In < 2 minutes of reading, you know what to address, why, with which opening question — and,
on the manager side, where the commitments and the KPIs that matter stand.

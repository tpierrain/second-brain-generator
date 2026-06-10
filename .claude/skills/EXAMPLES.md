# Skills to build yourself — examples for inspiration

This generator provides only a few generic skills: `sync` (inter-machine git sync),
`improve` (harness improvement), `coach` (fierce sparring partner on yourself),
`prepare-1-1` (prepare a 1-1 with anyone) and `sync-sources` (the
fan-out/fan-in architecture that pulls the delta from sources, engine of Phase 2). `coach` and `prepare-1-1`
are **reference implementations** you can draw inspiration from. The rest is yours to
build, **according to your usage**.

This is where your second brain becomes *yours*: a skill = an angle of attack on the
same vault. Here are some common ideas (to adapt, not to copy as-is).

## Anatomy of a skill

A skill lives in `.claude/skills/<name>/SKILL.md` with a frontmatter:

```markdown
---
name: my-skill
description: "Sentence that says when to use it — that's what Claude reads to decide whether to trigger it."
version: 1.0.0
---

# /my-skill — Title

## When to use it
…

## Procedure
1. …
2. …

## What it produces
…
```

## Skill ideas (by usage)

| Skill | What it does | Typical sources |
|---|---|---|
| **daily-briefing** | Morning briefing: today's agenda, hot topics, priority actions (relies on `sync-sources`) | Calendar, vault/backlog, vault/daily |
| **prepare-meeting** | Before a meeting: brings back the history, open points, the context of the participants | Calendar, vault, transcripts |
| **prepare-1-1** ✅ shipped | Brief before a 1-1: latest exchanges, commitments, weak signals | Calendar, Slack, vault/backlog |
| **coach** ✅ shipped | Sparring partner connected to the vault: challenges reasoning, recalls commitments (self-coaching) | entire vault |
| **briefing** | After an absence: synthesis of what happened on the channels you follow | Slack, email |
| **debrief** | At the end of the day: turns events into structured notes (daily, topics) | conversation, vault |
| **weekly-review** | Weekly review: what has moved, what is stalling, what is coming | vault/backlog, Calendar |
| **fresh-eyes-report** | Capture your fresh perspective when taking a new role / a new mission (surprises, blind spots) | vault, observations |

## Recommended method

1. **Start with the direct-question flow** (described in CLAUDE.md) — often it's enough, no skill needed.
2. **Create a skill when a need recurs**: if you ask for the same thing 3 times, it's a skill.
3. **Use `/improve`** to evolve your harness as frictions arise.
4. **Keep skills thin**: a skill describes a procedure, it doesn't reimplement the engine.

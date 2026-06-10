---
name: improve
description: "Continuous improvement of the harness. Reads the friction backlog, detects frictions from the current session, proposes the most impactful improvements and implements them."
version: 1.0.0
---

# /improve — Continuous improvement of the harness

## Routing

- **No argument** → **Session mode** (A).
- **`ajouter <description>`** (or `add`) → **Quick-add mode** (B).

---

# MODE A — Improvement session

## A1 — Read the backlog and observe
1. Read `vault/backlog/harnais.md` (backlog of pending improvements).
2. Read the most recently modified files in `.claude/skills/` to understand the state of the harness.
3. If the conversation has 10+ exchanges, detect frictions:
   - Repeated workarounds (same action 2+ times)
   - Questions the vault couldn't answer
   - Failed skills or unsatisfactory results
   - Too many rounds to find a piece of information
   Add the observations to the backlog with the `[observation]` tag.

## A2 — Propose the priority improvements
Present the 3 most impactful improvements, prioritized by impact/effort ratio, recurrence, leverage. For each: title + tag, impact (1 sentence), effort (quick win < 30 min / project), proposal (2-3 lines).
End with: "Which one do we tackle?"

## A3 — Implement
1. Make the changes (skills, CLAUDE.md, vault structure…).
2. Test if possible (dry run, syntax check).
3. Mark the item `[x]` + date in `vault/backlog/harnais.md`.
4. Let the hook commit.

---

# MODE B — Quick add
Add the idea to `vault/backlog/harnais.md`: categorize (quick win / project / idea), `[explicite]` tag + today's date, confirm in one line. **Do not implement.**

---

# Passive observation (outside the skill)
> Rule in CLAUDE.md (section 5). Applies automatically to every session of 10+ exchanges,
> not only when `/improve` is invoked.

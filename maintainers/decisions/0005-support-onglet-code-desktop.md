# ADR 0005 — Support for the Code tab (Claude desktop app) as an official target

- **STATUS:** ACCEPTED (2026-06-06), **REVISED on 2026-06-06** — conclusion (ii) "hard gate +
  forbid installs" is **reversed** in favor of "trust Claude + fail loud". See the
  **"Revision 2026-06-06"** section at the end of the document. The official desktop target (the
  central decision of this ADR) remains **unchanged**; only the *way we make it reliable* changes.
- **Related:** [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (the Code
  tab is **another surface of the same Claude Code** — it does NOT reopen cross-AI),
  [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md).
- **Associated implementation plan:** [`../plans/archived/onglet-code-desktop.md`](../plans/archived/onglet-code-desktop.md).

## Context

Until now, onboarding and use of the generator were designed around the **terminal** (Claude Code
CLI: `cd`, `node bootstrap.mjs`, `claude`). We now also target **non-technical profiles (PMs,
managers)** who live in the **"Code" tab of the Claude desktop app**.

Verified in a real session (Thomas's machine, 2026-06-05): the Code tab **is the same Claude Code**
as the CLI — same `PostToolUse`/`SessionStart` hooks, same `.mcp.json`, same skills. The
auto-commit hook ran, the `vault-rag` MCP server responded (search + live indexing).

**Consequence:** there is **no "desktop port" to write**. The generator already produces a brain
that runs in the Code tab. What's missing falls under **(a) environment robustness** (the
`node`/`npm`/`npx`/`git` toolchain absent or not visible to the GUI app) and **(b) non-terminal
onboarding** (a non-dev manager doesn't run `cd`).

### Founding anecdote — Richard's machine (2026-06-05)

The need isn't theoretical. An install attempt for **Richard** (head of offerings at Shodo, a
**non-dev profile**), from the **Code tab of Claude desktop**, via the simple sentence "install my
second brain from the repo URL". His machine was **bare**: no `git`, no `npm`, no `node`. What we
observed:

1. During the bootstrap, lots of prerequisites were missing (npm, git…). **Claude then installed
   some pieces dynamically, on its own** → a **half-broken** state, hard to diagnose (a
   semi-functional Frankenstein, worse than a clean error).
2. The `vault-rag` RAG server was **not started**. Telltale symptom: the **first demo question
   (Star Wars) went off to look up the answer on the Internet** (Luke Skywalker from a generic
   source) **instead of querying the vault**. It *looked* like it was working — but the brain was
   useless (silent RAG bypass).
3. Fell back to **Claude Code CLI** (known to work better) to unblock the session.
4. **Afterward** (on the train back to Lyon), Thomas tested the brain in **Claude desktop / Code
   tab on HIS machine** (toolchain present and well placed) → **it works**.

**What the anecdote proves.** (i) The failure was **100% upstream** (missing toolchain), never at
runtime → the toolchain pre-flight is the pivot. (ii) The worst part isn't the missing tool but
**Claude improvising installs** → we need a **hard gate** that stops and hands the install to the
human, and we need to **forbid Claude from improvising** (`brew`/`curl | sh`). (iii) The **silent
RAG bypass** (answering from the Internet when the server is down) is the most dangerous false
positive for a non-dev → we need to **fail loud** and a **visible startup status** (cf. known
limitation below). Implementation details in the associated plan.

## Decision

We **accept the Code tab (Claude desktop app) as an official install/usage target**, on par with
the CLI. The corresponding work stays **in the Claude orchestration layer** (PATH robustness, MCP
pre-approval, "Open folder" onboarding) — detailed in the plan
[`onglet-code-desktop.md`](../plans/archived/onglet-code-desktop.md).

**This is NOT the cross-AI effort deferred by ADR 0004.** The Code tab = Claude Code on another
surface, not another client. We stay **Claude-only**; this ADR does not touch that invariant.

## Consequences

- **Guarantees a reachable non-tech target:** a PM can install and query their brain without ever
  opening a terminal — provided the toolchain is visible to the GUI app (cf. plan, CHANGE 1).
- **Adds no multi-client abstraction:** we don't create a "desktop vs CLI" layer; we harden the
  existing one (absolute paths already baked by the bootstrap, we bake one more).
- **Costs an explicit environment dependency:** on a clean machine, `node`/`npm`/`git` must be
  **GUI-visible** (official `.pkg`/`.msi` installer, **not nvm**). That's a prerequisite constraint
  to document and diagnose in pre-flight, not an architecture change.
- **Invariant preserved:** introduce **nothing** that would assume a client ≠ Claude (cf. 0004) nor
  that would duplicate the harness for the desktop. A single mechanism, made robust across two
  surfaces.

## Known limitation (unresolved to date)

In the **CLI**, the `SessionStart` hook does display, at session open, a useful **startup status**:
RAG server state, git repo sync (and presence of the Gemini key). This status is emitted via the
hook's `systemMessage` JSON field (`scripts/session-status.mjs`).

**In the Code tab of the desktop app, this status does not show** — Thomas has not (yet) found a
way to surface it as in the CLI. The RAG and auto-commit **still work** (it's cosmetic in the
strict sense), but it's an **experience gap to close**: for a PM, seeing "RAG ready / repo synced"
at startup is reassuring and is part of the non-terminal onboarding that motivates this ADR.

→ **To resolve** (cf. plan, CHANGE 4): find the equivalent display channel on the desktop side, or
failing that, explicitly document that the startup status may not appear on desktop. Until this is
settled, treat this CLI/desktop parity as **an open point**, not as a given.

## Rejected alternatives

- **Writing a dedicated "desktop port"** — pointless: the Code tab already runs hooks + MCP +
  skills. Would have duplicated the harness for nothing.
- **Staying terminal-only and sending PMs to the CLI** — closes the door on the non-tech target
  that motivates the product. The overhead (PATH robustness + onboarding) is moderate and
  deterministic.

## To reconsider when

If **another surface** appears (a third-party MCP client, claude.ai web without a full Code tab):
that would be the cross-AI of ADR 0004, a decision to reopen **on real feedback** — not covered
here.

---

## Revision 2026-06-06 — reversing (ii): trust + fail loud, no gate

> *Dated addendum. We don't rewrite the history above: it documents the reasoning as it stood. This
> section records what changed and why.*

### What triggered the revision
Attempt on **Achille's bare Mac** (Code tab) to close out failure hypothesis A. Measured findings:
- `git` present (`/usr/bin/git`, Xcode CLT); **node / npm / npx absent**.
- **Code tab's PATH = `/usr/local/bin`** (+ system), **but neither `/opt/homebrew/bin` nor the
  nvm/asdf shims** — field data that sharpens the "GUI-visible toolchain" consequence of the ADR.
- **Claude's agency NOT proven**: we **cut before the verdict**. We don't know whether Claude would
  have managed to install the toolchain cleanly from the Code tab.

### What is reversed
Conclusion **(ii)** of the founding anecdote said: *"we need a hard gate that stops and hands the
install to the human, and forbid Claude from improvising installs."* We **reverse** it:

- **Failure A (Claude improvises badly) is an UNPROVEN hypothesis.** We don't harden (gate, ban)
  against a risk we haven't demonstrated — that would be over-engineering.
- **We TRUST Claude to install** (that's the UX of the Claude era). **No install gate.**
- **The only net is the LOUD failure** of failure B (which *is* **proven**: silent RAG bypass at
  Richard's). We **catch** the broken install instead of *preventing* it:
  - **runtime** — the generated constitution refuses to answer outside the vault when `vault-rag`
    is unavailable (CHANGE 6, done);
  - **install-time** — the bootstrap's post-flight proves the demo answers **from the vault** (cited
    source), otherwise loud FAIL + `exit 1`; without a key, the demo check is honestly **deferred**
    (no false green).

### Consequences for (i) and (iii)
- **(i)** remains true *in part*: the failure observed at Richard's was upstream (toolchain). But we
  don't know whether it's **fatal** (Claude might get through) → we no longer pre-flight, we verify
  **afterward**.
- **(iii)** is **kept and reinforced**: the silent RAG bypass is indeed the most dangerous false
  positive → fail-loud (runtime) **+** sourced post-flight (install-time). That's the heart of the
  revised strategy.

### Status
Gate items (deterministic pre-flight, bootstrap STOP, install ban, GUI-visible PATH heuristics,
baked self-heal) are **frozen/removed** — detail and "why" in the plan
[`../plans/archived/onglet-code-desktop.md`](../plans/archived/onglet-code-desktop.md) §5. The
"SessionStart status invisible on desktop" limitation is now **covered** by the post-flight
(install-time) and the fail-loud constitution (runtime).

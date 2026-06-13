# ADR 0009 — Prefer deterministic mechanisms (reliability principle)

- **STATUS:** ACCEPTED (2026-06-13).
- **Scope:** Second brain (runtime) + Installer — a cross-cutting reliability principle (brain runtime first, installer too).
- **Related:** [`0002-in-house-installer-vs-plugin.md`](0002-in-house-installer-vs-plugin.md)
  (the install is **one deterministic script**), [`0005-support-desktop-code-tab.md`](0005-support-desktop-code-tab.md)
  (trust + **fail-loud**, deterministic pre-flight, visible startup status),
  [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md)
  (embedder swap = **confirm-gate, never a silent reindex**).
- **Reference instance:** [`../plans/archived/debounce-auto-push.md`](../plans/archived/debounce-auto-push.md)
  (the `Stop` event **is** the debounce — no timer, no state file).

## Context

A second brain is a **trust artifact**: the user **offloads** to it and stops re-checking — so the
failures that kill it are the **silent** ones (a note not persisted, an answer from *outside* the
vault, a push that never happened). It also runs **unattended** on a **non-dev's bare machine**
(minimal PATH, often the desktop app), where a probabilistic glitch is **undiagnosable**. The answer
this project keeps reaching for: make the **load-bearing** steps **deterministic and observable**
— plain JS we can test, tools with a binary verdict, hooks bound to real events — and keep the LLM
for what genuinely needs judgment. ADRs 0002 / 0005 / 0006 each reached it locally; this one **names
it** so we can cite it instead of re-deriving it.

## Decision — the determinism ladder we build on

For any **load-bearing** step (one whose silent failure would cost a note, a backup, or a correct
answer), reach for the **highest rung that fits**, and only drop down for a stated reason:

1. **A pure JS function with injected dependencies** — correctness lives in I/O-free code unit-tested
   with a fake runner. Ex.: `shouldPush(...)` (the push decision matrix), `countVaultUncommitted(...)`
   / `repoStatusLine(...)` (the startup guard). Most deterministic, fastest to test.
2. **A small JS tool with a binary exit code** — the caller (a script, or Claude) reads a *verdict*,
   not prose. Ex.: `verify-rag.mjs` (`exit 0` operational / `exit 1` + message), `installer.mjs
   --non-interactive` (does everything, **refuses if the target folder exists** so it's provably the
   creator, judges its own success by exit code).
3. **A hook bound to a real event** — fires because something *provably happened*, never because a
   timer or the model decided to. Ex.: `PostToolUse Write|Edit → auto-commit.mjs`, `Stop →
   auto-push.mjs`, `SessionStart → session-status.mjs`.
4. **When time genuinely matters, a bounded scheduler with an injected clock + a lock** — not a
   sprinkled `setTimeout`. Ex.: `ReindexScheduler` (coalesces a write burst into **one** incremental
   reindex, 5 s window, `setTimer` injected for tests) + `reindex-lock` (pid/timestamp, injected
   storage) to serialize reindexes across windows.
5. **Fail loud over silently wrong** — when a deterministic check can't pass, surface an explicit
   signal. Ex.: the sourced canary, the startup "N notes NOT committed" guard, the embedder
   **confirm-gate** on a stamped index identity (ADR 0006).
6. **LLM / natural language only where judgment is the point** — the onboarding chat, the confirm-gate
   *wording*. Never for the load-bearing correctness underneath, which always keeps a deterministic
   seam (a function, an exit code, an event).

Two transverse rules fall out of the ladder:

- **No hidden, driftable state.** A short-lived hook **re-derives** what it needs each run (`run-node`
  re-resolves node on every launch; `auto-push` re-queries `git remote` / `@{u}..HEAD`) rather than
  trusting a baked path or a state file.
- **Best-effort, non-blocking for non-load-bearing side-effects.** A push that fails `exit 0`s with a
  warning and self-recovers at the next `Stop`; the durable local commits are the safety net.

## The deterministic machinery (what we actually ship)

| Mechanism (file) | What it guarantees | Why deterministic — how tested |
|---|---|---|
| `auto-commit.mjs` (PostToolUse) | every note edit → a local commit | edit-event-triggered, pure git, `exit 0`; `auto-commit.test.mjs` on a real tmp repo |
| `auto-push.mjs` + `lib/git-push.mjs` (Stop) | the turn's commits pushed **once**, best-effort | the `Stop` event *is* the debounce (no timer/state); pure `shouldPush` + injectable `attemptPush({git, sleep})` — **10/10** tests |
| `reindex-scheduler.ts` (MCP process) | a write burst → **one** incremental reindex | bounded 5 s coalescing, **injected** `setTimer`; `reindex-scheduler.test.ts` with a fake clock |
| `reindex-lock.ts` | no two windows reindex at once | pid+timestamp lock, **injected** storage; `reindex-lock.test.ts` |
| `verify-rag.mjs` | proves the RAG answers FROM the vault | deterministic `exit 0` / `exit 1` on the sourced canary |
| `session-status.mjs` + `lib/repo-status.mjs` | loud ⚠️ if notes were left uncommitted | pure `countVaultUncommitted` / `repoStatusLine`, unit-tested |
| `lib/rag-launcher.mjs` (`run-node.*`) | hooks/MCP keep working on a bare PATH | **re-resolves** node every run, no baked path |
| `installer.mjs --non-interactive` | one command creates **and** verifies the brain | refuses if the folder exists; self-judging exit code |
| `lib/open-env.mjs` (CASE B) | the `.env` is opened for the user deterministically | tested seam + `SBG_NO_OPEN_ENV` guard; `open-env.test.mjs` |

## Consequences

- **Determinism and our TDD discipline are the same lever.** Every rung-1/2 seam is, by construction,
  the thing we can unit-test with an injected runner — which is *why* the codebase is full of
  `({git, sleep})` / `setTimer` / injected-storage signatures. "Make it deterministic" and "make it
  testable" are one move.
- **A shared review question:** *"what's the deterministic seam here, and where exactly do the LLM /
  the timer come in?"* — and dropping a rung now needs a stated reason.

## Rejected alternatives

- **Leaving it implicit** (status quo) — kept getting re-derived per ADR; naming it once is cheaper
  and citable.
- **"Deterministic always wins"** — would mandate gold-plating (a state machine where a best-effort
  `exit 0` suffices) and fight the no-over-engineering rule. It's a *preference at equal reliability*,
  and the ladder explicitly tops out at "LLM where judgment is the point".

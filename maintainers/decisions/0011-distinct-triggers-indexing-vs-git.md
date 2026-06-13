# ADR 0011 — Indexing and git auto-save use distinct triggers (don't unify on the file-watcher)

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) — the generated brain's two background mechanisms (indexing + git persistence) in daily use.
- **Related:** [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md)
  (the RAG/MCP hexagon's job is **retrieval**, not version control — this ADR keeps git *out* of it),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (which already lists `auto-commit.mjs` and `reindex-scheduler.ts` as **two distinct rungs** — this
  ADR *names* that split as a decision), [`0010-debounce-auto-push-to-stop-hook.md`](0010-debounce-auto-push-to-stop-hook.md)
  (same "the **event** is the debounce, not a daemon-timer" reasoning).

## Context

The generated brain runs **two** background mechanisms that both react to "a note changed", but for
**different reasons** and on **different triggers**:

| Concern | Trigger | Lives in | Sees the edits of… |
|---|---|---|---|
| **Indexing (RAG)** | **`chokidar`** file-watcher (`vault-watcher.ts` → `ReindexScheduler`, 5 s debounce, incremental sha256) | the **MCP server process** (long-lived, but **only while a brain conversation is open**) | **everyone** on the filesystem: Claude, Obsidian, a manual editor, a sync tool |
| **Git auto-save** | the Claude **`PostToolUse Write\|Edit`** hook (`auto-commit.mjs`) + the **`Stop`** hook (`auto-push.mjs`) | the **Claude client** | **only Claude** (its `Write`/`Edit` tools) |

A natural "DRY" question arises: *`chokidar` already watches the whole filesystem — why not **also**
drive `git commit` from it, instead of from a Claude hook that only sees Claude's own edits?* The
apparent win is real but narrow: the watcher would catch **non-Claude edits** (typically **Obsidian**,
the recommended viewer, or a manual edit) that the `PostToolUse` hook **silently misses** today,
leaving them uncommitted until Claude's next edit.

This ADR records why we **keep the two triggers separate** anyway.

## Decision

**Indexing and git auto-save stay on two distinct triggers. We do NOT move `git commit` into the
`chokidar` watcher.**

- **`chokidar` drives indexing only.** Its 5 s debounce + coalescing is an *asset* for re-embedding
  (don't re-encode mid-write, bundle a write-burst into one incremental pass).
- **Claude hooks drive git** (`PostToolUse` → commit per edit; `Stop` → push once per turn, per
  ADR 0010). Event-exact, serialized per conversation, with tool context available on stdin.

The shared thing between the two is only **change *detection*** — and we already have it in **two
valid, orthogonal places** (the hook for Claude edits, the sha256 hash for the index). Merging the
*triggers* to "reuse `chokidar`" would be reuse for reuse's sake: it buys little and breaks three
things (below).

### Why not unify on `chokidar` — the costs

1. **It would couple git persistence to the RAG engine — and, worse, share its failure domain
   (against ADR 0006's separation).** Design-wise, the `vault-rag` MCP server's contract is
   **retrieval**; embedding `git commit` in its watcher gives it a second, unrelated responsibility
   (version control). But the sharper point is **resilience / availability — don't put all eggs in one
   basket**: if the backup lived *inside* the MCP, **any** MCP problem (fails to boot on a bare PATH,
   crashes, an ONNX hiccup) would take the **save** down with it. In the Claude hooks, notes keep being
   committed **independently of the RAG server's health**. For a **trust artifact**, the silently
   **unsaved note is the worst failure there is** (ADR 0009's founding context) — persistence must
   **survive a degraded RAG, not share its fate**.
2. **The watcher is "dumb" about *why*; the hook is not.** `chokidar` sees only a **filesystem diff**
   ("a file changed") — it has no idea of the **intent** behind the edit, so its commit message can
   only be generic. The Claude hook, by contrast, capitalizes on the **LLM + tool context** (which
   file, which tool, the surrounding conversation) to write an **intent-bearing, guiding commit
   message**. Driving commits from Claude makes each commit *more useful* — an **explained** history,
   not just a snapshot.
3. **It would re-introduce a timer/coalescing into the *commit* path (against ADR 0009).** Good for
   indexing, bad for commits: a commit could fire **mid-write** (partial file — you'd need
   `awaitWriteFinish`) and would **bundle logically-distinct edits** into one vague commit. This is the
   timer + driftable-bundling that ADR 0010 deliberately *avoided* for the push.
4. **It would amplify the multi-window race.** N brain windows = N MCP processes = **N `chokidar`
   watchers** all attempting `git commit` on the same repo → lock contention + racing commits. The
   `PostToolUse` hook is naturally serialized per conversation. *(See the open multi-window question;
   pushing git writes into the watcher makes it worse, not better.)*

## The accepted gap (non-Claude edits) and how we'd close it *if* it mattered

The separation leaves one **honestly-acknowledged gap**: an edit made **outside Claude** (Obsidian /
manual editor) does **not** trigger `auto-commit` and sits uncommitted until Claude's next edit.

- **For the maintainer**, this gap **does not bite** (edits go almost always through Claude).
- **For an end user** of a generated brain, it *can* — they may edit notes directly in Obsidian.
- **But `chokidar` would only half-close it anyway**: the watcher lives in the MCP process, which runs
  **only while a brain conversation is open**. An Obsidian edit with **no Claude session** open → no
  watcher running → no commit either. So the unification doesn't even buy the full coverage it seems to.

**If** this gap ever proves to bite in real use (currently **unproven** — we don't build against it
yet), the on-brand fix is **not** a daemon-timer but an **event-bound deterministic sweep** (same shape
as the `Stop`-event push of ADR 0010 — the *event* is the debounce):

- [ ] add a `git add -A && commit-if-dirty` sweep on a **conversation-boundary event** (a `SessionStart`
      and/or the existing `Stop` hook) — catches manual/Obsidian edits **without** a timer, **without**
      touching the MCP, once per session boundary;
- [ ] keep it **best-effort `exit 0`** (never blocks the turn), reusing the `repo-status`/git seams
      already unit-tested for `session-status.mjs` and `auto-push.mjs`.

The theoretical "catch Obsidian edits even with **no** Claude session" would require an **always-on OS
daemon** (launchd/cron) or a **git-side hook** — heavier, against the "zero daemon" simplicity, and
**out of scope**.

## Consequences

- **Each mechanism keeps the trigger it's good at.** Indexing gets `chokidar`'s coalescing; git gets
  the event-exact, per-conversation-serialized, tool-aware Claude hooks. The review question becomes
  explicit: *"is this change about retrieval (→ MCP/watcher) or about persistence (→ a git hook)?"*.
- **The RAG↔git boundary stays clean** (reinforces ADR 0006): a bug on one side can't silently break
  the other — note persistence and retrieval fail in **independent domains**.
- **The non-Claude-edit gap is documented, not hidden** — with a ready, deterministic, event-based
  remedy held in reserve, gated on a *proven* need (no over-engineering).

## Rejected alternatives

- **Unify on `chokidar` (drive `git commit` from the watcher)** — the three costs above (timer in the
  commit path / RAG↔git coupling / amplified multi-window race), for a coverage win that the watcher's
  own lifecycle only **half** delivers. Refused.
- **An always-on OS daemon or a git-side hook** (to commit even with no Claude session) — would close
  the gap fully, but adds an always-running process against the "zero daemon" simplicity and the
  non-dev bare-machine target. Deferred / out of scope.
- **Pretend there is no gap** — dishonest; the gap is real for users who edit in Obsidian. We document
  it and keep the event-sweep remedy ready instead.

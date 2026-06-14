# Post-QA polish — conversational version answer + status-line key segment (PR #10)

**STATUS: 🚧 PLANNED (not started).** Two small findings from the maintainer's **manual QA** of the comet-tail
(2026-06-14), on branch `engine-packaging` (**PR #10**, draft). **Doc-only / thin wiring; no `rag/` change.**
**To be implemented AFTER a `/clear`** (the maintainer's explicit call). Sequencing (maintainer's plan):
**this polish → `/code-review` on the diff → manual QA campaign → merge `main` + tag `v3.0.0`** (post-demos,
ADR 0014). ⚠️ **No `main` merge before the Mon/Tue demos.**

> Surfaced while QA-ing the freshly-installed test brain (`~/sbg-statusline-smoketest`, in-process):
> the **status-line display** of the engine version works on both surfaces (CLI + Desktop), but two gaps
> remain — the **conversational** version answer and a **false "Gemini key missing"** warning.

## ▶ Progress checklist (SOURCE OF TRUTH — resume at the first unchecked box)

> **To resume after `/clear`:** say **« reprends le plan polish »**. The agent checks out `engine-packaging`,
> reads **this** checklist, does the first unchecked `- [ ]` in **TDD baby-steps** (skill `tdd-discipline`),
> **commits green only** ([[commit-only-green-todo-gate]]), ticks the box in the finishing commit, and mirrors
> progress in the PR #10 body.

- [ ] **Item 1 — Conversational version answer = the engine TAG, not the mechanical vector** _(= the maintainer's
      "A"; aligns the spoken answer with [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md)
      and with the status-line)._
  - [ ] **constitution EN** (`CLAUDE.md.template`): add a short guidance line — when asked "what's your engine
        version", read `engine-manifest.json` and report **`source.ref`** (the engine tag, e.g. `engine v3.0.0`)
        as THE version; the `rag X.Y.Z` / index-schema from `vault_stats` is **internal mechanics** (mention only
        if the user digs). Natural home: near the existing "intent → MCP tool" table (line ~164).
  - [ ] **constitution FR** (`templates/fr/CLAUDE.md.template`): the same guidance, in French (table ~line 151).
  - [ ] **`update-engine` SKILL.md**: one line so the version-reporting path also points to `source.ref`
        (the skill already says the engine "records its version + where to pull from in `engine-manifest.json`").
  - [ ] _(optional, DEFERRED post-demo)_ harden by making **`vault_stats` itself surface `source.ref`** as the
        headline version (so the answer is robust even without guidance). **Not now** — it touches `rag/` and the
        MCP contract (ADR 0006/0014). Guidance is enough pre-demo.
- [ ] **Item 2 — status-line: stop the false "⚠️ Gemini key missing" on keyless embedders.** _(pre-existing bug,
      now QA-confirmed user-visible on an in-process brain — CLI screenshot 2026-06-14.)_
  - [ ] `scripts/status-line.mjs`: gate `keySeg` behind **`geminiKeyRequired(envContent)`** (import it from
        `./lib/gemini-key.mjs`) — only warn when a Gemini key is **required** (provider gemini/default) **and**
        missing. In-process / ollama / openai-compatible brains → **no warning**. (Same fix already applied to
        `session-status.mjs` at embedder Étape 5 — status-line was missed.)
  - [ ] guard: `gemini-key.mjs` is already unit-tested (`geminiKeyRequired` covers in-process/openai/gemini);
        add a minimal test only if the status-line wiring is extractable — else rely on the lib tests + a manual
        re-check (in-process brain → no "key missing" segment).
  - [ ] _(optional, decide with maintainer)_ also surface the engine version in the **CLI startup banner**
        (`session-status.mjs` `systemMessage`) — currently intentionally skipped (status-line covers both
        surfaces). 2 lines if wanted; otherwise leave.
- [ ] **Definition of done** — harness `node --test` green (fail 0, todo 0), **no `rag/` code change**, `tsc` n/a;
      tick all boxes with _(date · commit)_; refresh the PR #10 body; **NO `main` merge** (post-demos). When done,
      `git mv` this plan into [`plans/archived/`](archived/) ([[plan-done-equals-archived]]).

## Findings (the QA evidence, so a fresh window has the context)

- **Finding 1 (Item 1) — and it's NON-DETERMINISTIC, which is the real reason guidance is needed.** Same
  question *"quelle version ?"*, two surfaces, two different answers:
  - **Claude Desktop** (Code tab) → **"rag 1.1.0"** via `vault_stats` (the mechanical `engineVersion` vector
    from `rag/package.json`) ❌ — the **wrong** number per ADR 0017.
  - **CLI** → **"engine engine-packaging"** from `engine-manifest.json` `source.ref`, correctly citing ADR 0017
    (offline, no network) and even spontaneously flagging the branch-vs-tag nuance ✅ — the **right** answer.

  So without guidance the answer is a **coin flip** (surface/model/effort/luck) between the `source.ref` tag and
  the mechanical vector — and the **majority audience is Desktop**, where it landed on the wrong one. ADR 0017
  makes the **`source.ref` tag** the user-facing version and the `engineVersion` vector "mechanics only"; the
  **status-line is always correct**, only the **conversational** answer is unreliable, because nothing tells the
  brain which to use and `vault_stats` hands it the mechanical value. **Item 1's guidance makes the correct
  answer reliable on every surface** (not a one-off bug — a determinism fix).
- **Finding 2 (Item 2).** CLI **and** Desktop status-line show **`⚠️ Gemini key missing`** on the in-process test
  brain (which needs **no** key). `status-line.mjs` calls `hasGeminiKey(envContent)` unconditionally instead of
  gating on `geminiKeyRequired(envContent)`. Misleading for the keyless embedders that are now the default path.

## Decisions settled (2026-06-14, with the maintainer)

- **Item 1 approach = guidance (doc), not a tool change, pre-demo.** The `vault_stats`-surfaces-`source.ref`
  hardening is **deferred** (post-demo) because it touches `rag/` + the MCP contract.
- **Both items ride PR #10**, implemented **after a `/clear`**, **before** the `/code-review`, so the version
  feature is complete and reviewed as a whole.
- **No `main` merge before the demos** (ADR 0012/0014); merge + tag `v3.0.0` only after QA is green.

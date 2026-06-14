# Post-Phase 1 follow-ups — engine version surfacing + autocompact threshold (PR #10 comet tail)

**STATUS: 🚧 PLANNED (not started).** On branch `engine-packaging` (**PR #10**, draft), as the
**"queue de comète"** (comet tail) of the now-closed Phase 1 `update-engine` work. **To be implemented
AFTER a `/clear`, in a fresh window** (the maintainer's explicit call — avoid context rot). The maintainer
wants both chantiers in PR #10 so the **whole restructuring can be tested locally tonight**, before the
post-demo merge.

> These are the two **parked observability follow-ups** that lived at the bottom of the (now archived)
> [`engine-packaging-phase1-action.md`](archived/engine-packaging-phase1-action.md). They are **additive
> and separate** — NOT a scope-widening of Phase 1 itself; they ride the same branch only so they're tested
> together. ⚠️ **No merge to `main`** before the Mon/Tue client demos (ADR 0012 / 0014) — the maintainer
> merges after local testing.

## ▶ Progress checklist (SOURCE OF TRUTH — resume at the first unchecked box)

> **To resume after `/clear`:** say **« reprends le plan version + autocompact »** (or the usual
> « reprends le plan où on en était sur la PR ouverte » — the single open PR is #10). The agent checks out
> `engine-packaging`, reads **this** checklist, does **the first unchecked `- [ ]`**, TDD baby-steps
> (skill `tdd-discipline`), **commits green only** ([[commit-only-green-todo-gate]]), ticks the box in the
> finishing commit, and mirrors progress in the PR body.

- [ ] **Chantier A — Surface the engine version in the status-line.** _(scope **revised** with the maintainer
      2026-06-14, see [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md): ship the
      **offline display NOW** (A1); the **"update available" detection is DEFERRED** to a later, **opt-in,
      non-blocking, background** iteration (A2) — the first draft's silent startup ping was dropped because it
      re-coupled the brain to the generator, against ADR 0001/0014.)_
  - [x] **A1 — Offline version display (cheap, deterministic, no network) — THE work to do now.** _(done 2026-06-14)_
    - [x] pure lib `scripts/lib/engine-version.mjs`: `formatEngineVersion(manifest)` → `"engine <source.ref>"`
          — **the displayed version is the git TAG the brain was generated/last-updated from**
          (`source.ref`, already recorded in the manifest at install), NOT a hand-maintained number. E.g.
          `source.ref = "v1.1.0"` → `"engine v1.1.0"`. **Fallback** when `source.ref` is absent or not a
          semver tag (dev launcher, install from a branch) → show the ref verbatim, or `engineVersion.rag`
          as a last resort; never invent. Missing/invalid manifest → `null`. Unit tests first (TDD: tag ref,
          non-semver ref, no source, missing file/null). _(6/6 green, commit aaa0f64)_
    - [x] wire into `scripts/status-line.mjs`: read `engine-manifest.json` at REPO root (**fail-silent** —
          no manifest → no segment), append an `engine v…` segment to the existing `· `-joined line. The
          status-line contract is **READ-ONLY + FAST** — this is a plain file read, safe here. _(done 2026-06-14;
          smoke: launcher shows `engine 1.1.0` via the rag fallback — no `source` recorded, correct.)_
    - [x] _(optional — SKIPPED)_ also surface it in `scripts/session-status.mjs` `systemMessage`: **not worth the
          duplication** — the status-line already renders persistently on **both** surfaces (CLI terminal +
          Desktop Code tab), whereas `systemMessage` is CLI-only. Decision 2026-06-14.
  - [ ] **A2 — "Update available" detection — DEFERRED (do NOT build now).** Comes back in a few days as a
        separate, **opt-in, non-blocking, background** iteration (maintainer's call 2026-06-14). Captured here
        so the design is ready; **nothing in A1 closes this door** (see "future-proofing" below). Constraints
        when it lands (per [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md)):
    - [ ] **Opt-in, default OFF** (a setting the user enables) — honours ADR 0014 ("user-triggered, never a
          standing remote or a silent auto-update").
    - [ ] **Never blocks startup.** A **detached, fire-and-forget background producer** (the SessionStart hook
          spawns a child it does **not** await — `child.unref()` — or an equivalent background task) does a
          throttled (~once/24h), **fail-silent** `git ls-remote --tags <source.repo>`. Deterministic detached
          process **preferred** over an LLM sub-agent for a mechanical fetch (ADR 0009), but the architecture
          supports either.
    - [ ] **Producer/consumer decoupled via a cache** (the contract that makes A2 a drop-in): the producer
          **writes** `rag/.cache/engine-update-check.json` (`{ checkedAt, current: source.ref, latest, updateAvailable }`,
          `.cache/` already gitignored); the **status-line is the consumer** — reads it **read-only** and, if
          flagged, appends `formatUpdateSuffix` → `engine v1.1.0 (v1.2 dispo ⬆)`. Producer & consumer never
          share a synchronous path.
    - [ ] pure libs (TDD when built): `engine-update-check.mjs` — `latestVersionFromRefs(refs)` (newest semver
          tag) · `isUpdateAvailable({current: source.ref, latest})` · `shouldCheck({now, lastCheckedAt, ttlMs})`
          · `formatUpdateSuffix({latest})`. Spawn seam injected (like `engine-fetch.mjs`), time-boxed, never throws.
    - [ ] **NO GitHub / `gh` / platform-API dependency** (maintainer constraint): plain **`git ls-remote`** on
          the recorded **URL** — host-agnostic (GitHub/GitLab/Azure/self-hosted), `git` already present, run by
          the machine **never** the non-dev user. The recorded `source` pointer is **not** a git remote / link
          (ADR 0001) — only the explicit, opt-in reference Phase 1 already records. Raw-file HTTP fetch =
          rejected (GitHub-specific).
    - [ ] when built, **add `scripts/session-status.mjs` (or wherever the producer lives) to the manifest
          `merge` list** so `update-engine` self-updates it (today it's referenced by the settings template but
          **absent from `engine-manifest.json`** — a pre-existing gap to close then). **Cross-platform (ADR 0015):**
          `git` is a real exe on both OSes (no `process.platform` branch); cache path via `path.join`.
    - [ ] **Future-proofing check (the maintainer's question, answered):** our setup **already supports** this
          second phase with **no rework** — `source.ref` + `engine-fetch.mjs` (Phase 1) give the fetch; the
          **cache-as-contract** lets the future producer slot in behind the A1 display; hooks can spawn a
          detached non-blocking child. _(Optional now: ship the status-line's cache **read** in A1 so the future
          producer is a literal drop-in — decide at implementation; low risk, but the door is open regardless.)_
- [x] **Chantier B — Bake the autocompact threshold into every generated brain.** _(done 2026-06-14)_
      _(value chosen WITH the maintainer 2026-06-14: **350000**, the "levier 2" of the article.)_
      ✅ **Variable name CONFIRMED EMPIRICALLY** (the memory's "non confirmé" is resolved): it is
      **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** (a **string**), inside the **`"env"` block** of `settings.json` —
      proven by the maintainer's own `~/.claude/settings.json` (machine-level, set to `"300000"`). The
      **300K the maintainer sees today comes from his machine**, not this project; the brain template has
      **no `env` block**, so a fresh brain on a non-dev machine would NOT inherit it → bake it in.
  - [x] add `"env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" }` to `.claude/settings.json.template`
        (a static block — the installer's `gen()` only substitutes `{{…}}` placeholders, so a literal `env`
        block flows through verbatim). _(done 2026-06-14)_
  - [x] guard test: assert the templated/generated `settings.json` carries
        `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW === "350000"` — new `scripts/lib/settings-template.test.mjs`
        (mirrors `gen()`'s `{{…}}` substitution, then `JSON.parse` + asserts the value AND that it's a string).
        _(2/2 green)_
  - [x] _(optional — SKIPPED)_ one line in SETUP/README: **not worth it** — autocompact is an internal tuning
        detail that "just works"; surfacing it to non-dev users adds noise for no action they can take.
        Decision 2026-06-14.
- [ ] **Definition of done** — harness `node --test` green (fail 0, todo 0), RAG untouched (no `rag/` code
      change), `tsc` n/a; tick all boxes with _(date · commit)_; refresh the PR #10 body; **NO `main` merge**
      (the maintainer merges post-demos). When done, `git mv` this plan into
      [`plans/archived/`](archived/) ([[plan-done-equals-archived]]).

## Decisions settled (2026-06-14, with the maintainer)

- **Chantier A scope (REVISED 2026-06-14) = offline display NOW; "update available" DEFERRED.** The
  availability check returns later as an **opt-in, non-blocking, background** producer writing a cache the
  status-line reads. The first draft's silent SessionStart ping was **dropped** — it re-coupled the brain to
  the generator (against ADR 0001/0014). The brain's own git remote (the user's note backup) is **never**
  involved in versioning, and the recorded `source` pointer is **not** a git link — only Phase 1's explicit,
  opt-in reference. _(graved in [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md).)_
- **Version reference = git TAGS, not a hand-maintained number in a repo file** — gravé dans
  [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md). The maintainer's reasoning:
  a tag is an **intentional, maintainer-controlled, marketing** act ("c'est moi qui décide"), **decoupled from
  incidental repo file churn** — a hand-bumped `engineVersion` drifts and lies; a tag doesn't. So:
  - **displayed version = the brain's `source.ref`** (the git tag it was generated / last-updated from, already
    recorded at install) — read **offline**, no number to maintain;
  - **"newer available" = newest git tag** from `git ls-remote --tags <source.repo>`, semver-compared to
    `source.ref`;
  - the manifest's `engineVersion` vector + `indexSchemaVersion` **stay only for the mechanics** (the apply /
    reindex decisions of Phase 1) — they are **no longer "the user-facing version"**.
- **NO strong GitHub dependency (maintainer constraint).** Users are non-developers with no git/GitHub CLI.
  The check is plain **`git ls-remote`** on the recorded **URL**, host-agnostic, run **by the hook** (never by
  the user), needing only `git` (already present) — **never `gh` / a platform API**. GitHub Releases stay an
  **optional, maintainer-side** marketing veneer (they just create a tag). "À part les URL", no coupling.
- **Tag naming convention = `vMAJOR.MINOR.PATCH`** (e.g. `v1.2.0`), semver-parseable. **Release ritual**
  (maintainer, automatable later): `git tag v1.2.0 && git push --tags`. Non-semver / no tag (dev launcher,
  branch install) → **fail-silent** (no "dispo" suffix), display the ref verbatim. _(Confirm the convention
  with the maintainer at implementation time if not `vX.Y.Z`.)_
- **Autocompact value = `350000`** (string), in the `env` block of `settings.json.template`.
- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW` is the real var** — confirmed by the maintainer's machine config, not a
  guess. Lives in `env`. Resolves the open question in the `autocompact-350k-brain` memory.

## Key facts gathered (so a fresh window doesn't re-discover them)

- `scripts/status-line.mjs` — runs **continuously**; contractually **FAST, READ-ONLY, no network, no
  write**. Builds a `· `-joined line of segments (git · RAG · key). The engine segment is appended here, and
  the update suffix is read **from cache only**.
- `scripts/session-status.mjs` — the **SessionStart** hook; runs **once**; **already** does a network
  `git pull --rebase`. The throttled `ls-remote` check + cache write belong here. It is **not** in the
  manifest yet (see A2's last sub-box).
- `engine-manifest.json` — generated brains record `source: { repo, ref }`; **`source.ref` (the git tag) is
  the user-facing version that gets displayed**. `engineVersion = { rag, constitutionTemplate, scripts }` +
  `indexSchemaVersion` stay for the **mechanics** (apply/reindex), not display. **The launcher records no
  `source`** (→ the version display falls back to the ref verbatim / `engineVersion.rag`, and the update-check
  fail-silents — correct: the launcher is not a brain).
- Installer (`installer.mjs`) generates `.claude/settings.json` from `.claude/settings.json.template` via
  `gen()` (placeholder substitution only) — a literal `env` block is safe.

## Session protocol (per ADR 0013)

- **TDD, baby-steps** (skill `tdd-discipline`): one failing test at a time, red→green→refactor; **commit
  green only**. **Cross-platform parity (ADR 0015) is part of "green".**
- Tick the box in the step's finishing commit; mirror progress in the PR #10 body.
- **No merge to `main`** before the Mon/Tue client demos (ADR 0012 / 0014).

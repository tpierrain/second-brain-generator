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

- [ ] **Chantier A — Surface the engine version in the status-line (offline display + network "update available").**
      Decoupled into the cheap-offline half and the costly-network half (the parked design call). _(scope
      chosen WITH the maintainer 2026-06-14: **BOTH halves**.)_
  - [ ] **A1 — Offline version display (cheap, deterministic, no network).**
    - [ ] pure lib `scripts/lib/engine-version.mjs`: `formatEngineVersion(manifest)` → `"engine <source.ref>"`
          — **the displayed version is the git TAG the brain was generated/last-updated from**
          (`source.ref`, already recorded in the manifest at install), NOT a hand-maintained number. E.g.
          `source.ref = "v1.1.0"` → `"engine v1.1.0"`. **Fallback** when `source.ref` is absent or not a
          semver tag (dev launcher, install from a branch) → show the ref verbatim, or `engineVersion.rag`
          as a last resort; never invent. Missing/invalid manifest → `null`. Unit tests first (TDD: tag ref,
          non-semver ref, no source, missing file/null).
    - [ ] wire into `scripts/status-line.mjs`: read `engine-manifest.json` at REPO root (**fail-silent** —
          no manifest → no segment), append an `engine v…` segment to the existing `· `-joined line. The
          status-line contract is **READ-ONLY + FAST** — this is a plain file read, safe here.
    - [ ] _(optional)_ also surface it in `scripts/session-status.mjs` `systemMessage` for the CLI startup
          banner — decide if worth the duplication; status-line already covers Desktop + persistence.
  - [ ] **A2 — Network "update available" check (throttled + cached + fail-silent).**
        ⚠️ **Architecture invariant:** the network call **MUST NOT** live in `status-line.mjs` (it runs
        continuously and is contractually READ-ONLY / no-network / no-write). It lives in
        `session-status.mjs` (the **SessionStart** hook — runs **once** at startup and **already** does
        network: `git pull --rebase`). The status-line only **reads a cache** and appends a suffix.
    - [ ] pure lib `scripts/lib/engine-update-check.mjs` (TDD baby-steps): `shouldCheck({now, lastCheckedAt,
          ttlMs})` (throttle ~once/24h) · `latestVersionFromRefs(refs)` (newest semver tag from
          `git ls-remote --tags` output) · `isUpdateAvailable({current, latest})` where **`current` = the
          brain's `source.ref`** (the git tag it's pinned to) — semver compare · `formatUpdateSuffix({latest})`
          → `" (v<latest> dispo ⬆)"`. All pure, all unit-tested.
    - [ ] a **testable spawn seam** for `git ls-remote --tags <source.repo>` (inject the spawn fn, mirroring
          `engine-fetch.mjs`); **time-boxed** + **never throws** (fail-silent offline).
          🛡️ **NO GitHub / `gh` / platform-API dependency (maintainer constraint, 2026-06-14):** this is plain
          **`git`** (a primitive already present in every brain — it's a git repo + Phase 1 needs git), reading
          **tags from any remote** (GitHub, GitLab, Azure, self-hosted) via the recorded `source.repo` **URL**.
          The end-user (non-dev) **never invokes git/GitHub** — the hook runs it under the hood; they only see
          the status-line suffix. This is the **least** host-coupled network option (a raw-file HTTP fetch
          would be GitHub-specific — rejected); aligns with **ADR 0001** (self-hosted, no registry/platform API).
    - [ ] wire into `session-status.mjs`: on startup, if the cache is stale (> ttl), run the fail-silent
          check against the brain's recorded `source.repo` (from `engine-manifest.json`), then **write** the
          cache `{ checkedAt, current, latest, updateAvailable }`. **Never block startup.** Cache path:
          `rag/.cache/engine-update-check.json` (the `.cache/` dir is already gitignored — throwaway).
          ⚠️ The **launcher itself records no `source`** (only generated brains do) → the check fail-silents
          here, which is correct (the launcher is not a brain).
    - [ ] wire into `status-line.mjs`: read that cache (**read-only**); if `updateAvailable`, append the
          `formatUpdateSuffix` to the `engine v…` segment → `engine v1.1.0 (v1.2 dispo ⬆)`.
    - [ ] **add `scripts/session-status.mjs` to the manifest `merge` list** (it carries engine logic now, so
          `update-engine` must self-update it — today it's referenced by the settings template but **absent
          from `engine-manifest.json`**, a pre-existing gap). Confirm the `engine-manifest.test.mjs` gate.
  - [ ] **Cross-platform (ADR 0015):** `git` is a real exe on both OSes (no `process.platform` branch for
        `ls-remote`, same as `engine-fetch`); cache path via `path.join`. Keep tests OS-agnostic.
- [ ] **Chantier B — Bake the autocompact threshold into every generated brain.**
      _(value chosen WITH the maintainer 2026-06-14: **350000**, the "levier 2" of the article.)_
      ✅ **Variable name CONFIRMED EMPIRICALLY** (the memory's "non confirmé" is resolved): it is
      **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** (a **string**), inside the **`"env"` block** of `settings.json` —
      proven by the maintainer's own `~/.claude/settings.json` (machine-level, set to `"300000"`). The
      **300K the maintainer sees today comes from his machine**, not this project; the brain template has
      **no `env` block**, so a fresh brain on a non-dev machine would NOT inherit it → bake it in.
  - [ ] add `"env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" }` to `.claude/settings.json.template`
        (a static block — the installer's `gen()` only substitutes `{{…}}` placeholders, so a literal `env`
        block flows through verbatim).
  - [ ] guard test: assert the templated/generated `settings.json` carries
        `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW === "350000"` (no settings-content test exists yet — add a
        minimal one; substitute the `{{…}}` placeholders first since the raw template isn't valid JSON).
  - [ ] _(optional)_ one line in SETUP/README that every brain forces autocompact at 350k tokens — decide if
        worth it (small, audience = curious).
- [ ] **Definition of done** — harness `node --test` green (fail 0, todo 0), RAG untouched (no `rag/` code
      change), `tsc` n/a; tick all boxes with _(date · commit)_; refresh the PR #10 body; **NO `main` merge**
      (the maintainer merges post-demos). When done, `git mv` this plan into
      [`plans/archived/`](archived/) ([[plan-done-equals-archived]]).

## Decisions settled (2026-06-14, with the maintainer)

- **Chantier A scope = BOTH halves** (offline display **and** the throttled network update-available check).
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

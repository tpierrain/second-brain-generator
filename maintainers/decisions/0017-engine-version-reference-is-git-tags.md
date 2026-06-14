# ADR 0017 — The engine version reference is a git tag, displayed offline from the brain's pinned ref

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — the installer records the pinned `source.ref` into the
  brain; the runtime (status-line + SessionStart hook) reads it offline and checks for newer tags.
- **Related:** [`0001`](0001-launcher-vs-brain.md) (self-hosted, no registry / no platform API — the
  constraint this honours), [`0009`](0009-prefer-deterministic-mechanisms.md) (a verifiable, offline read +
  a throttled, fail-silent check over a probabilistic guess), [`0014`](0014-ship-update-engine-before-mass-deployment.md)
  + [`0016`](0016-update-engine-is-a-skill-not-an-mcp-tool.md) (`update-engine` and its **proactive offer**,
  which this version surfacing feeds), [`0015`](0015-cross-platform-parity.md) (`git` is a real exe on both
  OSes). Implements the version-reference half of the plan
  [`post-phase1-version-and-autocompact-action.md`](../plans/post-phase1-version-and-autocompact-action.md).
  Phase 1 already records `source: { repo, ref }` in each brain ([Step 1](../plans/archived/engine-packaging-phase1-action.md)).

## Context

Phase 1 shipped `update-engine`; a brain can now pull a newer engine. Two user-facing questions follow, and
ADR 0016 says the brain *may proactively offer* an update:

1. **"Which engine version do I have?"** — cheap, must work **offline**.
2. **"Is a newer version available?"** — the genuinely actionable signal, but it costs a **network** call.

Deciding this means picking a **source of truth for the version number** and a way to detect "newer". Three
forces shape the choice:

- **The audience is non-technical.** Brain users have **no git/GitHub CLI** and never run commands. The
  maintainer was explicit: *no strong dependency on GitHub* — "à part les URL".
- **ADR 0001** keeps the product self-hosted: no package registry, no platform API; a brain works against
  whatever git remote URL it recorded.
- **A version number should be an intentional, maintainer-controlled act** (a release / marketing decision),
  **not** a value coupled to incidental repo file churn. A hand-bumped number in a tracked file drifts and
  lies; the maintainer wanted the version to be something *they* decide, deliberately.

A first design treated the manifest's `engineVersion` (a hand-maintained vector `{rag, constitutionTemplate,
scripts}`) as the displayed version. That couples "the version" to file edits and forces a 3-vector into a
single user-facing label.

## Decision

**The user-facing engine version is a git tag.** Concretely:

- **The displayed version = the brain's recorded `source.ref`** — the git **tag** the brain was generated
  from (or last updated to), already written into `engine-manifest.json` at install (Phase 1, Step 1). It is
  read **offline**, with **no number to hand-maintain anywhere**. Surfaced as a discreet status-line suffix
  (e.g. `engine v1.1.0`).
- **"Newer available" = the newest git tag** obtained with **`git ls-remote --tags <source.repo>`**,
  semver-compared to `source.ref`. This runs **throttled (~once/day), cached, and fail-silent** in the
  **SessionStart hook** (which already does network: `git pull --rebase`) — **never** in the continuously-run,
  contractually read-only/no-network `status-line`. The status-line only **reads the cache** and appends
  `(v<latest> dispo ⬆)`.
- **No GitHub / `gh` / platform-API dependency.** The check is **plain `git`** — a primitive already present
  in every brain (it is a git repo; Phase 1 already requires git) — reading **tags from any remote**
  (GitHub, GitLab, Azure, self-hosted) via the recorded **URL**. The non-technical user **never invokes
  git/GitHub**; the hook does it under the hood. GitHub **Releases** stay an **optional, maintainer-side**
  marketing veneer (creating a Release just creates a tag); the brain reads only the underlying **git tag**.
- **`engineVersion` (the vector) and `indexSchemaVersion` stay for the mechanics only** — they drive the
  `update-engine` apply/reindex decisions of Phase 1 (e.g. reindex iff `indexSchemaVersion` moved). They are
  **no longer "the user-facing version"**.
- **Tag convention = `vMAJOR.MINOR.PATCH`** (semver-parseable, e.g. `v1.2.0`). **Release ritual** (maintainer,
  automatable later): `git tag v1.2.0 && git push --tags`. When `source.ref` is **not** a semver tag (the dev
  launcher, or a brain installed from a branch), the version **fails-silent** for the "available" check and the
  ref is shown verbatim — an honest "no release signal", never a fabricated one.

## Consequences

- **The version is an intentional act, decoupled from file churn.** The maintainer decides when a version
  exists by pushing a tag — not by editing a tracked number. GitHub shows it under Releases/Tags for free.
- **Zero new dependency, least possible coupling.** `git ls-remote` on a URL is host-agnostic and the *least*
  platform-coupled network option available; a raw-file HTTP fetch would have been GitHub-specific. Honours
  ADR 0001; needs only `git` (present), never `gh`.
- **Honest, offline self-knowledge.** "Which version do I have" is a deterministic offline read of the very
  ref the brain is pinned to — it cannot drift from reality, because it *is* what `update-engine` pins.
- **Feeds ADR 0016's proactive offer.** Once "newer available" is cached, the brain can offer the opt-in
  update in plain language.
- **A light release ritual is now expected of the maintainer** (tag + push on each engine release). Acceptable
  and automatable; a later guard could assert the latest tag matches the manifest mechanics.
- **The launcher itself displays no "available" signal** (it records no `source`) — correct: the launcher is
  not a brain.

## Rejected alternatives

- **Hand-maintained `engineVersion` in the manifest as the headline.** Couples "the version" to incidental
  file edits (drifts, lies), and squeezes a 3-vector into one user label. Kept only for mechanics.
- **A dedicated root `VERSION` file as the single scalar truth.** Introduces a *second* place to keep in sync
  with the manifest mechanics; the tag already is the intentional scalar, with no extra file to maintain.
- **Read a raw file over HTTPS** (e.g. `raw.githubusercontent.com/.../engine-manifest.json`). GitHub-specific
  — exactly the platform coupling the maintainer rejected; breaks on self-hosted remotes; against ADR 0001.
- **Shallow-clone the default branch and read its manifest each check.** "Available" would track `main`, not a
  deliberate release, and costs a clone per check. Tags express *intent to release*; the default branch does not.
- **GitHub Releases API / the `gh` CLI.** Platform lock-in and an extra binary; non-technical users have no
  `gh`. The underlying git tag carries everything we need via plain `git`.
- **Run the network check in the status-line.** Violates the status-line's read-only/no-network/fast contract
  (it re-runs continuously). The throttled check belongs in the once-per-startup SessionStart hook.

# ADR 0017 — The engine version reference is a git tag, displayed offline from the brain's pinned ref

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — the installer records the pinned `source.ref` into the
  brain; the runtime reads it **offline** to display the version. (A future, opt-in availability check is also
  runtime.)
- **Related:** [`0001`](0001-launcher-vs-brain.md) (launcher↔brain decoupled; self-hosted, no registry / no
  platform API — the constraint this honours), [`0009`](0009-prefer-deterministic-mechanisms.md) (a
  deterministic offline read now; the future background check stays deterministic, throttled, fail-silent,
  non-blocking), [`0014`](0014-ship-update-engine-before-mass-deployment.md) (`update-engine`'s coupling is
  **explicit, pinned, user-triggered — "never a standing remote or a silent auto-update"**: the principle that
  forces the deferral here), [`0016`](0016-update-engine-is-a-skill-not-an-mcp-tool.md) (the proactive offer
  this feeds), [`0015`](0015-cross-platform-parity.md) (`git` is a real exe on both OSes). Plan:
  [`post-phase1-version-and-autocompact-action.md`](../plans/post-phase1-version-and-autocompact-action.md).
  Phase 1 already records `source: { repo, ref }` in each brain
  ([Step 1](../plans/archived/engine-packaging-phase1-action.md)).

## Context

Phase 1 shipped `update-engine`; a brain can now pull a newer engine. Two user-facing questions follow, and
ADR 0016 says the brain *may proactively offer* an update:

1. **"Which engine version do I have?"** — cheap, must work **offline**.
2. **"Is a newer version available?"** — the genuinely actionable signal, but it costs a **network** call.

**Crucial clarification — two completely different URLs must not be confused:**

- **The brain's own git remote** (optional) = the **user's private backup** of their notes. It lives wherever
  the user wants and has **nothing to do** with engine versions. The brain is created as a fresh `git init`
  with **no link to the generator** (ADR 0001).
- **The recorded `source: { repo, ref }`** in `engine-manifest.json` = a **pointer to the generator/launcher**,
  written at install by Phase 1. It is **not** a configured git remote and **not** a link (no shared history):
  it is a memorized **URL**, queried **only** when the user opts into `update-engine`. This is the coupling
  ADR 0014 re-introduced **deliberately, explicitly, pinned, and user-triggered — "never a standing remote or a
  silent auto-update."**

So the sovereignty stance forbids the brain from **routinely, silently phoning home** to the generator. A
version *display* that reads a local value is fine; a recurring automatic network check at every startup is
**not** — it would re-introduce, in spirit, the standing coupling we severed. (A first draft of this ADR made
exactly that mistake; it is corrected below.)

Separately, the *version number* needs a source of truth. A hand-maintained `engineVersion` in a tracked file
drifts and lies, and couples "the version" to incidental repo file churn. The maintainer wanted the version to
be an **intentional, maintainer-controlled act** ("c'est moi qui décide"), not a side effect of editing files.

## Decision

**1. The user-facing version is a git tag, displayed offline.** What is shown = the brain's recorded
**`source.ref`** — the git **tag** it was generated from (or last updated to; refreshed by `update-engine`,
Phase 1 Step 5). It is a **purely local read**: no network, no coupling, no phone-home. Surfaced as a discreet
status-line suffix (e.g. `engine v1.1.0`). There is **no hand-maintained version number** in any repo file.
When `source.ref` is not a semver tag (dev launcher / branch install), show it verbatim — never invent.

**1.bis (addendum 2026-06-14) — the conversational/tool answer single-sources the version from `source.ref` too.**
The status-line is deterministic, but the *spoken* answer to "which version?" was not: the brain reaches for
`vault_stats`, which used to headline the **mechanical** `rag X.Y.Z` vector — so on Desktop it answered with the
wrong number while the CLI read `source.ref` and answered right (a coin flip, per [`0009`](0009-prefer-deterministic-mechanisms.md):
prose guidance biases an LLM, it doesn't make it deterministic). Fix: `vault_stats` now headlines
**`Version: <source.ref>`** (the same tag the status-line shows, read from the brain-root `engine-manifest.json`)
and **demotes** the `rag` vector + index-schema versions to a labelled **"internal build"** line — kept for
reindex-staleness diagnostics, **never again presented as "the version"** (a mute tool would just push the LLM
back to guessing). So every path — status-line, tool, or a direct manifest read — lands on the same tag. The
constitution guidance is a thin complement, no longer load-bearing.

**2. The version-number reference is a git tag, not a tracked file.** A tag is an intentional, maintainer-
controlled release act, decoupled from file churn; GitHub surfaces it under Releases/Tags for free. The
manifest's `engineVersion` vector + `indexSchemaVersion` stay for the **mechanics** (`update-engine`'s
apply/reindex decisions) — **not** as the user-facing version. **Tag convention `vMAJOR.MINOR.PATCH`** (lowercase
`v`, semver-parseable); release ritual = `git tag v3.0.0 && git push --tags` (automatable later).

**First release under this convention = `v3.0.0`** (maintainer's call 2026-06-14). The repo's pre-existing tags
`V1` / `V2` (uppercase, non-semver) predate this convention; the next tag — cut **when PR #10 merges to `main`**
— is **`v3.0.0`**, starting the clean semver series. Brains installed from it record `source.ref = "v3.0.0"` →
the status-line shows `engine v3.0.0`. (`formatEngineVersion` already tolerates the legacy form: a brain pinned
to `V2` simply displays `engine V2` verbatim — never invented.)

**3. "Is a newer version available?" is DEFERRED — and, when it lands, will be opt-in, non-blocking, and
producer/consumer-decoupled, never a synchronous or silent startup ping.** Shipping now = the **offline display
only**. The availability check returns in a later iteration under these constraints:

- **Opt-in, default OFF** (the user enables it) — honours ADR 0014's "user-triggered, never standing/silent".
- **Never blocks startup.** A **detached, fire-and-forget background producer** (a child the hook does not
  await — `child.unref()` — or an equivalent background task) does a throttled (~once/24h), **fail-silent**
  `git ls-remote --tags <source.repo>`, then **writes a cache** (e.g. `rag/.cache/engine-update-check.json`).
- **Decoupled via that cache.** The **status-line is the consumer**: it reads the cache (read-only) and, if an
  update is flagged, appends `(v<latest> dispo ⬆)`. Producer and consumer never share a synchronous path.
- **No GitHub / `gh` / platform-API dependency.** Plain `git ls-remote` on the recorded **URL** — host-agnostic
  (GitHub/GitLab/Azure/self-hosted), `git` already present, run by the machine **never** the non-dev user
  (ADR 0001). GitHub **Releases** stay an optional, maintainer-side veneer (they just create a tag).
- **Deterministic over agentic where possible** (ADR 0009): a detached deterministic process is preferred to an
  LLM "agent" for a mechanical fetch, though the producer/consumer architecture supports either.

**Our setup already supports this second phase with no rework**: `source.ref` + the `engine-fetch` machinery
(Phase 1) provide the fetch; the **cache-as-contract** lets the future producer slot in behind the already-
shipped display; hooks can spawn a detached non-blocking child. Nothing shipped now closes that door.

## Consequences

- **Offline self-knowledge is honest and coupling-free**: the brain shows exactly the ref it is pinned to, with
  zero network.
- **The version is an intentional act** (a tag), decoupled from file churn; visible on the generator's
  Releases/Tags for free.
- **The brain does not routinely contact the generator.** The only generator reference is the explicit, opt-in
  `source` pointer used by `update-engine` — sovereignty (ADR 0001/0014) intact.
- **The proactive offer (ADR 0016) remains reachable** later via the opt-in, non-blocking background producer +
  cache — additive, not a redesign.
- A light **release ritual** (tag + push) is expected of the maintainer; automatable later.
- The **launcher shows no "available" signal** (records no `source`) — correct: it is not a brain.

## Rejected alternatives

- **Hand-maintained `engineVersion` as the headline.** Couples the version to incidental file edits (drifts,
  lies) and squeezes a 3-vector into one user label. Kept for mechanics only.
- **A dedicated root `VERSION` file.** A *second* place to keep in sync with the manifest mechanics; the tag is
  already the intentional scalar, with no extra file to maintain.
- **Read a raw file over HTTPS** (e.g. `raw.githubusercontent.com/.../engine-manifest.json`). GitHub-specific —
  the platform coupling the maintainer rejected; breaks on self-hosted remotes; against ADR 0001.
- **Shallow-clone the default branch and read its manifest each check.** "Available" would track `main`, not a
  deliberate release, and costs a clone per check. A tag expresses *intent to release*; the default branch does
  not.
- **GitHub Releases API / the `gh` CLI.** Platform lock-in and an extra binary non-technical users lack; the
  underlying git tag carries everything via plain `git`.
- **A synchronous or silent automatic startup ping** (this ADR's first draft). Re-introduces, in spirit, the
  standing coupling ADR 0001/0014 severed, and risks blocking startup. Replaced by the deferred, **opt-in,
  non-blocking, cache-decoupled** producer above.

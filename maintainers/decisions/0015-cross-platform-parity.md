# ADR 0015 — Cross-platform parity: Mac AND Windows are first-class, at parity

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — and the generator's own dev discipline. Applies to the
  Engine, the installer, every hook/launcher, and the generated brain's runtime.
- **Related:** [`0007-three-embedder-adapters-privacy-scale.md`](0007-three-embedder-adapters-privacy-scale.md)
  (the in-process embedder ships pre-built ONNX binaries for Windows/macOS/Linux — and its **Intel-Mac
  carve-out**), [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (pure-Node hooks, no `bash`/`jq` dependency — what makes cross-OS cheap),
  [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) +
  [`0014-ship-update-engine-before-mass-deployment.md`](0014-ship-update-engine-before-mass-deployment.md)
  (engine packaging / `update-engine` — the next code to honour this gate). Operative rule:
  [`DEVELOPING.md` "Dev rules" §8](../../DEVELOPING.md).

## Context

"Run on Mac **and** PC (Windows)" has been a **hard requirement** from the start — stated repeatedly in
the embedder study and plan (*"HARD requirement: Mac AND Windows at parity"*), honoured in the machinery
(pure-Node hooks; `run-node.{sh,cmd}` / `launch.{sh,cmd}` pairs; `onnxruntime-node` pre-built binaries for
all three OSes; JSON paths normalised to `/`).

But that requirement lived **only in plans** (which get archived → ephemeral memory) and as scattered
mentions. **No ADR enshrined it** and **no operative dev rule** guarded against regression. As the project
heads into **mass deployment to non-technical users** (ADR 0014) — many on Windows — and is about to ship
`update-engine` (which manipulates shell launchers, `npm install`, paths — the #1 cross-OS regression
zone), the maintainer asked to **reinforce** the requirement so a Mac-only dev session can't silently
break Windows.

## Decision

**Cross-platform parity is a release-gate invariant, recorded here and enforced by `DEVELOPING.md` §8.**
The generator, installer, Engine and every hook/launcher **must work on macOS, Linux AND Windows**.
Windows is **not a deferred target** — a change that works only on POSIX is a **regression**, not a
follow-up.

Operative gate (full checklist in `DEVELOPING.md` §8):
- Every shell launcher ships **both** `.sh` and `.cmd`; `engine-manifest.json`'s `regenerate` bucket lists
  both halves.
- **Pure Node** at the core (no `bash`/`jq`/`sqlite3`/`sed`); external tools spawned via a
  `process.platform` switch.
- Paths built with `path` / normalised to `/` for storage; no hardcoded separators or `$HOME`-only
  expansions; resolve via env.
- No Unix-only commands assumed (`open`/`xdg-open`/`start` have OS variants).
- The **Windows half is verified** — at least by a `win32`-branch unit test (as `run-node` does) — even on
  a Mac dev machine.

**Documented carve-out:** the **in-process embedder excludes Intel Macs** (`darwin/x64`), a hardware
limit recorded in ADR 0007 (those users pick a key/Ollama). This is the *only* sanctioned platform gap,
and it is **not** a precedent for dropping Windows.

## Consequences

- **Regression protection:** a discoverable, durable invariant (this ADR) + an actionable checklist
  (DEVELOPING §8) + a per-plan "Windows parity" gate (starting with the Phase 1 / `update-engine` plan).
  A Mac-only session now has an explicit rule to satisfy.
- **`update-engine` must carry the gate:** its re-pull / `npm install` / launcher-regeneration steps each
  prove Windows parity (both `.cmd` and `.sh` paths) before a step is ticked.
- **Cheap to uphold** because the architecture already chose pure-Node, deterministic mechanisms
  (ADR 0009) and OS-agnostic binaries (ADR 0007). This ADR makes an existing property *defended*, not new.
- **Honest boundary:** parity is verified by unit tests on the `win32` branch and (periodically) a real
  bare-Windows install; we don't run full Windows CI yet. If drift is ever found, a Windows CI job is the
  next reinforcement — deferred until proven necessary (no over-engineering, ADR 0009 spirit).

## Rejected alternatives

- **Leave it in the plans only.** Plans get archived; the requirement evaporates from working memory —
  exactly the regression risk that prompted this ADR.
- **"Mac now, Windows later."** Re-introduces a manual Windows port after the fact; worse once
  non-technical Windows users are already deployed (same egg-and-chicken as ADR 0014).
- **Full Windows CI now.** Premature; the pure-Node design + `win32`-branch unit tests + periodic bare
  installs cover the practical risk. Revisit if real drift appears.

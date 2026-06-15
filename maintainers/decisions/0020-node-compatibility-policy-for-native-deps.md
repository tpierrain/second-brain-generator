# ADR 0020 — Node compatibility policy for native deps

- **STATUS:** ACCEPTED (2026-06-15).
- **Scope:** Installer + Second brain (runtime) — the policy is enforced at install time (preflight) and
  the fix propagates to the existing fleet via `update-engine` (the engine's `package.json`/lockfile).
- **Related:** [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (fail-loud preflight is a deterministic seam, not a probabilistic guard),
  [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md) (the CI matrix runs macOS + Windows),
  [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) +
  [`0014-ship-the-engine-before-deploying-it.md`](0014-ship-the-engine-before-deploying-it.md) (why the
  fix reaches brains ≥ 3.0.0 through `update-engine`). Plan:
  [`node-compat-native-deps-action.md`](../plans/node-compat-native-deps-action.md).

## Context

Field feedback (Yann DANOT, 2026-06-15): on **Node 24/25/26** the install either **failed to build the
native binding** or forced the user to **downgrade Node globally**. Root cause: `better-sqlite3@^11`'s
`engines.node` did not declare Node ≥ 24, so npm refused (or the prebuild was missing) on a modern Node.

The only **ABI-bound** surface in the engine is **native modules**. Inventory:

- **`better-sqlite3`** — the real ABI constraint. `@12.10.1` declares
  `engines.node: 20.x || 22.x || 23.x || 24.x || 25.x || 26.x`.
- **`onnxruntime`** (via `@huggingface/transformers`) — ships **broad prebuilds**, far more tolerant of
  the Node version; not the bottleneck today.

Everything else is pure JS, insensitive to the Node version. We just launched v3 ("install yours now"),
so a broken install on Node 24+ kills launch momentum. The fix is a tiny, low-risk compatibility change;
since the next release (the `import` skill, ADR 0019) is imminent, it **ships folded into v3.1.0** rather
than as a standalone v3.0.1 patch — decided 2026-06-15. Crucially, **fresh installs consume `main` HEAD**
directly (the launcher is `git clone`d), so unQA'd code on `main` is immediately live for every new
install; the fleet (≥ 3.0.0) instead upgrades only to the latest **semver tag** (`update-engine` →
`resolveLatestTag`). The discipline that follows: **don't merge to `main` until QA'd**, and gate the fleet
behind a deliberate tag.

## Decision

A four-part policy keeps the engine installable across the Node versions people actually run, and turns
"a colleague finds it at install time" into "our build goes red first":

1. **Keep native deps fresh.** Bump `better-sqlite3 ^11 → ^12` (declares Node 20–26). Treat
   `better-sqlite3` and `onnxruntime` as **watch items**: bump when a real Node/ABI conflict surfaces,
   not speculatively (YAGNI — don't bump onnxruntime blindly).
2. **Declare the supported window explicitly.** `rag/package.json` `engines.node: ">=20"` + a root
   `.nvmrc` (`22`, a clean LTS inside the window). The **lower bound is consciously 20** — it matches
   better-sqlite3's own floor; there's no reason to drop 20. This is the single source of truth, mirrored
   by the installer preflight and the CI matrix.
3. **Installer preflight, fail-loud (ADR 0009).** A **pure seam** `scripts/lib/node-compat.mjs`
   (`checkNode(version, window)` + the shared `NODE_WINDOW = {min:20, max:26}`) compares `process.version`
   to the window **before** `npm install` — the step that otherwise blows up cryptically. Below the floor →
   hard fail with an actionable message ("switch with nvm/volta"). Above the ceiling → **warn but allow**
   (forward-friendly: never block a newer Node). Launcher-side only (excluded from the brain like
   `install-handoff`), cross-platform (ADR 0015).
4. **CI matrix = the net.** GitHub Actions runs the harness suites + `npm ci && npm test` (which **builds
   the native binding**) for the engine across **Node 22 / 24 / 26** on **macOS and Windows** (parity,
   ADR 0015). A native-dep/Node conflict now goes red in CI, not at a user's keyboard.

## How the fix reaches the fleet

`rag/package.json` + the lockfile live in the `replace` bucket of `update-engine`, so **brains ≥ 3.0.0
pick up the bump** the next time they update their engine — the cure for "I bumped Node and my binding
broke". Pre-3.0.0 brains get it through a fresh install (the path they already need; ADR 0019).

## Consequences

- **Install survives a modern Node** (24/25/26) out of the box — Yann's wall removed.
- **The window is enforceable and discoverable** (`engines` + preflight + CI all read the same bounds).
- **Regressions surface in CI first**, on both OSes, before any user hits them.
- **The preflight is deterministic and unit-tested** (`node-compat.test.mjs`), consistent with ADR 0009.
- **Minor cost:** a small CI matrix (6 cells) to maintain; native-dep majors must be revisited when a new
  Node major lands outside the declared ceiling (the "warn but allow" branch buys time until then).

## Rejected alternatives

- **Pin Node / tell users to downgrade globally.** Exactly the pain we're removing; hostile to non-devs.
- **Bump onnxruntime/transformers at the same time, pre-emptively.** No proven conflict — YAGNI; keep it a
  watch item to avoid churn on a broad-prebuild dep.
- **A runtime/probabilistic guard instead of a preflight.** A deterministic compare before `npm install`
  is simpler, testable, and fails loud at the exact right moment (ADR 0009).
- **No CI / "we'll catch it manually".** That is precisely how Yann's conflict reached a user; the matrix
  is the whole point.

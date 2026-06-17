# ADR 0021 — Align the install-time Node with the runtime Node, and self-heal a native-dep ABI skew

- **STATUS:** ACCEPTED (2026-06-17).
- **Scope:** Installer + Second brain (runtime) — A is enforced at install time (the installer routes the
  `rag/` `npm install` through the same self-heal PATH the launcher uses); B lives in the engine runtime
  and propagates to the existing fleet via `update-engine`.
- **Related:** [`0020-node-compatibility-policy-for-native-deps.md`](0020-node-compatibility-policy-for-native-deps.md)
  (the *other* native-dep failure mode — "Node too new → build refused"; this ADR is the *complementary*
  one — "binary moulded for one ABI, loaded by another"),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (B is a
  deterministic, event-triggered, one-shot rebuild — not a probabilistic guard),
  [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md) (both A and B run on macOS + Windows),
  [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) (why B reaches
  brains ≥ 3.0.0 through `update-engine`'s `replace` bucket). Plan:
  [`node-abi-skew-install-runtime-action.md`](../plans/node-abi-skew-install-runtime-action.md).

## Context

Field feedback (several colleagues, 2026-06-17): after a successful install, the RAG fails at runtime with
"native module broken / binary not compiled" (`NODE_MODULE_VERSION` mismatch / `ERR_DLOPEN_FAILED`).

This is **distinct from ADR 0020**. ADR 0020 fixed "Node too new → npm refused to *build* the binding".
Here the binding **builds fine** but is then **loaded by a different Node ABI** than the one it was moulded
for. `better-sqlite3` is a **native** module: one compiled binary per Node ABI (Node 22 → ABI 127, Node 25
→ ABI 141, Node 26 → ABI 137). The skew comes from the install path and the launch path resolving
**different** Nodes:

- The **installer** runs `npm install` in `rag/` with **its own shell Node** (e.g. a Node 26 → ABI 137).
- The **runtime** launches the MCP server via `rag/launch.sh`, which builds a **self-heal PATH**
  (`pathPrependSh()`/`pathPrependCmd()`) and resolves **whatever Node lands first** there (e.g. a Homebrew
  `node@22` → ABI 127).
- Binary moulded for 26, loaded by 22 → **mismatch**.

This bites **only multi-Node machines** (mono-Node machines never skew). Reproduced empirically: a binary
built under Node 25 (ABI 141) throws under an isolated Node 22 (ABI 127) at `new Database()` — and the
exact error is the one colleagues hit.

ADR 0020's window/preflight/CI does **not** cure this — the skew is orthogonal to the version range.

## Decision

**Belt and braces: do B + A** (decided with Thomas, 2026-06-17). Reject C (replace the native store with a
pure-JS one — oversized for a risk we can heal).

1. **A — Build at install with the SAME Node the launcher will use.** Route the `rag/` `npm install`
   through the **same self-heal PATH** the launcher resolves at runtime. A single pure seam
   `buildRagInstallInvocation(platform)` → `{command, args}` reuses `pathPrependSh()`/`pathPrependCmd()`
   (single source of truth — the self-heal block is **not** copied) and emits the OS-right shell that runs
   `npm install` under that PATH. The installer wires the `rag/` install through it. The binary is then
   moulded for exactly the Node that will load it → **no skew, no rebuild needed** on first run.
2. **B — Self-heal rebuild at runtime on an ABI mismatch.** When opening `better-sqlite3` throws an ABI
   error, run `npm rebuild better-sqlite3` under the **current** Node, then retry **once**. Two pure seams:
   `isNativeAbiError(err)` (recognises the `NODE_MODULE_VERSION` / "compiled against a different Node.js
   version" / `ERR_DLOPEN_FAILED` / missing-bindings family — and **only** that family) and a thin loader
   `loadNativeWithRebuild` (try → rebuild once on an ABI error → retry → else propagate; **at most one
   rebuild**, no loop). This survives a Node change *after* install — the durable cure for "I bumped Node
   and my binding broke".

**Crucial empirical correction (caught by the proof step):** the ABI error fires on `new Database()`, **not**
on `require("better-sqlite3")` (the binding loads lazily in the constructor). So `vector-store.ts` wraps the
**construction** (`openDatabase`), not the `require`. Unit-green code that wrapped the `require` would have
shipped broken.

## How the fix reaches the fleet

- **A** touches `installer.mjs` (new installs) + the seam in `scripts/lib/rag-launcher.mjs` (carried by
  the manifest) — so a **fresh install** never skews.
- **B** lives in `rag/src/lib/**`, already in the `replace` bucket of `update-engine` → **brains ≥ 3.0.0
  pick it up** the next time they update their engine, and self-heal on the next start. Pre-3.0.0 brains
  get both through a fresh install.

Folds into **v3.1.0** (same tag as node-compat + import), so a single tag cures both the *install* and the
*runtime* dimensions of the native-dep story.

## Consequences

- **New installs don't skew** — install-node ≡ runtime-node by construction (A).
- **Existing brains self-heal** after a Node change — one automatic `npm rebuild` on the next start, then
  it just works (B), with no user action.
- **Deterministic and unit-tested** — `buildRagInstallInvocation`, `isNativeAbiError`, and the loader are
  all pure seams with tests; B is event-triggered and one-shot (ADR 0009).
- **Cross-platform** — A emits the OS-right shell; B's rebuild runs on macOS + Windows (ADR 0015).
- **Minor cost:** a single extra `npm rebuild` (seconds) the first time a brain runs under a new Node ABI;
  no daemon, no polling.

## Rejected alternatives

- **C — replace `better-sqlite3` with a pure-JS store.** Removes the ABI surface entirely but is a large
  rewrite of the vector store for a risk we can heal cheaply — oversized; YAGNI.
- **B alone (no A).** Would heal every install via a rebuild on first run, but A makes the common path
  rebuild-free and faster; B is the safety net, not the primary path.
- **A alone (no B).** Cures fresh installs but not a Node change *after* install — exactly the recurring
  field complaint. B is what makes it durable.
- **Bake a machine Node path.** Brittle and hostile to non-devs; we keep existence-tested prepends only,
  consistent with the launchers.

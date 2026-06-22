# ADR 0031 — Spawn Windows `.cmd`/`.bat` shims through a shell

- **STATUS:** ACCEPTED (2026-06-22; amended 2026-06-22 — added *Cleanup: terminating a
  shell-spawned child*, the Windows orphan-grandchild corollary of spawning through a shell).
- **Scope:** Installer + Second brain (runtime) — the bug spans the installer's `npm`/`npx` spawns AND
  the brain-runtime spawns (`update-engine` install/reindex, `verify-rag`, the health probes, the
  example-notes purge). The runtime fixes propagate to the existing fleet (brains ≥ 3.0.0) via
  `update-engine`'s `replace` bucket.
- **Related:** [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md) (Windows is a
  first-class target — this ADR defends parity at the *process-spawn* layer, the one place the prior
  `process.platform`-renames-the-binary trick silently stopped being enough),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (the decision is
  a pure, unit-tested seam, not a probabilistic guard),
  [`0020-node-compatibility-policy-for-native-deps.md`](0020-node-compatibility-policy-for-native-deps.md)
  + [`0021-align-install-node-with-runtime-node-and-self-heal-abi.md`](0021-align-install-node-with-runtime-node-and-self-heal-abi.md)
  (the *other* two Windows install-reliability failure modes; this is the third, orthogonal one). Plan:
  [`../plans/windows-install-reliability-action.md`](../plans/windows-install-reliability-action.md).

## Crux

Since **Node ≥ 18.20 / 20** (the CVE-2024-27980 hardening), spawning a Windows `.cmd`/`.bat` shim
(`npm.cmd`, `npx.cmd`) **without `shell: true` throws `EINVAL`**. Naming the binary `npm.cmd` on win32
(what the code already did) is necessary but **no longer sufficient**. A single tested seam
`needsShell(command, platform)` gates `shell: true` to **win32 `.cmd`/`.bat` only**, and every
`npm`/`npx` spawn site routes through it — a **no-op** on POSIX and on real `.exe` (`node`, `git`).

## Context

Field report (Daniel Martin, 2026-06-21, Windows 11 + Node 20): the install reports `✗ npm missing`
at step `1/10` even though `npm --version` works, and the `10/10` post-flight fails with "server exited
before the handshake completed". Root cause: Node's CVE-2024-27980 mitigation makes `child_process`
**refuse to spawn a `.cmd`/`.bat` without a shell** (`spawnSync npm.cmd EINVAL`). The codebase already
switched the binary name per `process.platform` (`npm` → `npm.cmd`) — and even *documented* it as "npm
is a shell-wrapped .cmd on Windows" — but never passed `shell: true`, so on a modern Node the spawn
dies before running.

This is **not** one isolated call. An audit found the same latent bug at **every** site that spawns
`npm`/`npx`: the installer's `run()` (prereq check + `local-mirror` install), `mcp-smoke`/`mcp-search`
(post-flight + eval), `engine-seams` (`update-engine`'s install/reindex — the *fleet upgrade* path),
`verify-rag` (the CASE-B Gemini verification), the headless + background **health probes**, and the
`clear-example-notes` purge. All run on Windows; all would `EINVAL`. The bug was invisible because **CI
never executed these spawn paths** (it runs unit suites + `npm ci` in `rag/`, not `installer.mjs` nor
the runtime probes end-to-end) — closed separately in the same plan.

## Decision

**One decision point, applied everywhere.** A pure seam `scripts/lib/spawn-shell.mjs`:

```js
export function needsShell(command, platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}
```

returns whether a given spawn must go through a shell. Every `spawn`/`spawnSync`/`execFileSync` that
targets `npm`/`npx` (or any `.cmd`/`.bat`) sets `shell: needsShell(cmd, process.platform)`. The seam is
unit-tested (win32 `.cmd` → true; POSIX → false; win32 `.exe`/`git`/`cmd` → false; case-insensitive).
This is the **industry-standard mitigation** — the same one `cross-spawn`/`execa` and Node's own docs
prescribe for the post-CVE `.cmd` behaviour; we keep a one-line seam rather than add a dependency (no
NIH the other way: the fix is trivial and platform-guarded).

**Why a seam and not `shell:true` everywhere.** `shell: true` on a real `.exe` is needless (and invites
quoting pitfalls); gating it to `.cmd`/`.bat` keeps the change a strict **no-op off Windows** and on
`git`/`node`, so macOS/Linux behaviour is provably unchanged.

## Cleanup — terminating a shell-spawned child

Spawning through a shell has a **corollary at teardown** that the happy-path decision above does not
cover. On Windows the long-lived stdio children (`mcp-smoke`, `mcp-search`) are launched as
`cmd.exe /c npx.cmd …`, so the process the parent holds is the **shell**, and the real MCP server is a
**grandchild**. `child.kill()` reaps only the shell; the grandchild is **orphaned and keeps the
inherited stdout pipe open**, so the parent's read handle never EOFs and **the Node process never
exits** — the installer prints its full success banner, then hangs until killed (field-observed: the
CI `install-e2e` step ran to "✓ Installation complete" in ~1m45s, then sat idle until the 20-min
job timeout; macOS reaps the whole tree and exits cleanly, so it never surfaced there).

Teardown therefore uses a small tested seam `scripts/lib/child-cleanup.mjs`:

```js
terminateChild(child, { platform, spawn }); // in every finish()
```

which (1) `child.kill()`s, (2) on **win32 only** tree-kills the orphan via a detached
`taskkill /pid <pid> /T /F` (`buildTreeKill` is the pure, unit-tested mapping — `null` off Windows,
where `kill()` already reaps the group), and (3) **destroys the child's stdio streams + `unref()`s**
so the parent's event loop can drain even if the tree-kill is slow or partial. It is strictly
best-effort and **never throws** (it fires from `finish()`, which may run after the child already
exited). This keeps the install/runtime spawn paths **exit-clean on Windows**, matching POSIX.

## Consequences

- **A clean install and a working runtime on Windows** — the prereq check, the RAG install, the
  post-flight, `update-engine`, `verify-rag` and the health probes all spawn successfully **and the
  process exits** instead of hanging on an orphaned MCP-server grandchild (see *Cleanup* above).
- **Single source of truth for the decision** — a new `.cmd` spawn added later just calls `needsShell`;
  no scattered `process.platform` re-derivations to keep in sync.
- **No-op elsewhere** — POSIX and `.exe` targets are untouched, so there is no risk to the (well-tested)
  macOS path.
- **Fleet reach** — the runtime sites live in engine-owned files in `update-engine`'s `replace` bucket,
  so brains ≥ 3.0.0 pick up the fix on their next engine update (ADR 0020/0021 propagation).
- **Bounded residual risk** — with `shell: true`, arguments containing shell metacharacters are
  interpreted by the shell. All our spawn arguments are internal, fixed flags/paths (not user input);
  the one free-text argument (the health-probe toast message) is best-effort and fail-open. If a richer
  argument ever needs spawning on Windows, the more robust alternative is to resolve npm/npx's JS entry
  and run it with `process.execPath` (no shell at all) — deferred until a real need (no over-engineering).

## Rejected alternatives

- **Rename to `.cmd` only (the prior state).** Necessary but not sufficient post-CVE — exactly the bug.
- **`shell: true` unconditionally at every site.** Wasteful and quoting-prone on `.exe`/POSIX; the
  platform-and-extension gate keeps the fix inert where it must be.
- **Resolve the JS entry and run via `process.execPath` everywhere now.** The most robust, but a larger
  refactor than the risk warrants today; kept as the escalation path if a metacharacter-bearing argument
  ever appears.
- **Adopt `cross-spawn`/`execa`.** A dependency for a one-line, well-understood platform guard; the seam
  is cheaper and keeps the engine's pure-Node posture (ADR 0009/0015).

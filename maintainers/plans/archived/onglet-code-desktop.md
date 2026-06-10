<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ DONE (revised 2026-06-06) — strategy reversed: loud failure.       -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — make the second brain reliable from the Claude desktop app (Code tab), targeting non-dev managers

> **STATUS: ✅ DONE** (revised 2026-06-06). This plan was **reversed** relative to its first
> version (deterministic install gate). The new strategy — **trust Claude to install,
> LOUD failure to catch any broken state** — has been executed (CHANGE 6 + sourced post-flight).
> The EN translation (`translate-to-english.md`) remains deferred to the very end.
>
> **Associated architecture decisions:** [`../../decisions/0005-support-onglet-code-desktop.md`](../../decisions/0005-support-onglet-code-desktop.md)
> (revised 2026-06-06 — reversal of D1/D4) and
> [`../../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)
> (stable MCP contract, unchanged).

---

## 0. Objective & scope

Enable **non-dev managers** (engineering managers, product managers, leads)
to **install and use** a second brain from the **"Code" tab of the Claude desktop app**,
**reliably** — not only from the terminal (Claude Code CLI).

**Out of scope:** cross-AI (a client other than Claude) — cf. ADR 0004. The Code tab **is**
Claude Code on another surface.

## 1. The two observed failures (the "why")

- **Failure A — toolchain absent → Claude improvises installs → "Frankenstein" state.**
  **Richard**'s machine (non-dev), then an attempt on **Achille**'s bare Mac: a machine without node/npm/npx.
  **UNPROVEN hypothesis**: on Achille, we **cut off before the verdict** — we don't know whether Claude
  would have been able to install the toolchain cleanly from the Code tab. We long assumed not;
  that's not demonstrated.
- **Failure B — RAG down → answer from the Internet, silently.** At Richard's, the RAG didn't
  start → the 1st demo question (Star Wars) answered **from the Internet** instead of the vault
  (silent bypass). **Failure B is PROVEN and that's the real danger**: a useless brain **that
  seems to work** is worse than a brain that's plainly broken.

### Field findings — Achille's bare Mac (Code tab)
- `git` present at `/usr/bin/git` (Xcode CLT); **node / npm / npx absent**.
- PATH of the Code tab measured = **`/usr/local/bin`** (+ system paths), **but neither `/opt/homebrew/bin`
  nor the nvm/asdf shims**. → a Node installed via Homebrew Apple Silicon or via nvm **would not be seen**.
- **Claude's agency not proven**: session cut off before seeing whether it could manage on its own.

## 2. Decision (Thomas, 2026-06-06) — reversal

> Full detail and reasoning: **ADR 0005, section "Revision 2026-06-06"**.

- **Trust Claude to install** (the UX of the Claude era). **No install gate.** We drop
  the idea of a deterministic pre-flight that *prevents* (failure A unproven — we don't harden against a
  risk that isn't demonstrated).
- **Only net: make any broken state LOUD** (failure B, proven). We **catch** the broken install
  instead of *preventing* it, on two faces:
  - **Runtime** — the generated constitution refuses to answer off-vault when `vault-rag` is unavailable.
  - **Install-time** — the bootstrap's post-flight proves the demo answers **from the vault**
    (cited source), otherwise loud FAIL + `exit 1`.
- This **reverses D1 (maximally deterministic install) and D4 (ban on improvising
  installs)** of the first version of this plan / of ADR 0005.

## 3. Preserved invariants (unchanged)

- **Launcher/brain** (ADR 0001): launcher read-only; bootstrap creates a fresh folder and
  **refuses an existing target**.
- **Push opt-in**: auto-commit pushes only if `secondbrain.autopush=true`.
- **Secrets**: Gemini key **never** as a CLI argument; lives in `.env` (gitignored).
- **Multi-OS**: pure Node at the core; `.cmd` on Windows; JSON paths normalized to `/` (`toPosix`).
- **Idempotence** of the bootstrap.
- **Stable MCP contract** (ADR 0006).

---

## 4. What was DONE (the two faces of the net)

### ✅ CHANGE 6 — Fail-loud RAG in the constitution (runtime)
`CLAUDE.md.template`, section "Vault — semantic RAG": rule in bold — if the
`mcp__vault-rag__*` tools are **unavailable or erroring**, SAY SO LOUDLY ("⚠️ RAG unavailable") and
**REFUSE** to fabricate an answer from the Internet/general knowledge — **especially for the
demo question** (the user's first contact). This is the layer that would have avoided Richard's
silent bypass.

### ✅ Sourced post-flight (install-time)
- `scripts/lib/mcp-smoke.mjs`: optional param `probe:{ tool, args, expectText }`. After the
  structural smoke (`tools/list`), it **actually calls** `search_vault` (`tools/call`) and verifies that
  the answer **cites a vault source** (`/vault\//`). Without `probe` → behavior unchanged.
- `bootstrap.mjs` step 9/9:
  - **with a Gemini key** (`keyReady`) → probe with the demo question. PASS = success banner `exit 0`;
    **FAIL = loud `err()` + `process.exit(1)` BEFORE the banner** (no false green).
  - **without a key** → structural smoke only + honest message "demo check **deferred** — paste your key
    in `.env` then ask the demo" → `exit 0`.
- Demo question extracted into a **constant `DEMO`** (reused by the probe and the final message).

### ✅ Cleanup
`scripts/preflight.sh` + `scripts/preflight.test.mjs` (exploratory pre-flight of the abandoned gate) **removed**.

---

## 5. FROZEN items (and why)

Everything below belonged to the "deterministic gate" strategy and is **abandoned** with the
reversal — not lost, just consciously set aside:

- **Deterministic pre-flight 1a** (`preflight.sh` GUI-visible, rejecting nvm/asdf) — *prevented* failure A
  unproven. Gate abandoned → removed.
- **Stub `CLAUDE.md` "STOP if red" + ban on improvising installs (D4)** — we now
  **trust** Claude to install.
- **PATH heuristics "GUI-visible" / "simulated GUI-minimal PATH"** (CHANGE 1b/5.3) — served to
  prove the desktop upfront. The real post-flight is enough to catch the failure.
- **Runtime self-heal 1c** (`process.env.PATH = …` at the top of the hook scripts) — to be
  **hardened only if** a real machine proves the runtime doesn't resolve node *after* a successful
  bootstrap. Not observed.
- **`--here` (install in place, 3a)** — chipped away at the "brain ≠ launcher" model. Not necessary to the
  net; deferred.
- **Manual desktop handoff / SessionStart status visible in desktop (CHANGE 4)** — the early alert
  is now carried by the post-flight (install-time) + the fail-loud constitution (runtime).

> CHANGE 2 (pre-approve the MCP server), CHANGE 3 (desktop onboarding README/SETUP) and CHANGE 5
> (opaque MCP server names) remain **possible UX improvements**, non-blocking, outside the
> reliability net. To be picked up only if the field justifies it.

---

## 6. Validation (the final arbiter)

- `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` green (including new mcp-smoke cases:
  sourced probe, non-sourced probe, regression without probe).
- **Achille's bare Mac, Code tab**: (1) let Claude install **fully without cutting off** →
  observe whether it works/breaks and how (finally closes the failure-A hypothesis); (2) if it works: with a key,
  post-flight **PASS** + demo **sourced from the vault** + one write → auto-commit; (3) if it breaks: **loud
  failure B** (post-flight FAIL `exit 1` and/or constitution refusing to answer off-vault).
- **Without a key**: bootstrap `exit 0` + message "demo check deferred" (no false green).

## 7. Deferred ideas (Thomas's green light required)

- **Non-blocking `doctor`** — a diagnostic command (toolchain, key, index, MCP connection) that
  the user runs if in doubt, **without a gate**. To consider if the field shows that the
  post-flight isn't enough to guide troubleshooting.
- **Shared/upgradable RAG component** (ADR 0006) — rubs against ADR 0003. To be settled with Thomas.
- **Provider-agnostic `vault_stats`** (ADR 0006) — drop the "Gemini quota" vocabulary.
- **Windows variant** of possible scripts — macOS first (the immediate target).

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ SHIPPED (closed 2026-06-23) — the three load-bearing findings      -->
<!-- (F1/F2/F3) shipped in v3.3.0 via ADR 0026/0027/0029. Archived.                 -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Post-v3.2.2 field-QA findings — next-release backlog

> **STATUS: ✅ SHIPPED** (created 2026-06-20 as a backlog, closed 2026-06-23). Captured from a real
> **v3.1.0 → v3.2.2 upgrader** field QA on a throwaway "legacy" brain, plus a live end-to-end test of
> the `local-mirror` Notion replication. The three load-bearing findings all shipped in **v3.3.0**:
>
> - [x] **F1 — auto-finalize the engine update + SessionStart self-heal** → **ADR 0026 ✅ ACCEPTED**,
>   implemented v3.3.0 (`scripts/session-self-heal.mjs`, wired in `.claude/settings.json.template`).
> - [x] **F2 — local 🧠 citations open via a Claude-invoked opener** → **ADR 0027 ✅ ACCEPTED**
>   (`rag/src/lib/citation-renderer.ts`).
> - [x] **F3 — auto-register the brain's vault in Obsidian at install** → **ADR 0029 ✅ ACCEPTED**
>   (`scripts/lib/obsidian-register.mjs`).
> - [ ] **F4 — doc note "a full app restart suffices to pick up a new skill+MCP"** — trivial doc/UX
>   residue, not reflected in install copy yet; carry into the next UX pass if it ever bites (low).
> - [x] **F5 — name the two Notion modes** — observed working in QA; kept as a guardrail, no code owed.
> - [x] **F6 — QA hygiene: purge `legacy-brain` confidential mirror + drop the uncommitted diff** —
>   disk hygiene (not a repo change); see also [[golden-source-sync-progress]] / `~/gss-qa*` purge.
>
> Only **F4** (a one-line doc nicety) is unshipped, and it does not justify keeping an open action
> plan. Archived per "plan done = archived" — the full per-finding detail below is preserved verbatim.
>
> 🔒 **Confidentiality:** the QA used a **confidential ex-company Notion zone**. Its name/content/token
> must **never** appear in this repo. The throwaway brain (`legacy-brain`) still holds that mirrored
> content + an uncommitted diff → see **F6** before anything else touches it.

## Tracking

- [ ] **F1 — Kill the 2-cycle: auto-finalize the engine update** (→ ADR 0026 draft). _High._
- [ ] **F2 — Local 🧠 citations don't open on click in Claude Desktop** (custom-scheme bug, main
  surface). _High — flagship v3.2.2 feature degraded._
- [ ] **F3 — Auto-register the brain's vault in Obsidian at install** (opt-in, fail-soft). _Medium._
- [ ] **F4 — Document: a full app restart suffices to pick up a new skill+MCP** (no brand-new
  conversation needed for that). _Low — doc/UX._
- [ ] **F5 — `local-mirror` always names the two Notion modes** (native connector vs mirror). _Low —
  observed working; keep as a guardrail / regression check._
- [ ] **F6 — QA hygiene: re-purge `legacy-brain` confidential mirror + drop the uncommitted diff.**
  _Do first; not a product change._

---

## F1 — Auto-finalize the engine update (→ ADR 0026)

**Proven in the field:** a v3.1.0 brain needed **two** `/update-engine` runs before the `local-mirror`
skill + MCP installed (Layer A self-update bootstrap, ADR 0025). The user had to *know* to run it twice;
the brain neither auto-finalized nor warned.

- [ ] **Decide on ADR 0026** (idempotent reconciler: auto-finalize child process + SessionStart
  self-heal). Sign off the draft before any code.
- [ ] **Extract** the converge half of `updateEngine` into `scripts/reconcile-brain.mjs` (pure libs
  reused: `engine-apply-plan`, `mcp-reconcile`, install-if-absent skills, `rag-launcher`). No network.
- [ ] **Auto-finalize:** re-exec the freshly-written reconciler in a **child process** at the end of
  `update-engine` → collapses the 2-cycle into one invocation.
- [ ] **SessionStart self-heal:** wire it on the existing `SessionStart` hook — idempotent (true no-op
  when converged), **fail-open non-blocking**, fast.
- [ ] **Minimum fallback** if the reconciler is deferred: `update-engine` **loudly says** "I laid down
  new code — run me once more (or restart)" + a counter, instead of today's silence.
- [ ] Same **write-allowlist safety invariant** as ADR 0025; every test asserts it.

## F2 — Local 🧠 citations don't open on click in Claude Desktop

**Root cause (empirically isolated, 2026-06-20):** the citation renderer is **correct** —
`obsidian://open?path=<absolute>` works perfectly (tested via the system opener: launches Obsidian from
closed AND hot-switches between notes). The break is **H3: Claude Desktop does not open custom-scheme
(`obsidian://`) markdown links on click** — only `http(s)://`. So `🔗 Notion` (https) works and `🧠
local copy` (obsidian://) **silently does nothing**. Registering the vault does **not** fix the click
(the click is dropped upstream by Desktop).

- [ ] **Reframe the affordance** (the intended one always was *Claude opens it*, cf. the Obsidian-viewer
  posture): the robust path is **Claude runs the allowlisted opener** (`open` / `xdg-open` / `start`
  `obsidian://…`) **on request** — field-proven to work. The clickable 🧠 link is decoration Desktop
  ignores.
- [ ] **Make the citation block self-explanatory**: invite *"ask me to open citation N"* so the user
  knows to request it rather than click a dead link. Keep the **relative path as copyable text** (already
  present, grep-friendly).
- [ ] **Avoid the "looks clickable, does nothing" trap**: consider rendering 🧠 as **plain text/path**
  rather than a dead link on surfaces that drop the scheme — or keep the link (harmless where schemes are
  honored) **plus** the explicit "ask me to open" affordance.
- [ ] **Verify other surfaces** (CLI terminal, web) — does any honor `obsidian://` clicks? Scope the fix
  to "Claude-invoked open" so it works **everywhere**, not just where clicks happen to route.
- [ ] **Candidate ADR 0027** — "Local citations open via a Claude-invoked allowlisted opener, not via
  chat click (Desktop drops custom schemes)."
- [ ] Pairs with **F3** (so the Claude-invoked open resolves without a manual "Open folder as vault").

## F3 — Auto-register the brain's vault in Obsidian at install (opt-in)

Recurring friction: the user must manually do **"Open folder as vault"** for `obsidian://` opens to
resolve. Automatable by adding an entry to Obsidian's `obsidian.json`
(`~/Library/Application Support/obsidian/`, `%APPDATA%\obsidian\`, `~/.config/obsidian/`).

- [ ] **Opt-in only** — ask ("register your brain in Obsidian so 🧠 opens directly?"); never silent.
- [ ] **Deterministic seam, tested**: pure `addVaultToObsidianConfig(json, vaultPath)` (idempotent,
  generates the id, never clobbers other vaults) + thin I/O wrapper (read / **backup** / write), like
  `open-env.mjs`.
- [ ] **Guards (mandatory):** detect **Obsidian installed** first (no phantom config); write **only when
  Obsidian is not running** (it rewrites `obsidian.json` on quit → would clobber our edit); **fail-soft**
  to the manual instruction on any unexpected format.
- [ ] **Install-time, not runtime** (Obsidian is usually closed at install; the runtime reconciler must
  NOT touch it — ADR 0026 rejected-alternatives note).
- [ ] Register `<brain>/vault` (matches the path the renderer resolves; consistent with existing entries).

## F4 — A full app restart suffices to pick up a new skill+MCP

**Field finding:** after `/update-engine` installs a new skill + MCP, a **full Claude Desktop restart +
resumed conversation** loads **both** in an already-brain-rooted conversation — no brand-new
conversation required *just to pick up new capabilities* (`Ran skill /local-mirror` fired; the MCP
server showed connected).

- [ ] **Scope precisely** in any user-facing copy: this is the *pick-up-new-capabilities* case, **not**
  the *initial-rooting* rule (a never-rooted session still needs a new conversation rooted in the brain).
- [ ] Reflect it where the brain tells the user to "open a new conversation" after an update — a restart
  is the lighter, sufficient action there.

## F5 — `local-mirror` always names the two Notion modes

Observed working well in QA: the brain cleanly disambiguated **native Notion connector** (live, ad hoc)
vs **`local-mirror`** (local replication indexed by the RAG). This was a prior backlog concern — now
confirmed good; keep it from regressing.

- [ ] Keep the two-modes disambiguation explicit in the `local-mirror` skill trigger/copy (Lots 3 & 4).
- [ ] Optional: a lightweight regression check that the skill names both modes when intent is ambiguous.

## F6 — QA hygiene (do first)

- [ ] **Re-purge** the confidential mirror under `legacy-brain/vault/mirrors/…` (ex-company content).
- [ ] **Drop the uncommitted diff** on `legacy-brain` (do **not** `Commit changes` with confidential
  content).
- [ ] Keep all repo artifacts **generic** — never name the zone/workspace/token.

---

> Links: [[prefer-deterministic-adr-0009]], ADR 0026 (reconciler), ADR 0025 (install-if-absent skills/MCP),
> the `doctor` check-up idea and the citation feature in `post-v3.1.0-ux-backlog.md`.

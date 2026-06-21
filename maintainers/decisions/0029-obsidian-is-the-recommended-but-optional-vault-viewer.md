# ADR 0029 — Obsidian is the recommended-but-optional vault viewer

- **STATUS:** ✅ ACCEPTED (2026-06-20).
- **Scope:** Second brain (runtime) + Installer — install-time guidance and opt-in vault registration, plus a
  runtime soft health hint.
- **Related:**
  [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher↔brain axis the Scope sits on),
  [`0026-brain-self-converges-via-idempotent-reconciler.md`](0026-brain-self-converges-via-idempotent-reconciler.md)
  (why vault registration is an install-time concern the runtime reconciler must not touch),
  [`0027-local-citations-open-via-a-claude-invoked-opener.md`](0027-local-citations-open-via-a-claude-invoked-opener.md)
  (a 🧠 citation opens the real file in the OS default Markdown editor — Obsidian only if it *is* that default),
  [`0028-brain-runs-a-non-blocking-background-health-check.md`](0028-brain-runs-a-non-blocking-background-health-check.md)
  (the soft Obsidian hint rides a channel separate from the broken-capability health banner).

## Context

The brain's notes are plain Markdown files. **Obsidian** is a free, open-source read/write graph editor that
opens a folder of Markdown as a "vault" — the *same* files Claude reads and writes, with links, a graph view
and a real editor on top. It is the natural companion viewer for browsing the vault *as a whole*.

Opening a **single** note is a different job, and it is NOT Obsidian's to own: the brain opens the real file
through the OS default Markdown editor (`open <path>` → Typora, Obsidian, VS Code, … — whatever the user set),
both for an ad-hoc "open my note" and for a 🧠 citation (ADR 0027). That is editor-agnostic and lock-in-free;
routing single-note opens through an Obsidian-specific `obsidian://` scheme would tie them to one app and add
a vault-registration precondition for no gain.

So Obsidian's role here is the **vault browser**, recommended but never required. Two opposite ways to get
*that* wrong. Treating Obsidian as a **hard dependency** would break the brain's core promise: the notes are
plain Markdown that work with any editor, and a 🧠 citation already opens in the default editor (or **inline in
Claude Desktop** with zero install). Being **intrusive** — associating `.md` files system-wide, or nagging to
install on every session — would hijack the user's machine and their attention for an optional convenience.

## Decision

**Obsidian is packaged as the brain's recommended-but-optional vault viewer/editor.** Three commitments, no
more:

1. **Guided install when absent.** When Obsidian is not detected, the brain prints one clear, **opt-in**
   recommendation: free + open-source + a viewer/editor over the user's *own* Markdown notes, with the
   download URL (https://obsidian.md) and the one-time "Open folder as vault" step. Claude **cannot** install
   a desktop GUI app reliably (no headless/brew path that yields a working Obsidian) → it **guides**, it never
   pretends to automate. Never blocks install.

2. **Opt-in auto-register when present.** When Obsidian is installed and closed, the installer adds the brain's
   vault to Obsidian's `obsidian.json`, so the brain shows up **ready to browse** in Obsidian's switcher with no
   manual "Open folder as vault". Safe by construction: idempotent, backs up the config before writing, **never
   clobbers** other vaults, and acts **only when Obsidian is installed AND not running** (Obsidian rewrites
   `obsidian.json` on quit). Opt-out via `SBG_NO_OBSIDIAN_REGISTER`. This is **install-time only** — the runtime
   reconciler (ADR 0026) must not touch Obsidian, because Obsidian may be running at session start.

3. **Soft health hint, never "broken".** The Obsidian health probe reports `ok` (installed + this vault
   registered) or `unknown` (absent or unregistered) — **never** `broken`. It rides a soft channel separate
   from the broken-capability banner (ADR 0028). The runtime nag policy surfaces **only** the actionable
   installed-but-unregistered case (one "Open folder as vault" fixes it forever, then it goes quiet) and stays
   **silent when Obsidian is absent** — the install recommendation is a one-shot install-time message, not a
   per-session nag.

### Hard guardrails (non-negotiable)

- **Recommended, never required.** A missing Obsidian never degrades the brain: notes are plain Markdown that
  open in the user's default editor, and the 🧠 local copy of any citation opens **inline in Claude Desktop**
  with no Obsidian (the zero-install path).
- **No system `.md` file association.** Hijacking the user's file associations is intrusive and breaks the
  no-lock-in promise.
- **A missing/unregistered Obsidian is never a scary "broken" health banner** — it is a gentle optional nudge.

## Why not the alternatives

- **Make Obsidian a hard dependency (or bundle it).** Breaks the no-lock-in promise — the whole point is that
  the user owns plain Markdown that works with any editor — and Claude can't reliably install a desktop GUI app
  on the user's behalf.
- **Auto-associate `.md` with Obsidian system-wide.** Intrusive: it changes how *every* Markdown file on the
  machine opens, for an optional convenience the user never asked for.
- **Register the vault from the runtime reconciler, not just at install.** Obsidian rewrites `obsidian.json` on
  quit and may be running at session start; a runtime edit risks being clobbered or clobbering Obsidian's own
  state. Registration is a one-time install concern, kept off the reconciler (ADR 0026).
- **Recommend installing Obsidian on every session.** Nagging for an optional app is hostile. The
  recommendation is shown once, at install; runtime only nudges the one-click registration case.

## Consequences

- Opening a note always lands in the user's default Markdown editor (or inline in Claude Desktop); a user with
  Obsidian additionally gets the whole vault **auto-registered for browsing** (graph, backlinks); a user
  without it still has a fully working brain (plain Markdown + inline view) plus a one-time recommendation if
  they want the nicer viewer.
- The Obsidian integration spans the **installer** (guided install copy + opt-in registration) and the
  **runtime** (soft health hint) — hence the dual Scope.
- **First-launch caveat:** a brand-new Obsidian opens on a vault-picker / welcome screen; `obsidian://` opens
  can stall until the user picks a vault once. The install copy and the soft hint mention this one-time step,
  and the manual QA exercises the first-launch path on a clean machine.

# ADR 0019 — Importing a previous brain is a keyword-driven skill + deterministic core (Kenjaku is flavour only)

- **STATUS:** ACCEPTED (2026-06-15).
- **Scope:** Second brain (runtime) + Installer — the `import` skill is installed into the brain and
  runs brain-side; it reaches pre-3.0.0 users because a fresh install (now 3.1.0) ships it.
- **Related:** [`0016-update-engine-is-a-skill-not-an-mcp-tool.md`](0016-update-engine-is-a-skill-not-an-mcp-tool.md)
  (same shape — thin conversational skill over a deterministic `.mjs` core; the precedent this mirrors),
  [`0003-no-brain-capability-upgrade.md`](0003-no-brain-capability-upgrade.md) +
  [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) (engine ≠ data;
  why pre-3.0.0 brains can't self-upgrade and must re-home their data),
  [`0002-in-house-installer-vs-plugin.md`](0002-in-house-installer-vs-plugin.md) (Claude-driven,
  no-terminal onboarding — the ethos), [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (the real work lives in a testable, deterministic core), [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md)
  (why this is NOT a `vault-rag` tool), [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md)
  (the core must run on macOS + Windows). Plan: [`import-second-brain-action.md`](../plans/import-second-brain-action.md).

## Context

v3.0.0 split the brain into **engine** (RAG + harness, swappable) and **data** (the notes), and gave
brains a **self-upgrading engine** — but **only for brains born ≥ 3.0.0** (they ship `update-engine` and
a provenance marker; ADR 0016). People who installed **before 3.0.0** have neither, so they **cannot
self-upgrade**: the only path to v3 is a **fresh install + re-homing their notes** into it.

Today that re-homing is a **manual copy-paste of the `vault/` folder** — error-prone (the footgun:
copying the *whole brain* overwrites the new engine), and it loses the "all in natural language" feel of
the product. We want the data move to be **delightful and safe**. Importing notes from an external
folder is also a **recurring** need (a user bringing in an old export), not a one-off.

The question: *where does the import capability live, and how is it triggered?*

## Decision

**Importing a previous brain's content is a brain-side, keyword-driven *skill* (`import`) backed by a
pure-Node *deterministic core*.** It is NOT a `vault-rag` MCP tool, NOT a terminal-only CLI, and NOT an
installer flag.

- **The core** (`scripts/import-brain.mjs` + pure helpers in `scripts/lib/import-vault.mjs`) does the
  real, testable work: locate the source vault, build a **plan** (which notes to import, which collide,
  which are skipped) **with no writes**, then **apply** it (copy vault content, never overwriting),
  reporting exactly what happened. Unit-tested, cross-platform (ADR 0015).
- **The skill** (`import`, shipped into the brain by the installer) is the thin conversational driver:
  it asks for the source path, shows the plan, **confirms** (writes are always confirmed), runs the
  core, triggers a reindex, and reports. It holds **no business logic** (ADR 0009/0016).

**Triggers are plain functional keywords, multi-language:** *import / importer, migrate / migrer,
transport / transporter, recover / récupérer, my old / previous **second brain**, anciennes notes*. The
skill's `description` carries these so Claude loads it on the user's natural phrasing.

**Kenjaku is a purely poetic / marketing detail.** It lives in the README and the skill's prose
("transplant a mind into a new vessel"), **never** as a required invocation word. **A user who has never
heard of Jujutsu Kaisen must be able to trigger the import with ordinary words** — "importe mes anciennes
notes depuis `<chemin>`" must work without anyone ever typing or knowing "Kenjaku".

## How it reaches each audience

- **Newcomers & pre-3.0.0 migrators** — a fresh install is now **3.1.0**, which **ships the `import`
  skill out of the box**. The migrator installs the new brain, opens a NEW rooted conversation (the
  hand-off banner already nudges this), and says *"importe mes anciennes notes depuis `<chemin>`"*.
- **Existing ≥ 3.0.0 brains** — they receive `import` via **`update-engine`** (it lands in the `merge`
  bucket like the other skills). This makes `import` the **first capability delivered *on* the v3
  platform** — a live proof that the engine is extensible.

> The migrator still does a **fresh install first** (unavoidable — their old brain has no updater). The
> skill removes the *manual* part of step 2 (bringing the data in), not the install itself.

## Guardrails (baked into the core, asserted by tests)

- **Vault-only.** Import note content (and attachments) from the source `vault/` **only** — never the old
  engine / `.git` / `.claude` (that is the copy-the-whole-folder footgun).
- **Plan before write, then confirm.** The core returns a plan with zero writes; the skill confirms
  before `applyImport`.
- **Zero silent overwrite.** A name collision is **skipped and reported**, never clobbered.
- **No example notes.** Demo notes (frontmatter `tags: [exemple]`) are excluded (reuse `isExampleNote`).
- **Reindex after** (incremental; the `EMBED_BATCH` cap already handles big vaults).
- **Constitution untouched** (v1). `CLAUDE.md` personalisations are reported as a manual follow-up, not
  auto-merged (scope guard).

## Consequences

- **Consistent with the product ethos** (ADR 0002/0016): install, update and now import are all
  conversational, opt-in, no-terminal — right for non-technical users.
- **Testable & deterministic** (ADR 0009): logic in `.mjs` under `node --test`; the skill is UX only.
- **The MCP contract stays clean** (ADR 0006): `vault-rag` keeps doing retrieval only.
- **A 3.1.0 minor bump** (new backward-compatible feature) — surfaced as the engine git tag (ADR 0017);
  existing brains pull it through `update-engine`.
- **The pure core is reusable** if an install-time `--import` is ever wanted — but that is **YAGNI** now;
  the skill path already serves every audience.

## Rejected alternatives

- **Installer flag `--import` only.** Importing *during* creation is clunkier than "install, then say
  importe", and it skips the conversational, confirm-first UX. The pure core leaves the door open later.
- **A tool on the `vault-rag` MCP server.** Couples retrieval to data-mutation and erodes ADR 0006.
- **A "pure prompt" skill** (logic in the description). Non-deterministic, untestable — violates ADR 0009.
- **A Kenjaku-named trigger** (e.g. requiring "kenjaku" / "transmigrate"). Gatekeeps the feature behind
  Jujutsu Kaisen lore; hurts discoverability and Claude's matching. Flavour stays in prose, never in the
  trigger.
- **Shipping import only via `update-engine`.** Would miss the exact audience that needs it (pre-3.0.0
  brains have no updater). Shipping it in the fresh install is what reaches them.

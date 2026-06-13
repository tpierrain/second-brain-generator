# ADR 0002 — In-house installer/generator rather than a Claude plugin

- **STATUS:** ACCEPTED (2026-06-05).
- **Scope:** Installer.
- **Related:** [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher↔brain
  architecture this decision dresses up), [`0003-no-brain-capability-upgrade.md`](0003-no-brain-capability-upgrade.md)
  (updatability, a direct consequence of the choice), [`0004-claude-only-for-now.md`](0004-claude-only-for-now.md).

## Context

There is an "idiomatic" way to distribute Claude Code capabilities: a **plugin** installed from
a **marketplace** (skills + slash-commands + hooks + MCP server packaged together, dropped in by
`/plugin install`). The question came up: should the generator be a plugin, rather than a
`bootstrap.mjs` you clone and run?

Two forces settle the answer:

1. **The target audience is non-technical** — managers, PMs, consultants, researchers (cf. README
   "Who is it for?"). We cannot assume they know the notions of plugin, marketplace, global scope
   of hooks, or even Claude Code in any depth.
2. **A plugin solves the wrong problem.** A plugin adds *shared capabilities* to an existing
   Claude environment. The product, on the other hand, must **create a separate, owned git repo,
   with its own constitution (`CLAUDE.md`) and its auto-commit**: this is *per-user data*, not
   *shared code*. No plugin does that — you'd need a scaffolder on top anyway.

## Decision

The generator stays an **in-house installer**: a launcher you clone, driven by a **conversational
bootstrap stub** (the launcher's `CLAUDE.md`) that has Claude gather the answers **in chat**, then
runs **ONE** command `node bootstrap.mjs --non-interactive` *(the script has since been renamed
**`installer.mjs`** — the name above is kept as the historical record of this decision)*. The
deterministic script does everything (copy, generation, `git init` of the brain, RAG install, MCP
smoke-test).

We **do not package** the generator as a plugin/marketplace for now.

## Consequences

- **Guarantees a simple entry point for a non-specialist:** "ask me questions, I install myself"
  is more accessible than "add a marketplace then install a plugin". Claude is the conversational
  wrapping; the user learns no tooling concept.
- **Guarantees the brain's self-sufficiency** (consistent with ADR 0001): everything is copied
  into the brain folder, no external link, no dependency on a plugin registry or its availability.
- **Guarantees hook targeting:** the auto-commit (`PostToolUse`) and the `SessionStart` live in
  the brain's **local `settings.json`** — they act only there, not globally as plugin hooks might.
- **Costs discoverability:** no "1-command" install from a marketplace; you have to clone.
  Acceptable as long as onboarding goes through the Claude bootstrap stub.
- **Costs updatability** (see [`0003`](0003-no-brain-capability-upgrade.md)): without a
  versioned distribution channel, generated brains receive no engine/skills updates. It's a
  conscious choice, addressed in the dedicated ADR.
- **Invariant not to violate:** install must remain doable **without any technical skill or
  knowledge of the Claude ecosystem being required of the end user**. Any evolution (including a
  future plugin) must preserve this "guided in chat, zero concept to learn" path.

## Rejected alternatives

- **All-plugin (marketplace)** — pushes the complexity onto the user (plugin concepts, global
  hooks) and still doesn't create the owned brain-repo: you'd *still* need a scaffolder. Real
  discoverability gain but premature as long as the product isn't published/distributed.
- **Hybrid (npm engine + plugin + thin scaffolder)** — appealing for updatability and
  discoverability, but multiplies the maintenance surface (package + marketplace + script) for a
  benefit that only materializes with a user base. **Not rejected forever**: to reconsider at
  publication, leaning on feedback (cf. ADR 0003 and 0004).

## Addendum (2026-06-14) — a plugin can't *replace* the scaffolder, but it can *distribute* it

A fair challenge (Thomas) on the wording above: *"No plugin does that — you'd need a scaffolder on top
anyway"* can be **misread as "a plugin is incapable of installing a brain"**. That overstates it.
The precise picture:

- A Claude Code plugin bundles skills + **slash-commands** + hooks + MCP servers + agents, and a
  command **can run arbitrary code**. So a plugin can perfectly well **ship `installer.mjs` and expose
  a `/install-second-brain` command** that runs it — with the marketplace's discoverability as a bonus.
- What stays true is narrower: a plugin **cannot *replace* the scaffolder** (a plugin adds *shared
  capabilities* to an existing Claude env; it does not, by itself, create the *owned per-user
  git repo + constitution + auto-commit*). It can only **distribute** that scaffolder. The brain's
  hooks still land in the **brain's local `settings.json`** (written by the scaffolder), not as global
  plugin hooks — so the hook-targeting concern above is unaffected.

This is exactly the **"Hybrid (npm engine + plugin + thin scaffolder)"** alternative already listed —
which we **did not reject**, only deferred to publication. So the decision is unchanged (in-house
installer **for now**, audience + maintenance-surface trade-offs), but the *reason* is "trade-offs",
**not** "impossibility".

**External data point.** [`codejunkie99/familiar-second-brain`](https://github.com/codejunkie99/familiar-second-brain)
("Familiar", an Obsidian + Kimi-agents second brain) independently reached the **same architecture**:
not a plugin, but a **clone-and-run installer** (`python3 scripts/install.py`, dry-run + smoke test)
that scaffolds a **per-user vault + a local MCP server + a skill**, then plugs into MCP clients
(Claude, Cursor, Codex). A separate project, same conclusion — corroborates the "you still need a
scaffolder" core, even as it confirms the *plugin/marketplace-as-distribution* layer remains the open
question for **when we publish**.

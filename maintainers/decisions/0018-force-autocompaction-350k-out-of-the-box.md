# ADR 0018 — Every brain forces aggressive auto-compaction: no second brain exceeds a 350k effective context out of the box

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — the installer bakes the `env` block into the brain's
  `settings.json` (from the template); Claude Code (the runtime) consumes the variable to cap the effective
  context and trigger compaction earlier.
- **Related:** [`0009`](0009-prefer-deterministic-mechanisms.md) (a **static, deterministic** config value — not
  a probabilistic/timer mechanism — is exactly the kind of lever to prefer), [`0015`](0015-cross-platform-parity.md)
  (an `env` block in `settings.json` is OS-agnostic — no `process.platform` branch), [`0001`](0001-launcher-vs-brain.md)
  (this ships in **every generated brain**, the launcher template stays read-only and reusable). Plan:
  [`post-phase1-version-and-autocompact-action.md`](../plans/archived/post-phase1-version-and-autocompact-action.md)
  (Chantier B, shipped 2026-06-14, commit `05ab1b1`).

## Context

A long agent conversation degrades as its context fills — "context rot": once the working context is bloated
with stale tool output and old turns, retrieval and reasoning quality drop. This is **"levier 2"** of the
maintainer's article (*Comment éviter de devenir zinzin, votre IA et vous un peu aussi*): **force compaction
*earlier* than the default**, so the active context stays lean and high-signal.

Claude Code's **default** auto-compaction fires near the model's real limit — roughly **~83%** of the context
window (it reserves a ~13k-token buffer for the response). On the context tiers users actually have:

- **200k models** (the default for Sonnet/Opus/Haiku, and what a **non-developer on Claude Desktop almost always
  gets** — the 1M window is a special API/tier): default compaction ≈ **166k**. Already fairly lean.
- **1M models** (the maintainer's case, and a growing cohort): default compaction ≈ **~950k**. That is **far too
  late** — by then the context has long since rotted.

A second brain is used by **non-technical people** who will never set an env var themselves. If we want the
quality benefit, it must be **baked in, out of the box**.

There are two levers to do this, and they are **not** equivalent:

- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** (absolute) — **reduces the *effective* window** to a fixed token count,
  then compaction fires at ~83% of *that*. **Empirically confirmed working** by the maintainer on his own 1M
  setup. **Key safety property** (web-documented + reasoned): it can only ever *reduce* the effective window — it
  **cannot raise capacity beyond the model's real limit**, so setting it **above** a model's window is simply a
  **no-op**.
- **`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`** (percentage) — would scale to any window, but is **buggy on 1M models**
  ([anthropics/claude-code#53801](https://github.com/anthropics/claude-code/issues/53801): not honored, fires at
  ~195k regardless) and is **capped at ~83%**. The maintainer confirms it **does not work** for his case.

## Decision

**Bake `"env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" }` into `.claude/settings.json.template`**, so
**every generated second brain caps its effective context at 350 000 tokens out of the box** and compacts
aggressively (~290k) well before quality rots. It is a **static literal** block — the installer's `gen()` only
substitutes `{{…}}` placeholders, so it flows through verbatim into each brain's `settings.json`.

Why **350000**, and why the **absolute `…WINDOW`** variable rather than the percentage one:

1. **350k is the maintainer's calibrated value** for a brain (the article cites 300k for code; a brain has a bit
   more breathing room — more retrieval/analysis). It is **the right tool for the goal**: force *early*
   compaction on a *roomy* context.
2. **The percentage override is rejected** — buggy on exactly the 1M case we most need it for, and capped at
   ~83% anyway. The absolute variable is the **only reliable** way to force the cap.
3. **It is harmless on small-context (200k) users — the whole worry, resolved.** Because the variable can never
   exceed the model's real limit, `350000` on a 200k plan is a **no-op**: those brains keep Claude Code's default
   safety net (compaction ≈ 166k), with **zero disruption**. The benefit (forced early compaction) materializes
   only on models whose real window is **> 350k** (1M today, and a growing cohort). The cost is a single static
   line with **no runtime cost and no maintenance**.
4. **No per-model conditional logic.** Since the variable self-clamps, there is nothing to detect or branch on —
   adding machine/model detection would be **over-engineering against a risk that does not exist**.

**The guarantee, stated plainly: no second brain exceeds a 350 000-token effective context out of the box.** On
roomy models that means it actively compacts earlier; on small models the ceiling is already below 350k, so the
guarantee holds trivially and the default behavior is preserved.

`settings.json` is in the manifest's **`merge`** regime, so a power user who wants a different threshold can edit
their own value and `update-engine` will respect it (3-way merge, Phase 2) — the bake is a **sane default, not a
lock-in**.

## Consequences

- **Every brain has a lean, quality-preserving context ceiling by default**, with no action from a non-technical
  user — directly serving "levier 2".
- **No disruption for the 200k majority**: the value is inert there (can't exceed the model limit), the default
  compaction safety net stays intact.
- **Future-proof for the 1M cohort** (the maintainer today; more users as 1M spreads): they get the real benefit
  immediately.
- **One static line, zero maintenance, OS-agnostic** (ADR 0015); no probabilistic/timer machinery (ADR 0009).
- **Overridable**: it's a default in a `merge`-regime file, not a hard lock (the user can change it; updates
  respect their edit).
- **Coupling to a Claude Code env var**: if Anthropic renames/removes `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, the
  block becomes inert (a harmless unknown env key) — fail-silent, never a crash. Re-confirm the name at major
  Claude Code upgrades.

## Rejected alternatives

- **`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (percentage).** Would scale to any window, but **buggy on 1M**
  ([#53801](https://github.com/anthropics/claude-code/issues/53801)) and **capped ~83%** — unreliable for the
  exact case we need. Maintainer-confirmed not working.
- **Do nothing (ship the default).** Leaves 1M brains compacting at ~950k — context fully rotted by then;
  defeats "levier 2".
- **Per-model / per-machine conditional value.** The absolute variable already self-clamps to the model limit, so
  detection logic adds complexity for **no benefit** — over-engineering against a non-existent risk.
- **A lower value (e.g. < 200k) to also benefit small-context users.** Would clobber the 1M advantage (clamp big
  contexts far too small) and a single absolute value can't serve both tiers; 200k users' default (~166k) is
  already lean enough.

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE / ANALYSIS (2026-06-21) — design captured, not yet an  -->
<!-- ADR, NOT implemented. Provisional direction agreed; decide + write the ADR     -->
<!-- when a release actually changes the constitution (see "Why this is non-blocking"). -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Propagating engine improvements into user-editable provided files (constitution + shipped skills)

## The problem (the WHAT)

A brain has files that are **both upstream-provided AND user-editable** — chiefly the **constitution
`CLAUDE.md`** and the **shipped skills** (`coach`, `prepare-1-1`, …). Today the reconciler protects them
perfectly but **at the cost of zero propagation**:

- `CLAUDE.md` and `.claude/settings.json` are `SACRED_FILES` (`scripts/lib/engine-apply-plan.mjs:32`) →
  **never written by any engine path**. So an engine improvement to the constitution **never reaches an
  existing brain** — and note: it is frozen **regardless of whether the user ever edited it** (it is not
  "edit once → frozen"; it is "frozen, period").
- Shipped skills are `installSkills` = **install-if-absent** (ADR 0025): an already-present skill (possibly
  user-edited) is left **byte-identical**, so skill bugfixes/improvements never reach a brain that has it.

The reconciliation guarantee ("only ever modify what comes from the engine, and only when absent") is
**safe by construction** (write-allowlist + sacred scrub, ADR 0012). The open question is the *other* half:
**how to deliver improvements to these files without ever clobbering the user's edits.**

## Provisional decision (agreed with Thomas 2026-06-21, to confirm + ADR after the demo)

**Option 3 as the foundation, options 2/1 as the safety net.**

- **3 — Separate engine-managed content from personal content *inside* the file** (the foundation).
  The constitution carries an **engine-managed block** (delimited, e.g. `<!-- ENGINE:BEGIN -->…<!-- ENGINE:END -->`)
  that moves back into the **`replace`** regime (always refreshed, like `rag/src`), plus **personal zones**
  that stay `sacred`. This **eliminates conflicts by construction** — no base to store, no merge algorithm,
  no conflict UX, **deterministic** (aligns with ADR 0009). It maps the file's reality: most of `CLAUDE.md`
  is engine machinery; the personalization (owner, role, language, persona) is localized. Composes with an
  **include / layered** model (`CLAUDE.md` engine-owned `@import`s a `CLAUDE.personal.md` sacred → nothing
  to merge at all). _Prior art: Ansible "BEGIN/END MANAGED BLOCK", managed blocks in `/etc/hosts` / `known_hosts`._
- **2 — 3-way merge** (the net for "the engine block was edited anyway", and for legacy migration).
  Store the **base** (the originally-provided version); at upgrade have `base` / `theirs` / `new` → auto-apply
  clean hunks, surface only real conflicts. This is what ADR 0012 already promised ("merge 3-way, hunk by
  hunk"). **Feasible here because the constitution is already template-rendered** (`constitutionTemplate`
  version in the manifest) → the base is recoverable by re-rendering the install-time template version with
  the same personalization params. _Prior art: git 3-way merge._
- **1 — Conffile fallback** (the simplest net). On conflict: **keep theirs**, drop the new version
  **alongside** (`CLAUDE.md.new`), and **tell the user**. Manual merge, zero auto-merge risk.
  _Prior art: Debian `dpkg` conffiles / `ucf`, `.rpmnew`._

Always **opt-in and non-destructive**: no silent overwrite, ever. The same logic would replace the frozen
install-if-absent behavior for shipped skills.

## Open questions / caveats (for the ADR)

- [ ] **Legacy migration is the hard part.** Existing brains have a **monolithic** `CLAUDE.md` with personal
  edits scattered anywhere — the `ENGINE:BEGIN/END` boundary cannot be inferred retroactively without risk
  of capturing a personal edit inside the engine block. Option 3 needs a migration story (likely lean on the
  2/1 net for the first jump, or introduce the boundary only on fresh installs + a guided one-time migration).
- [ ] **Editing an engine *instruction*** (not just adding one's own) — prose doesn't override like CSS;
  decide whether that's supported (probably via the personal zone / overrides, or accepted as out-of-scope).
- [ ] **Where the base lives** for option 2 (store the rendered base, or the template version + params to
  re-render). Keep it engine-owned, read-only to the user.
- [ ] **`engine-manifest.json` itself** is currently in **no regime** — confirm it is engine-owned (it should
  travel in `replace`) and never user-edited (the "read-only little paper" Thomas described).
- [ ] **Skills** follow the same model (managed vs user-authored; user-authored already fully safe via the
  `SACRED_TREES` `.claude/skills/` rule).

## Why this is non-blocking today

Upgrading an **already-configured** brain (edited constitution, custom skills) is **safe right now**, for three
independent reasons — so this enhancement is not required to ship any current release:

1. **No release has ever changed the constitution.** `constitutionTemplate` has been `1.0.0` across every
   version (rag 1.1.0 → 1.1.5) → there is literally nothing to propagate yet.
2. **The reconciler never clobbers user-edited files** — `CLAUDE.md` is `SACRED`, custom skills live under
   the `.claude/skills/` sacred tree, the vault and `.env` are sacred (write-allowlist, ADR 0012).
3. **A stale constitution cannot break the engine** — it is instructions for Claude, not code the engine
   executes; the RAG / MCP / hooks work regardless of its content.

This enhancement becomes relevant only the day a release *does* change the constitution (a `constitutionTemplate`
bump). Until then, the current install-if-absent / sacred behavior is the correct, safe default.

## Next steps (post-demo)

- [ ] Promote this analysis into a dedicated **ADR** (lead with a Crux; name the prior art — §6quater/§6quinquies
  of `CONVENTIONS.md`); amend ADR 0012 in place if it changes the merge-regime mechanics.
- [ ] Decide the legacy-migration path (the gating caveat above).
- [ ] Plan + TDD the implementation as its own change, **not** under release pressure.

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🗺️ ACTION PLAN (created 2026-06-15) — to execute, step-by-step, in TDD. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — `import` skill: re-home a previous second brain into a v3.1.0 brain (keyword-driven, Kenjaku-flavoured)

> **STATUS: 🗺️ ACTION PLAN** (created 2026-06-15). **To execute in TDD.**
> **The *why*** → ADR [`../decisions/0019-import-previous-brain-is-a-keyword-skill.md`](../decisions/0019-import-previous-brain-is-a-keyword-skill.md)
> (import = brain-side **skill** + deterministic core ; **Kenjaku = flavour only, never a trigger word**).
> **Mirrors** the shape of `update-engine` (ADR [`../decisions/0016-update-engine-is-a-skill-not-an-mcp-tool.md`](../decisions/0016-update-engine-is-a-skill-not-an-mcp-tool.md)):
> thin conversational skill over a testable `.mjs` core (ADR 0009), shipped into the brain via the
> manifest, cross-platform (ADR 0015).
> **Ships as v3.1.0** (new backward-compatible feature → *minor* bump): fresh installs get it out of the
> box; existing ≥ 3.0.0 brains pull it via `update-engine` → **the first feature delivered on the platform.**
> **Branch: `import-brain`** (PicΦ feature → branch + PR, like engine-packaging PR #10 ; **not** direct main).
> **⏳ Sequence (decided 2026-06-15):** ship [`node-compat-native-deps-action.md`](node-compat-native-deps-action.md)
> (**v3.0.1**, unblocks install on Node 24/25/26) **FIRST** — a reliable install on modern Node is the
> foundation this skill stands on (a migrant does a fresh install before importing). Then this plan = **v3.1.0**.

---

## 🎯 Why (the user experience we're building)

A user who had a brain **before v3.0.0** can't self-upgrade (no updater, ADR 0003/0016). Their path to v3
is: **install a fresh 3.1.0 brain → open a NEW rooted conversation (the hand-off banner already nudges
this) → say _"importe mes anciennes notes depuis `<chemin>`"_**. The `import` skill then scans the old
vault, shows a **safe plan**, **confirms**, copies (never overwriting), reindexes, and reports.

- **Keyword-driven, multilingual triggers:** import/importer · migrate/migrer · transport/transporter ·
  recover/récupérer · **(my old / previous) second brain** · anciennes notes. **No JJK knowledge required.**
- **Kenjaku** = poetic skin in the prose/README only ("transplant a mind into a new vessel"). Never a word
  the user must type.

---

## 📐 Design (frozen)

- **Pure core** `scripts/lib/import-vault.mjs` (no I/O beyond fs read in `plan`, fs write in `apply`):
  - `planImport({ source, dest })` → `{ sourceVault, notes:[], collisions:[], skippedExamples:[] }`.
    **No writes.** Resolves `source` to a vault dir (accepts a brain root **or** a `vault/` dir directly),
    walks it, classifies each file: **import** (new), **collision** (same relpath already in `dest` vault),
    **skippedExample** (frontmatter `tags: [exemple]` — reuse `isExampleNote` from `example-notes.mjs`).
    Skips hidden/system entries. Attachments (non-`.md`) travel with the notes, structure preserved.
  - `applyImport(plan, { dest })` → `{ copied:[], skipped:[] }`. Copies planned files into `dest` vault,
    **preserving subfolders**, **never overwriting** a collision (skip + report).
  - Fail-loud: missing/empty source vault, or `source === dest`, throw a clear message.
- **CLI entry** `scripts/import-brain.mjs` (thin, like `scripts/update-engine.mjs`): `node scripts/import-brain.mjs <source> [--apply]`
  → prints the plan; with `--apply`, runs it and prints the result. Deterministic, no business logic of its own.
- **Skill** `.claude/skills/import/SKILL.md` (driver): keyword-rich `description`, "when to use", **OPT-IN /
  confirm-before-write**, "touches vs NEVER touches" table, reindex step, Kenjaku flavour note + the explicit
  "**you never need to say Kenjaku**" line. FR overlay under `templates/fr/`.
- **Reindex** stays **out of the pure core** (ONNX, minutes): the skill triggers it after apply (incremental;
  `EMBED_BATCH` cap already shipped). Mirror `update-engine` (decision pure, run elsewhere).
- **Constitution untouched** in v1 (report a manual follow-up, no auto-merge).

---

## 📋 Tracking

- [ ] **0. ADR 0019 written & accepted** _(done 2026-06-15)_ — re-read it before coding; it freezes the
  guardrails and the "Kenjaku ≠ trigger" rule.
- [ ] **1. Pure core `scripts/lib/import-vault.mjs` (TDD, baby-steps)**
  - [ ] 1a. **`planImport` — source resolution.** RED→GREEN: a `source` that is a brain root resolves to
    `<source>/vault`; a `source` that is already a vault dir is used as-is; a non-existent/empty source
    throws a clear error; `source === dest` throws.
  - [ ] 1b. **`planImport` — classification.** Triangulate: a brand-new note → `notes`; a note whose relpath
    already exists in `dest` vault → `collisions`; an example note (`tags: [exemple]`) → `skippedExamples`;
    nested subfolders + accented filenames preserved in the relpaths.
  - [ ] 1c. **`planImport` — attachments & hidden.** A non-`.md` attachment under the vault → imported
    (travels with notes); hidden/system entries (`.obsidian`, `.git`, dotfiles) → ignored.
  - [ ] 1d. **`applyImport` — copy, structure-preserving, non-destructive.** Copies planned files under
    `dest` vault keeping subfolders; a collision is **skipped** (never overwritten) and reported.
  - [ ] 1e. **Refactor** + re-read the suite green.
- [ ] **2. CLI entry `scripts/import-brain.mjs` (thin)**
  - [ ] 2a. Parse `<source> [--apply]`; print plan (counts + sample); with `--apply` run + print result.
  - [ ] 2b. Fail-loud, non-zero exit on error (relay the core's message). Smoke-test it on a temp fixture.
- [ ] **3. Skill `.claude/skills/import/SKILL.md` (EN) — the keyword-driven driver**
  - [ ] 3a. `description` packed with the **functional** triggers (import/migrate/transport/recover/second
    brain, EN+FR). Verify mentally that *"importe mes anciennes notes depuis X"* and *"migrate my old
    brain"* both match — and that **no JJK word is required**.
  - [ ] 3b. Body: when-to-use · **OPT-IN, confirm before write** · touches/NEVER-touches table · "run the
    core, then reindex" · the **Kenjaku flavour note** explicitly tagged as optional lore ("you never need
    to say this word").
- [ ] **4. FR overlay `templates/fr/.claude/skills/import/SKILL.md`** — mirror the EN skill in French
  (same triggers, same guardrails), like the existing `update-engine` FR overlay.
- [ ] **5. Manifest wiring (`engine-manifest.json`) + self-carry**
  - [ ] 5a. Add `.claude/skills/import/**` to **`merge`** (like the other skills) and
    `scripts/import-brain.mjs` to **`replace`** (the libs are already covered by `scripts/lib/**`).
  - [ ] 5b. Update `engine-manifest.test.mjs` accordingly; confirm **self-carry** (a future `update-engine`
    carries the import core + skill forward — same invariant as [[update-engine-must-self-carry-libs]]).
- [ ] **6. Ships into the brain (install path)** — confirm the import files are **NOT** dev-only excluded
  (they must travel via `filterCopyable`): `scripts/import-brain.mjs`, `scripts/lib/import-vault.mjs`,
  `.claude/skills/import/**` all land in a generated brain. Add a `tracked-files` assertion if useful.
- [ ] **7. Docs**
  - [ ] 7a. **README** — a "Already have a brain from before v3.0.0?" section: install 3.1.0 → new rooted
    conversation → *"importe mes anciennes notes depuis `<chemin>`"*; the **footgun in bold** (copy the
    *vault content*, not the whole folder); note attachments travel, constitution = manual; the Kenjaku
    marketing line as flavour.
  - [ ] 7b. **SETUP.md** — the same flow + caveats (first reindex takes a few minutes on a big vault;
    re-do `.env` / re-wire connectors).
- [ ] **8. Suites green** — `node --test scripts/lib/*.test.mjs` (harness) ; `npm test --prefix rag` ;
  `(cd rag && npx tsc --noEmit)`. **On ne commit que du vert** ([[commit-only-green-todo-gate]]).
- [ ] **9. Empirical proof — a real import**
  - [ ] 9a. Build a **fake "old brain"**: a fresh install, then drop **many** real notes into its `vault/`
    (incl. subfolders, accents, an attachment, and leave a demo note in to prove it's skipped).
  - [ ] 9b. Build a **fresh 3.1.0 brain**; from a NEW rooted conversation run the import (or `node
    scripts/import-brain.mjs <old> --apply`).
  - [ ] 9c. **Verify**: imported notes are searchable from the vault; **one** import commit; **no**
    overwrite; demo note **skipped**; attachments present; structure preserved.
  - [ ] 9d. Clean up the test brains.
- [ ] **10. Ship** — PR from `import-brain`, `/code-review`, manual QA, merge; **tag `v3.1.0`** on merge
  (ADR 0017). Tick this plan _(date · commit)_ and **archive** it in `maintainers/plans/archived/`
  ([[plan-done-equals-archived]]). Verify existing ≥ 3.0.0 brains pick up `import` via `update-engine`.
- [ ] **11. Announce** — the follow-up post (pre-3.0.0 migrators) + README link; "first feature shipped on
  the v3 platform" angle.

> Cocher `- [x]` _(date · commit)_ à chaque étape terminée — c'est la mémoire qui survit aux `/clear`.

---

## 🧭 État pour reprise (après `/clear`)

- **Repo** `~/Dev/second-brain-generator`, branche **`import-brain`** (à créer depuis `main`).
- **Discipline** : **TDD** (skill `tdd-discipline`) — baby-steps, fail-first, refactor non-optionnel.
  Le cœur est une **lib pure** (pas un service Hive) → discipline TDD de base, pas l'outside-in diamond.
- **Réutiliser** : `isExampleNote` de `scripts/lib/example-notes.mjs` (guard démos) ; le walk récursif
  comme `findExampleNotes` ; le template de skill `update-engine` (EN + FR overlay) ; le manifest
  (`merge` pour la skill, `replace` pour l'entry).
- **Garde-fous non négociables** (ADR 0019) : vault-only · plan-avant-write + confirm · zéro écrasement
  silencieux · pas les notes d'exemple · reindex après · constitution intouchée · **Kenjaku jamais un
  mot-clé d'invocation**.
- **Ne PAS** : faire un flag installeur `--import` (YAGNI) ; mettre la logique dans la skill (doit être
  dans le `.mjs` testable) ; toucher le serveur MCP `vault-rag` (ADR 0006).
- **Mémoires liées** : [[engine-packaging-phase1-active]], [[update-engine-must-self-carry-libs]],
  [[prefer-deterministic-adr-0009]], [[plan-done-equals-archived]], [[checkbox-plans-convention]],
  [[session-rooted-in-tmp-not-brain]] (l'import s'enchaîne sur le hand-off « nouvelle conv rootée »).

# `templates/` — localized generated artefacts

`--lang` (the brain's note language) also drives the **language of the generated
artefacts**: the constitution (`CLAUDE.md.template`), the deposited skills
(`.claude/skills/**`) and the demo vault (`vault/**`).

## How localization works (the overlay model)

- **The repository root holds the default locale (`en`).** The launcher's own
  tooling (its RAG self-test, `verify-rag`, `demo`, the eval-set) runs against
  these root artefacts — `rag/src/lib/config.ts` resolves `VAULT_DIR` to
  `<root>/vault`. Keeping the default at the root is what lets the launcher
  self-test without knowing about locales.

- **`templates/<locale>/` holds each *additional* locale**, mirroring the
  brain-relative paths. For example:

  ```
  templates/fr/CLAUDE.md.template
  templates/fr/.claude/skills/coach/SKILL.md
  templates/fr/vault/topics/flemmr.md
  ```

- **At install time** the installer:
  1. bulk-copies the tracked launcher files into the brain (`templates/` is
     excluded — see `filterCopyable` in `scripts/lib/tracked-files.mjs`), so the
     brain starts with the root/default (`en`) artefacts;
  2. resolves the requested locale with `resolveLocale(language)`
     (`scripts/lib/locale.mjs`);
  3. picks the locale dir to overlay with `chooseLocale(requested, available)` —
     the requested locale if present, else `en` if a `templates/en/` exists,
     else `null` (keep the root default);
  4. if a locale was chosen, overlays `templates/<locale>/**` onto the brain at
     brain-relative paths.

## Adding a locale

Create `templates/<locale>/` and mirror the brain-relative path of each artefact
you want localized. Register the language aliases in
`scripts/lib/locale.mjs` (`resolveLocale`). Tests stay **language-agnostic**:
assert structure (frontmatter keys, file names, exit codes, stable markers),
never a translated sentence.

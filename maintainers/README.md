# `maintainers/` — contexte de dev du générateur

> ⚠️ **Versionné, mais JAMAIS livré à l'utilisateur final.**
> Ce dossier voyage entre les machines du **mainteneur** (sync git entre laptops) et reste
> visible dans le launcher cloné. Mais il est **exclu de la copie bootstrap** : il n'atterrit
> **jamais** dans un cerveau généré. L'exclusion est codée dans
> [`scripts/lib/tracked-files.mjs`](../scripts/lib/tracked-files.mjs) (`DEV_ONLY_DIRS`), testée
> dans `tracked-files.test.mjs`. Il n'est pas non plus auto-chargé par Claude (seuls `CLAUDE.md`
> et les skills le sont).
>
> **Donc :** tout ce qui ne doit servir qu'au développement du générateur — et surtout pas
> polluer le cerveau d'un utilisateur — va ici. Rien de secret pour autant (pas de clés : voir
> `.gitignore`).

## Contenu

- **`decisions/`** — les décisions d'architecture (ADR) : le *pourquoi*, pérenne.
  - [`0001-launcher-vs-brain.md`](decisions/0001-launcher-vs-brain.md) — launcher réutilisable
    en lecture seule vs cerveau créé ailleurs ; renommage `starter` → `generator`.
- **`plans/`** — plans d'implémentation, avec un `STATUT` en tête (LIVRÉ / EN COURS / ABANDONNÉ).
  - [`claude-driven-install.md`](plans/claude-driven-install.md) — onboarding « installe mon
    second cerveau » piloté par Claude. **STATUT : LIVRÉ.**
  - [`launcher-vs-brain.md`](plans/launcher-vs-brain.md) — bascule du modèle d'install. **STATUT : LIVRÉ.**
  - [`translate-to-english.md`](plans/translate-to-english.md) — traduction complète FR → EN du
    générateur (docs, skills, code, démo), tests rendus agnostiques de la langue, sur branche
    dédiée. **STATUT : À FAIRE.**

## Historique

Ce dossier remplace l'ancienne « mémoire » Claude (qui vivait hors du repo, dans
`~/.claude/projects/…/memory/`, liée au chemin absolu de la machine → non portable entre laptops).
Le contenu durable a été rapatrié ici pour être **versionné et synchronisable**. Les règles de
travail réutilisables, elles, ont rejoint leur foyer naturel :
- discipline de test (asserts non fragiles sur des strings) → skill `tdd-discipline` ;
- exception de neutralité (nom de Thomas Pierrain) → [`DEVELOPING.md`](../DEVELOPING.md).

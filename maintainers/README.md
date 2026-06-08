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
  - [`0002-installateur-maison-vs-plugin.md`](decisions/0002-installateur-maison-vs-plugin.md) —
    installateur/générateur maison (pensé non-tech, guidé en chat) plutôt qu'un plugin Claude /
    marketplace.
  - [`0003-pas-upgrade-capacites-cerveaux.md`](decisions/0003-pas-upgrade-capacites-cerveaux.md) —
    pas (encore) d'upgradabilité des capacités : complexité disproportionnée + itération locale
    simple (skills maison) ; à rouvrir sur feedbacks.
  - [`0004-claude-only-pour-l-instant.md`](decisions/0004-claude-only-pour-l-instant.md) —
    Claude-only pour l'instant (vault + RAG déjà agnostiques) ; cross-platform non exclu, sur
    feedbacks, avec la couche pilotage à adapter.
  - [`0005-support-onglet-code-desktop.md`](decisions/0005-support-onglet-code-desktop.md) —
    l'onglet Code (app desktop Claude) devient une cible officielle (= même Claude Code, pas du
    cross-IA). **Révisé 2026-06-06** : on renverse le gate d'install → **confiance à Claude pour
    installer + échec bruyant** (panne A non prouvée ; on attrape au lieu de prévenir).
  - [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md) —
    la surface MCP du RAG est un contrat public stable (port API) ; embedder/vector store/chunking
    = adaptateurs interchangeables (SPI). Permet de sortir de Gemini (→ local) sans casser les
    cerveaux. Complémentaire de 0003 ; généralisation de `vault_stats` actée.
- **`plans/`** — plans d'implémentation, avec un `STATUT` en tête (LIVRÉ / EN COURS / ABANDONNÉ).
  Les plans **livrés** sont déplacés dans **`plans/archived/`** ; seuls les plans encore **ouverts**
  restent à la racine de `plans/`.
  - [`etude-rag-local-criteres-et-veille.md`](plans/etude-rag-local-criteres-et-veille.md) — **étude/veille** :
    offrir un **éventail d'alternatives RAG selon les besoins/contraintes** des gens (privacy, budget,
    puissance machine, OS, friction d'install). Profils bureautique / grosse machine / cloud-avec-clé +
    veille embedders locaux (bge-m3 / nomic / Qwen3), LightRAG/GraphRAG, Contextual Retrieval,
    eval-first. **STATUT : 🔬 ÉTUDE — rien d'acté.** *(alimente le plan ci-dessous)*
  - [`embedder-spi.md`](plans/embedder-spi.md) — abstraire l'embedder du RAG derrière un port SPI
    `Embedder` + estampiller l'index d'une identité (provider/modèle/dimension) pour rendre un swap
    **sûr** (confirm-gate en langage naturel, jamais de réindex silencieux). Concrétise l'ADR 0006 +
    son addendum. **STATUT : À FAIRE.** *(garde Gemini comme seule impl ; 2ᵉ embedder = discussion à venir)*
  - [`translate-to-english.md`](plans/translate-to-english.md) — traduction complète FR → EN du
    générateur (docs, skills, code, démo), tests rendus agnostiques de la langue, sur branche
    dédiée. **STATUT : À FAIRE — repoussé en TOUTE FIN.**
  - **`plans/archived/`** — plans livrés (archive, conservés pour le détail des étapes) :
    - [`onglet-code-desktop.md`](plans/archived/onglet-code-desktop.md) — fiabiliser l'install/usage
      depuis l'**app desktop Claude (onglet Code)** : confiance à Claude + échec bruyant + démo
      sourcée. **STATUT : FAIT.** (ADR 0005 + 0006)
    - [`claude-driven-install.md`](plans/archived/claude-driven-install.md) — onboarding « installe
      mon second cerveau » piloté par Claude. **STATUT : LIVRÉ.**
    - [`launcher-vs-brain.md`](plans/archived/launcher-vs-brain.md) — bascule du modèle d'install. **STATUT : LIVRÉ.**
    - [`harden-run-node-smoke-and-coverage.md`](plans/archived/harden-run-node-smoke-and-coverage.md) —
      durcir le wrapper `run-node` (smoke-test en PATH appauvri, couverture élargie). **STATUT : LIVRÉ.**
    - [`fix-hooks-node-nvm.md`](plans/archived/fix-hooks-node-nvm.md) — hooks muets quand `node` vient
      de nvm (résolu par `run-node`). **STATUT : LIVRÉ.**
    - [`rename-bootstrap-to-installer.md`](plans/archived/rename-bootstrap-to-installer.md) — renommage
      `bootstrap` → `installer`. **STATUT : LIVRÉ.**

## Historique

Ce dossier remplace l'ancienne « mémoire » Claude (qui vivait hors du repo, dans
`~/.claude/projects/…/memory/`, liée au chemin absolu de la machine → non portable entre laptops).
Le contenu durable a été rapatrié ici pour être **versionné et synchronisable**. Les règles de
travail réutilisables, elles, ont rejoint leur foyer naturel :
- discipline de test (asserts non fragiles sur des strings) → skill `tdd-discipline` ;
- exception de neutralité (nom de Thomas Pierrain) → [`DEVELOPING.md`](../DEVELOPING.md).

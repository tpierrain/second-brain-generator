# `maintainers/` — contexte de dev du générateur

> ⚠️ **Versionné, mais JAMAIS livré à l'utilisateur final.**
> Ce dossier voyage entre les machines du **mainteneur** (sync git entre laptops) et reste
> visible dans le launcher cloné. Mais il est **exclu de la copie bootstrap** : il n'atterrit
> **jamais** dans un cerveau généré. L'exclusion est codée dans
> [`scripts/lib/tracked-files.mjs`](../scripts/lib/tracked-files.mjs) (`DEV_ONLY_PREFIXES` — qui
> exclut aussi l'**outillage d'eval-set**, cf. ci-dessous), testée dans `tracked-files.test.mjs`.
> Il n'est pas non plus auto-chargé par Claude (seuls `CLAUDE.md` et les skills le sont).
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
  - [`0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md) —
    trois choix d'embedder (Gemini natif **gardé** / **compatible-OpenAI** à URL configurable, qui
    couvre OpenAI·Azure·passerelle entreprise·Mistral·Ollama / **local**), ~2 impls à coder ; échelle
    de confidentialité par fournisseur ; au swap la base reste mais les vecteurs non (réindex).
    Concrétise 0006, ouvre la « discussion 2ᵉ embedder » du plan SPI. **Défaut à l'install = ouvert.**
  - [`0008-lightrag-et-graph-rag-differes.md`](decisions/0008-lightrag-et-graph-rag-differes.md) —
    **LightRAG / graph-RAG différé** (intéressant mais pas maintenant) : c'est un **autre paradigme**
    (LLM **par chunk** à l'indexation → coût + fuite de contenu, casse la cible non-dev/privacy), pas
    un adaptateur d'embedder → **orthogonal** au chantier en cours. Réservé à l'**Étape 7**
    (grosse machine, opt-in, conditionnel), **à départager par eval-set FR** ; **E2GraphRAG préféré**
    sur machine modeste. Décision de séquencement, pas un rejet.
- **[`eval-set.md`](eval-set.md)** — 🧪 **outil dev** : l'eval-set RAG (Étape 2 du plan embedder).
  Mesure la qualité de récupération de l'embedder courant en un **score reproductible** (juge =
  Claude via `claude -p`), sur le vault Flemmr → **baseline Gemini** à rejouer sur les embedders
  locaux (Étape 4). `node scripts/run-eval.mjs`. **Dev-only** (exclu du cerveau généré).
- **`plans/`** — plans d'implémentation, avec un `STATUT` en tête (LIVRÉ / EN COURS / ABANDONNÉ).
  Les plans **livrés** sont déplacés dans **`plans/archived/`** ; seuls les plans encore **ouverts**
  restent à la racine de `plans/`.
  - [`rag-embedder-plan-action.md`](plans/rag-embedder-plan-action.md) — **🗺️ plan d'action**
    qui **orchestre** le chantier embedder en **étapes autoporteuses** (port → eval-set → adaptateur
    compatible-OpenAI → mesure → onboarding → leviers conditionnels), avec **tableau d'avancement**
    pour piloter session par session (un `/clear` entre chaque). Couche au-dessus du plan SPI + étude
    + ADR 0007. **STATUT : 🗺️ PLAN D'ACTION.**
  - [`etude-rag-local-criteres-et-veille.md`](plans/etude-rag-local-criteres-et-veille.md) — **étude/veille** :
    offrir un **éventail d'alternatives RAG selon les besoins/contraintes** des gens (privacy, budget,
    puissance machine, OS, friction d'install). Profils bureautique / grosse machine / endpoint API +
    veille **rafraîchie** (EmbeddingGemma, bge-m3, Qwen3, E2GraphRAG…), **échelle de confidentialité
    par fournisseur**, vulgarisation « embedder ≠ LLM de chat », eval-first. **STATUT : 🔬 ÉTUDE — rien
    d'acté.** *(alimente le plan SPI + l'ADR 0007)*
  - [`translate-to-english.md`](plans/translate-to-english.md) — traduction complète FR → EN du
    générateur (docs, skills, code, démo), tests rendus agnostiques de la langue, sur branche
    dédiée. **STATUT : À FAIRE — repoussé en TOUTE FIN.**
  - **`plans/archived/`** — plans livrés (archive, conservés pour le détail des étapes) :
    - [`embedder-spi.md`](plans/archived/embedder-spi.md) — abstraire l'embedder du RAG derrière un
      port SPI `Embedder` + estampiller l'index d'une identité (provider/modèle/dimension) pour rendre
      un swap **sûr** (confirm-gate en langage naturel, jamais de réindex silencieux). Concrétise
      l'ADR 0006 + son addendum. **STATUT : ✅ LIVRÉ** (Étape 1 du plan d'action ; garde Gemini comme
      seule impl + FakeEmbedder de test ; 2ᵉ embedder réel = Étape 3).
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
- **`retrospectives/`** — 📝 **rétros orientées *takeaways*** : le **récit** d'une session marquante
  (la question de départ, le cheminement enquête→mesure→correctif, les leçons transférables). À
  distinguer des ADR (le *pourquoi* d'une décision) et des plans (le *quoi/comment*) : ici c'est la
  **matière à article**, le retour d'expérience. **Convention** : un fichier par session,
  `retrospectives/takeaways-<sujet>-<AAAA-MM-JJ>.md` ; titre accrocheur + une ou plusieurs leçons en
  **« Takeaway »** numérotés + une section **méta-leçons transférables**. Dev-only (préfixe
  `maintainers/`), jamais copié dans un cerveau généré.
  - [`takeaways-embedder-partage-2026-06-09.md`](retrospectives/takeaways-embedder-partage-2026-06-09.md) —
    « Quand le *petit raffinement* d'archi révèle un ×50 sur la latence » : la question d'archi posée
    **avant** câblage, le ×50 dû à `createEmbedder()` par requête, le correctif (session ONNX chaude
    partagée), 7 méta-leçons (port ≠ garantie de perf ; amplitude du symptôme ≠ de la cause ; pondérer
    le pire cas par sa fréquence…). *(Étape 4-quater du plan embedder.)*
  - [`takeaways-install-embedder-choix-2026-06-09.md`](retrospectives/takeaways-install-embedder-choix-2026-06-09.md) —
    « Retirer une obligation a rendu l'install *mieux* vérifiée » : dé-forcer la clé Gemini → l'option
    tout-local s'auto-prouve (canari sans clé) ; le noyau de décision pur/testé sous une coquille I/O ;
    un gate unique (`geminiKeyRequired`) qui débusque un bug en périphérie (le hook de statut) ; un
    nouveau défaut livré par **détection** (pas par flip global). 6 méta-leçons. *(Étape 5 du plan embedder.)*

- **`benchmarks/`** — 📊 **mesures reproductibles** (volumes, débits, RAM, latences) : les chiffres
  bruts d'un run, avec protocole rejouable. À distinguer des rétros (le récit/les leçons).
  - [`stress-test-in-process-vault-reel-2026-06-09.md`](benchmarks/stress-test-in-process-vault-reel-2026-06-09.md) —
    1ᵉʳ stress-test de l'embedder **tout-local in-process** sur un **vrai vault dense** (271 notes /
    2 764 chunks) : **~5 min 48 s**, **pic RAM ~2,9 Go** (plafonnement de lot tenu, vs 8,5 Go sans),
    **0 erreur**, qualité retrieval **3/3** (fait isolé / nuance / multi-hop). Protocole rejouable +
    pièges de mesure. *(Valide le défaut tout-local hors démo.)*

## Historique

Ce dossier remplace l'ancienne « mémoire » Claude (qui vivait hors du repo, dans
`~/.claude/projects/…/memory/`, liée au chemin absolu de la machine → non portable entre laptops).
Le contenu durable a été rapatrié ici pour être **versionné et synchronisable**. Les règles de
travail réutilisables, elles, ont rejoint leur foyer naturel :
- discipline de test (asserts non fragiles sur des strings) → skill `tdd-discipline` ;
- exception de neutralité (nom de Thomas Pierrain) → [`DEVELOPING.md`](../DEVELOPING.md).

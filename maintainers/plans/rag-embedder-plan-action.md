<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🗺️ PLAN D'ACTION (créé 2026-06-08) — orchestration, exécution par étapes. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan d'action — RAG : rendre l'embedder swappable (3 adaptateurs) + mesurer + onboarder

> **STATUT : 🗺️ PLAN D'ACTION** (créé le 2026-06-08).
> **Couche d'orchestration** au-dessus des docs déjà écrites — il ne les remplace pas, il les
> **séquence** :
> - le *pourquoi* → ADR [`../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md)
>   (+ [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)) ;
> - le *comment* du port → plan [`embedder-spi.md`](embedder-spi.md) ;
> - le *quoi mesurer* → étude [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md).

## Comment utiliser ce plan (lecture obligatoire)

- **Une étape = une session.** Fais un **`/clear` entre chaque étape**. Chaque étape est **autoporteuse** :
  elle dit quels fichiers charger, quoi faire, et comment savoir que c'est fini.
- **Au début de chaque session**, dis à Claude : *« On attaque l'Étape N du plan
  `maintainers/plans/rag-embedder-plan-action.md` »*. Claude lit **ce fichier** + les fichiers cités
  par l'étape, et **rien d'autre n'est nécessaire**.
- **À la fin de chaque étape**, Claude **met à jour le tableau d'avancement ci-dessous** (statut +
  date + commit) — c'est la **mémoire qui survit aux `/clear`**.
- **Discipline de dev** (étapes qui touchent au code) : **TDD obligatoire** — skill `tdd-discipline`,
  et `outside-in-diamond-tdd` pour le périmètre back-end/Hive. Commits **manuels**, conventionnels,
  co-author Claude. Baby-steps, fail-first, refactor non optionnel.
- **Garde-fou de séquence** : ne PAS coder un 2ᵉ adaptateur (Étape 3) **avant** que le port soit en
  place (Étape 1). Ne PAS lancer les leviers qualité (Étapes 6-7) **avant** que la mesure (Étape 4)
  prouve un besoin.

## Tableau d'avancement (à tenir à jour entre les `/clear`)

| Étape | Titre | Type | Dépend de | Statut | Fait le / commit |
|---|---|---|---|---|---|
| **D1** | Trancher le défaut à l'install | 🧭 décision (Thomas) | — | ⬜ à décider | |
| **1** | Port `Embedder` + index sûr (estampille + confirm-gate) | 🧪 code TDD | — | ⬜ à faire | |
| **2** | Eval-set local (juge = Claude) | 🧪 code | — | ⬜ à faire | |
| **3** | Adaptateur compatible-OpenAI (URL+clé) | 🧪 code TDD | 1 | ⬜ à faire | |
| **4** | Brancher local (EmbeddingGemma/bge-m3) + **MESURER** | 📊 mesure | 1,2,3 | ⬜ à faire | |
| **5** | Onboarding / install (choix d'embedder + pédagogie) | 🧪 code | D1, 3 | ⬜ à faire | |
| **6** | Reranker local *(conditionnel)* | 🧪 code | 4 | ⬜ si plafond | |
| **7** | Profil grosse machine *(conditionnel)* | 🧪 code | 4 | ⬜ si plafond | |

Légende statut : ⬜ à faire · 🚧 en cours · ✅ fait · ⏭️ sauté (justifier).

---

## Décision D1 — Trancher le défaut d'embedder à l'installation 🧭

> **Type :** décision **produit/UX de Thomas** (pas de code). **Peut se faire à tout moment, mais
> AVANT l'Étape 5.** Ne bloque pas les Étapes 1-4.

- **Charger :** ADR 0007 §« Questions ouvertes » (point 1) ; `CLAUDE.md` du repo (philosophie d'install
  « toujours générique, le moins de questions possible »).
- **La question :** quel embedder par défaut à l'install ? Trois pistes :
  - **A** — défaut unique simple (la clé Gemini d'aujourd'hui) + swap via `.env` après coup.
  - **B** — A + une **mini-question** seulement pour le cas entreprise (« OpenAI/Azure imposé ? »).
  - **C** — choix explicite à 3 dès l'install (plus clair, plus de friction).
  - *(piste bonus à débattre : tout-local par défaut — zéro clé/cloud, mais exige Ollama installé.)*
- **Done :** la décision est **actée** (un court addendum à l'ADR 0007, ou un nouvel ADR si ça le
  mérite), avec son *pourquoi*. Le tableau d'avancement est mis à jour.

---

## Étape 1 — Le port `Embedder` + un index sûr face au swap 🧪

> **L'instrument fondateur.** Sans lui, rien n'est swappable proprement. **Garde Gemini comme seule
> impl réelle** (+ éventuel `FakeEmbedder` de test). **N'introduit AUCUN 2ᵉ adaptateur réel.**

- **Pré-requis :** aucun (c'est la base).
- **Charger :** plan [`embedder-spi.md`](embedder-spi.md) **en entier** (il est autoporteur) + les
  fichiers qu'il cite (`rag/src/lib/embedder.ts`, `config.ts`, `vector-store.ts`, `index-manager.ts`,
  `tools/search-vault.ts`, `index.ts`, `tools/reindex.ts`, `embedder.test.ts`).
- **Faire :** exécuter la carte de refactor TDD du plan (`embedder-spi.md` §5), dans l'ordre :
  estampille round-trip → garde d'identité → extraire le port → injecter chez les 2 consommateurs →
  point de sélection unique `createEmbedder()` → (option) `FakeEmbedder`.
- **Done :** `npm test` (dossier `rag/`) vert ; le port `Embedder` existe ; l'index est estampillé
  (provider/modèle/dimension) ; un swap d'identité déclenche le **signal « index périmé »** +
  confirm-gate (pas de résultats faux) ; le contrat MCP n'a **pas** bougé. Commits conventionnels par
  baby-step.
- **Au sortir :** mettre à jour le tableau ; déplacer `embedder-spi.md` vers `plans/archived/` quand
  c'est livré (cf. convention `maintainers/README.md`).

---

## Étape 2 — L'eval-set local (juge = Claude) 🧪

> **Le levier qui transforme « risqué » en « mesuré ».** Petit code, valeur énorme. Indépendant de
> l'Étape 1 (peut se faire avant/en parallèle), mais **indispensable avant l'Étape 4**.

- **Pré-requis :** aucun. *(Idéalement le port d'Étape 1 est là, mais pas obligatoire pour bâtir
  l'eval-set lui-même.)*
- **Charger :** étude [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md)
  §6 ; `scripts/verify-rag.mjs` (le canari « Mollecuisse » = la graine d'eval déjà là).
- **Faire :** constituer **15-20 questions → réponse/passages attendus** sur un **vault représentatif**
  (le vrai cerveau de Thomas ou un échantillon réaliste, riche en entités/relations). Script local
  façon `verify-rag` qui, pour chaque question : lance la recherche, et fait **juger la pertinence par
  Claude** (LLM-as-judge ; usage occasionnel = acceptable). Sortie = un **score chiffré** reproductible.
- **Done :** un script qui produit un score d'eval **reproductible** sur l'embedder courant (Gemini),
  servant de **baseline**. Documenté (comment l'ajouter/relancer). Commit conventionnel.
- **Garde-fou :** pas d'infra lourde (LangFuse & co) — un script local donne 90 % de la valeur (étude §6).

---

## Étape 3 — L'adaptateur compatible-OpenAI (URL + clé configurables) 🧪

> **L'impl au plus fort levier** (ADR 0007 §3) : un seul adaptateur → OpenAI, Azure, passerelle
> entreprise, Mistral, **et le local via Ollama** (URL `localhost`). C'est la « 2ᵉ impl » dont la
> *discussion préalable* (plan `embedder-spi.md` §0.2) a été tranchée par l'ADR 0007.

- **Pré-requis :** **Étape 1 livrée** (le port existe).
- **Charger :** ADR 0007 (§1 schéma, §2 « garder Gemini natif », §3 enveloppe-vs-lettre) ; plan
  `embedder-spi.md` §2 (signature du port, tableau intention→dialecte) ; `rag/src/lib/config.ts`
  (`createEmbedder()`, point de sélection unique).
- **Faire (TDD) :** implémenter `OpenAiCompatibleEmbedder implements Embedder` — envoie `{model, input}`
  sur `<baseURL>/embeddings`, lit `data[].embedding` ; `identity` = provider/model/dimension ;
  `embedDocuments`/`embedQuery` (le « taskType » n'existe pas côté OpenAI → traités pareil). Le brancher
  dans `createEmbedder()` (le `switch` de sélection, p. ex. via `EMBEDDING_PROVIDER` + `EMBEDDING_BASE_URL`
  + clé). **Ne touche ni au port ni au contrat MCP.**
- **Done :** `npm test` vert ; on peut pointer l'embedder sur un endpoint compatible-OpenAI **et** sur
  un Ollama local (`http://localhost:11434/v1`) via le `.env`, sans toucher au harnais. L'estampille
  reflète le nouveau provider/modèle → swap = confirm-gate (Étape 1). Commits conventionnels.

---

## Étape 4 — Brancher le local + MESURER vs Gemini 📊

> **La réponse chiffrée à Dimitry** + le choix du défaut « bureautique ». On ne tranche **que** par la
> mesure (toute la littérature qualité est cloud+anglais — étude §3/§5).

- **Pré-requis :** **Étapes 1, 2, 3 livrées**.
- **Charger :** étude §3 (candidats : **EmbeddingGemma**, **bge-m3** ; footprint §1.3) ; le script
  d'eval (Étape 2).
- **Faire :** via Ollama + l'adaptateur compatible-OpenAI (Étape 3), brancher **EmbeddingGemma** et
  **bge-m3**, ré-indexer un vault représentatif, et **lancer l'eval-set (Étape 2)** sur chacun, **vs
  Gemini** (baseline). Comparer qualité FR **et** footprint/latence réels (Mac/PC).
- **Done :** un **tableau de résultats chiffrés** (Gemini vs EmbeddingGemma vs bge-m3) sur le vrai
  corpus FR → **décision du défaut bureautique** consignée (addendum étude/ADR). Réponse chiffrée à
  Dimitry rédigée. Tableau d'avancement à jour.
- **Sortie conditionnelle :** si un embedder local **égale/approche** Gemini → on tient le défaut
  gratuit+privé. Si **plafond** de qualité constaté → Étapes 6/7 deviennent pertinentes.

---

## Étape 5 — Onboarding / install : le choix d'embedder, rendu limpide 🧪

> Aujourd'hui l'install **force** une clé Gemini (`installer.mjs`, `scripts/verify-rag.mjs`,
> `gemini-key.mjs`, `.env.example`, amorce `CLAUDE.md` étape 4). Cette étape adapte le flux selon la
> **Décision D1**, et **capitalise sur les artefacts pédagogiques** (exigence ADR 0007).

- **Pré-requis :** **Décision D1 actée** + **Étape 3 livrée**.
- **Charger :** Décision D1 (résultat) ; ADR 0007 §« Exigence pédagogique » ; étude §1.3 (embedder≠LLM),
  §privacy (échelle), §2 (réutilisable-au-swap) ; mémoire `rag-adapters-pedagogy-requirement` ; les
  fichiers d'onboarding listés ci-dessus ; le hors-scope du plan `embedder-spi.md` §7 (ce qui était
  reporté à « quand une vraie 2ᵉ impl arrive » = maintenant).
- **Faire :** implémenter le flux décidé en D1 (A/B/C). Si un embedder **local sans clé** est possible,
  ne plus *forcer* la clé Gemini. **Réutiliser les tableaux pédagogiques** (échelle de confidentialité,
  embedder≠LLM, réutilisable-au-swap) là où l'utilisateur rencontre le choix — toujours « tableau +
  verdict en une phrase, zéro jargon ».
- **Done :** un non-dev peut installer avec le défaut D1 sans friction ; le choix (s'il y en a un) est
  expliqué clairement ; `verify-rag` passe avec l'embedder retenu. Commits conventionnels.

---

## Étape 6 — Reranker local *(conditionnel)* 🧪

> **Seulement si l'Étape 4 montre un plafond.** Le « meilleur ratio qualité/coût » est une **hypothèse
> NON prouvée en local/FR** (étude §5) → à **mesurer**, pas à supposer.

- **Pré-requis :** Étape 4 livrée **et** plafond de qualité constaté.
- **Charger :** étude §5 (rerankers : `bge-reranker-v2-m3`, `Qwen3-Reranker`) ; le script d'eval.
- **Faire (TDD) :** ajouter une étape de reranking local **après** la recherche dense, derrière une
  abstraction propre (même esprit que le port `Embedder`). **Mesurer le gain** sur l'eval-set.
- **Done :** gain **chiffré** (ou absence de gain → on n'embarque pas). Décision consignée.

---

## Étape 7 — Profil grosse machine *(conditionnel)* 🧪

> **Seulement si l'Étape 4 prouve un plafond** que le reranker ne lève pas — en assumant le coût machine.

- **Pré-requis :** Étapes 4 (+6) livrées et plafond persistant.
- **Charger :** étude §3 (Qwen3 gros / Nemotron-8B), §4 (**E2GraphRAG** — la voie graphe *sans LLM par
  chunk*, à préférer à LightRAG sur machine modeste).
- **Faire :** brancher un embedder « qualité max » (opt-in) et/ou évaluer E2GraphRAG ; **mesurer** vs le
  défaut bureautique. Réserver au profil grosse machine (pas le défaut — critères 1-4 de l'étude).
- **Done :** profil grosse machine documenté + mesuré, **opt-in**, sans dégrader le défaut.

---

## Rappel des invariants (à ne jamais enfreindre)

- **Le contrat MCP ne bouge pas** (ADR 0006) — embedder/reranker/store sont du SPI interchangeable.
- **Swap d'embedder = confirm-gate, jamais de réindex silencieux** (ADR 0006 addendum) ; estampille sur
  **provider+modèle+dimension** (pas la seule dimension — c'est un piège).
- **On garde Gemini natif** (taskType) — on ne le remplace pas par du compatible-OpenAI (ADR 0007 §2).
- **On mesure avant de choisir** (eval-set), et avant tout levier qualité.
- **Le launcher reste générique** ; pas de sur-ingénierie contre un risque non prouvé (façon de bosser
  de Thomas).

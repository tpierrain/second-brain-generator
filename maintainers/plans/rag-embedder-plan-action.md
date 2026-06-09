<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🗺️ PLAN D'ACTION (créé 2026-06-08) — orchestration, exécution par étapes. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan d'action — RAG : rendre l'embedder swappable (3 adaptateurs) + mesurer + onboarder

> **STATUT : 🗺️ PLAN D'ACTION** (créé le 2026-06-08).
> **Couche d'orchestration** au-dessus des docs déjà écrites — il ne les remplace pas, il les
> **séquence** :
> - le *pourquoi* → ADR [`../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md)
>   (+ [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)) ;
> - le *comment* du port → plan [`embedder-spi.md`](archived/embedder-spi.md) **(✅ LIVRÉ — archivé)** ;
> - le *quoi mesurer* → étude [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md).

## Comment utiliser ce plan (lecture obligatoire)

- **Une étape = une session.** Fais un **`/clear` entre chaque étape**. Chaque étape est **autoporteuse** :
  elle dit quels fichiers charger, quoi faire, et comment savoir que c'est fini.
- **Au début de chaque session**, dis à Claude : *« On attaque l'Étape N du plan
  `maintainers/plans/rag-embedder-plan-action.md` »*. Claude lit **ce fichier** + les fichiers cités
  par l'étape, et **rien d'autre n'est nécessaire**.
- **Pendant** une étape, Claude **coche les sous-cases au fil de l'eau** (tu peux suivre en direct dans
  ce fichier). **À la fin**, il coche la case de l'étape + note _(date · commit)_ — c'est la **mémoire
  qui survit aux `/clear`**.
- **Discipline de dev** (étapes qui touchent au code) : **TDD obligatoire** — skill `tdd-discipline`,
  et `outside-in-diamond-tdd` pour le périmètre back-end/Hive. Commits **manuels**, conventionnels,
  co-author Claude. Baby-steps, fail-first, refactor non optionnel.
- **Garde-fou de séquence** : ne PAS coder un 2ᵉ adaptateur (Étape 3) **avant** que le port soit en
  place (Étape 1). Ne PAS lancer les leviers qualité (Étapes 6-7) **avant** que la mesure (Étape 4)
  prouve un besoin.

## Suivi — cases à cocher (monitorable en direct dans ce fichier)

> Coche au fil de l'eau. Les **sous-cases** permettent de suivre la progression *pendant* qu'une étape
> tourne (surtout les baby-steps TDD). Quand une étape est finie : cocher sa case + noter _(date · commit)_.

- [x] **D1 — Trancher le défaut à l'install** 🧭 *(décision Thomas, **APRÈS les Étapes 4 ET 4-bis** ; dépend de : 4, 4-bis)* — **TRANCHÉ : option C (choix explicite à 3), reco ADAPTATIVE (16 Go+ → in-process ⭐ ; ≤ 8 Go ou Mac Intel → clé d'API ⭐)** _(2026-06-09)_
  - [x] Tests croisés des adaptateurs **ensemble** (Thomas + Claude), sur la base des mesures (Étapes 4 + 4-bis) _(2026-06-09)_
  - [x] Décider le défaut — **in-process « Gemma inside »** retenu comme **défaut recommandé** (viabilité prouvée Étape 4-bis), présenté dans un **choix explicite à 3** (option C) : 1=in-process ⭐ / 2=clé d'API (Gemini ou endpoint entreprise) / 3=Ollama (avancé) ; garde-fou Mac Intel (option 1 masquée) _(2026-06-09)_
  - [x] Acter (addendum ADR 0007) avec le *pourquoi* + le **cadrage clé gratuite/payante** obligatoire pour l'option 2 → [`../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md#addendum-d1-2026-06-09--défaut-dembedder-à-linstallation--tranché) _(2026-06-09)_
- [x] **Étape 1 — Port `Embedder` + index sûr** 🧪 TDD *(dépend de : —)* _(2026-06-08 · 2ac9698→bf2ead8)_
  - [x] Estampille `index_meta` — round-trip (écrit à l'indexation, relu) _(2026-06-08 · 2ac9698)_
  - [x] Garde d'identité — identité divergente/absente → signal « index périmé », pas de résultats faux _(2026-06-08 · 7e9fdec)_
  - [x] Extraire le port `Embedder` ; `GeminiEmbedder` implémente l'existant (comportement inchangé) _(2026-06-08 · 9d3b869)_
  - [x] Injecter le port chez les 2 consommateurs (`index-manager` stampe ; `search-vault`/`index.ts` consulte le garde) _(2026-06-08 · 99abe61, 7fc678b)_
  - [x] Point de sélection unique `createEmbedder()` (dans `embedder.ts`, pas `config.ts` : cycle d'import) — sans `switch` multi-provider _(2026-06-08 · a49f861)_
  - [x] *(option)* `FakeEmbedder` déterministe + test _(2026-06-08 · bf2ead8)_
  - [x] `npm test` (dossier `rag/`) vert (91/91) ; `embedder-spi.md` archivé → `plans/archived/`
- [x] **Étape 2 — Eval-set local (juge = Claude)** 🧪 *(dépend de : —)* — **instrument + baseline Gemini 80 % (8/10) LIVRÉS** _(2026-06-09 · e64f2bb, 0448c03)_
  - [x] Vault représentatif choisi : **vault d'exemple Flemmr** (inventé → public-safe, versionné, **rejouable par tous**). Corpus plus riche = reporté à l'Étape 4 (décidé avec Thomas) _(2026-06-09)_
  - [x] Questions écrites : **10** (corpus Flemmr petit → ~10 plutôt que 15-20 ; mix faciles + grep-résistantes ; 1ʳᵉ = canari `demo.mjs`) _(2026-06-09 · e64f2bb)_
  - [x] Script « recherche + jugement Claude » → score reproductible : `scripts/run-eval.mjs` + cœur pur testé ; juge `claude -p` **validé end-to-end** (PASS sur passage pertinent, FAIL sur hors-sujet) ; **dev-only** (exclu du cerveau) ; documenté [`../eval-set.md`](../eval-set.md) _(2026-06-09 · e64f2bb, 0448c03)_
  - [x] **Baseline Gemini mesurée et consignée** ✅ — **80 % (8/10)** sur le vault Flemmr, consignée dans [`../eval-set.md`](../eval-set.md#baseline-gemini--80-810-2026-06-09). Le blocage `claude -p` exit 1 était bien **environnemental** (quota/usage Claude de la veille, réinitialisé) — pas un bug code : `claude -p` refonctionne, l'eval s'est déroulée de bout en bout. Les 2 ratés sont de **vrais échecs de récupération** (réponse présente dans le vault, passages insuffisants) → baseline honnête, on ne la gonfle pas _(2026-06-09)_
- [x] **Étape 3 — Adaptateur compatible-OpenAI (URL+clé)** 🧪 TDD *(dépend de : 1)* — **livré, 98/98 vert** _(2026-06-09 · d321365)_
  - [x] `OpenAiCompatibleEmbedder` : `{model,input}` → `data[].embedding` ; `embedDocuments`/`embedQuery` (helper `embed()` partagé ; `fetch` injecté pour tester l'enveloppe sans réseau) _(2026-06-09)_
  - [x] `identity` (provider/model/dimension) renseignée depuis la config — `providerId="openai-compatible"` ; dimension = clé d'invalidation (lue **avant** tout embed car estampillée en amont) _(2026-06-09)_
  - [x] Branché dans `createEmbedder()` via `.env` — fonction de sélection **pure** `selectEmbedder(env)` (testable) ; `EMBEDDING_PROVIDER` + `EMBEDDING_BASE_URL` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL_NAME` + `EMBEDDING_DIMENSION` ; documenté dans `.env.example` _(2026-06-09)_
  - [x] Auth Bearer si clé présente ; **aucun** header `Authorization` si clé vide (local) ; réponse non-ok → **erreur bruyante** (jamais de vecteur vide silencieux dans l'index) _(2026-06-09)_
  - [x] Testé sur un endpoint compatible-OpenAI **et** sur Ollama local (`localhost:11434/v1`) : enveloppe/headers/erreurs/sélection prouvés en tests unitaires (`openai-compatible-embedder.test.ts`, 98/98 vert) **ET smoke live réel fait à l'Étape 4** (Ollama installé via cask, `embeddinggemma`/`bge-m3` pullés, indexation+recherche du vault Flemmr 100 % en local prouvées par l'estampille `index_meta`) _(2026-06-09)_
- [x] **Étape 4 — Brancher local + MESURER vs Gemini** 📊 *(dépend de : 1,2,3)* — **mesuré : local ≥ Gemini sur Flemmr FR (90 %/90 %/80 %), aucun malus qualité** _(2026-06-09 · 2a5f63f)_
  - [x] Brancher EmbeddingGemma (via Ollama + adaptateur n°3) — `embeddinggemma` pullé, 768-dim, score **90 % (9/10)** _(2026-06-09)_
  - [x] Brancher bge-m3 — `bge-m3` pullé, 1024-dim, score **90 % (9/10)** _(2026-06-09)_
  - [x] Ré-indexer le vault représentatif pour chacun — DB purgée + réindex complet par modèle, estampille `index_meta` distincte (preuve anti-fallback) _(2026-06-09)_
  - [x] Lancer l'eval-set sur chacun, vs Gemini (baseline re-mesurée même session = **80 % (8/10)**, reproduit hier) _(2026-06-09)_
  - [x] Tableau de résultats chiffrés (qualité FR + footprint/latence) → consigné [`../eval-set.md`](../eval-set.md#étape-4--résultats-mesurés-local-vs-gemini-2026-06-09) _(2026-06-09)_
  - [~] **Décision du défaut bureautique** : mesure + **reco consignée** (local viable, EmbeddingGemma léger candidat naturel) ; réponse chiffrée à Dimitry rédigée. **Décision finale = D1 (Thomas)** — corpus petit ⇒ départage fin EmbeddingGemma vs bge-m3 à refaire sur corpus riche avant d'acter
- [x] **Étape 4-bis — RAG MCP autonome « Gemma inside » (embedder in-process, SANS serveur)** 🧪 TDD *(dépend de : 1, 4)* — **VIABLE comme défaut : install npm-only Mac+Win, latence tenable, qualité 90 % = Ollama** _(2026-06-09 · 86ea386)_
  - [x] `InProcessEmbedder implements Embedder` via Transformers.js v4 (`@huggingface/transformers@4.2`) — pipeline `feature-extraction`, **EmbeddingGemma-300m-ONNX** (q8), `embedDocuments`/`embedQuery`, pooling moyen + normalisation L2 ; pipeline **injectable** (logique testée **sans** poids) ; **mémoïsé** (chargé une fois) _(2026-06-09)_
  - [x] `identity` = `providerId="transformers-js"` / modèle / 768 ; branché dans `selectEmbedder()` via `EMBEDDING_PROVIDER=in-process` (ni URL ni clé) + `.env.example` ; poids téléchargés+cachés au 1ᵉʳ usage, **échec bruyant nommant le modèle** si DL impossible (jamais de vecteur vide) _(2026-06-09)_
  - [x] **V1 — install cross-OS** : `npm i @huggingface/transformers` → `onnxruntime-node@1.24.3` **embarque** les binaires pré-buildés `win32/x64+arm64`, `darwin/arm64`, `linux/x64+arm64` ; `requirements=[]` partout (seul GPU CUDA Linux distant) → **rien à compiler ni télécharger, offline-friendly Mac+Win**. ⚠️ **Mac Intel (darwin/x64) non couvert** par cette version _(2026-06-09)_
  - [x] **V2 — latence CPU** : téléchargement poids ~28 s **une fois** (caché) ; démarrage à froid poids cachés **675 ms** ; débit à chaud **8–9 ms/texte (~110/s)** sans GPU Metal → tenable (encodage ponctuel) _(2026-06-09)_
  - [x] **V3 — qualité re-mesurée (quantifié)** : eval-set in-process q8 = **90 % (9/10)** = EmbeddingGemma via Ollama, **> Gemini 80 %**. **Parité confirmée, pas supposée.** Découverte : l'écart venait des **prompts de tâche EmbeddingGemma** (q8 brut = 80 % ; q8 + prompts = 90 %), pas de la quantification _(2026-06-09)_
  - [x] Tableau de viabilité + **verdict « VIABLE comme défaut »** consignés [`../eval-set.md`](../eval-set.md#étape-4-bis--viabilité-de-lin-process--gemma-inside--sans-ollama-2026-06-09) → alimente D1. `npm test` **vert (109/109)** ; contrat MCP **inchangé** _(2026-06-09)_
- [x] **Étape 4-ter — Plafonnement de lot d'embedding (durcissement in-process)** 🧪 TDD *(dépend de : 4-bis ; **BLOQUANT pour l'option 1 livrée en Étape 5**)* — **livré : `EMBED_BATCH=4` (sweet-spot mesuré), 111/111 vert, contrat MCP inchangé** _(2026-06-09)_
  - [x] Sous-lots bornés dans **`InProcessEmbedder.embedDocuments`** (constante `EMBED_BATCH` + `batchSize?` configurable) — placé dans l'adaptateur car la contrainte RAM est **spécifique à l'ONNX in-process** (Gemini/OpenAI = réseau) → protège tous les appelants ; `embedQuery` inchangé _(2026-06-09)_
  - [x] Balayage **4/8/16** sur le corpus dense (264 notes) : **contre-intuitif — le petit lot gagne sur les 2 axes** (lot 4 = pic ~3,2 Go in-proc / 5,3 min / 8,5 ch/s ; lot 16 = 5,35 Go / 7,4 min). Qualité inchangée. Constante **figée à 4** ; script réutilisable `rag/scripts/measure-batch.mts` (dev-only, exclu du cerveau) _(2026-06-09)_
  - [x] `npm test` vert (rag 111/111 ; scripts 92/92) ; contrat MCP inchangé ; chiffres + caveat RSS in-proc/OS consignés [`../eval-set.md`](../eval-set.md#balayage-du-plafond-4--8--16-2026-06-09) ; **note pour Étape 5 : pic OS ~3,8-4 Go → seuil D1 à reconsidérer (12 Go voire 8 Go)** _(2026-06-09)_
- [x] **Étape 4-quater — Embedder partagé (mémoïsation process, durcissement in-process)** 🧪 TDD *(dépend de : 4-bis ; **BLOQUANT pour l'option 1 livrée en Étape 5**)* — **livré : `createEmbedder()` mémoïsé → 1 session ONNX chaude partagée, 112/112 vert, contrat MCP inchangé** _(2026-06-09)_
  - [x] **Découverte (sonde `rag/scripts/measure-contention.mts`, dev-only)** : le serveur MCP réindexe DANS son process (auto-reindex démarrage + watcher) → recherche et indexation partagent CPU. Or `search_vault` appelait `createEmbedder()` **à chaque requête** → instance neuve, mémoïsation `private` vide → en in-process : **session ONNX rechargée à chaque recherche (~440 ms au repos)** et **2 sessions concurrentes** (recherche + indexation) sur-réservent les cœurs → **recherche jusqu'à ×50 (25 s !)**. Gemini ne le montrait pas (client gratuit, embed = réseau, zéro CPU local) _(2026-06-09)_
  - [x] **Fix TDD (baby-step) : `createEmbedder()` mémoïse au niveau module** → recherche ET auto-reindex partagent la même instance/session chaude. Provider figé à la 1ʳᵉ sélection (swap = redémarrage Claude Code, déjà le cas) ; clé Gemini toujours lue **paresseusement** à l'embed (coller la clé après coup marche encore) _(2026-06-09)_
  - [x] **Prouvé de bout en bout** via le vrai `createEmbedder()` : recherche au repos **510 → 35 ms (p95)**, recherche pendant indexation de fond **25 429 → 810 ms (p95)**. Le petit lot=4 (4-ter) aère naturellement l'event-loop. `worker_thread` jugé inutile (pas de sur-ingénierie : 0,7 s dans une fenêtre rare = indexation initiale, l'incrémental est sous la seconde) _(2026-06-09)_
- [x] **Étape 5 — Onboarding / install (choix à 3 + reco adaptative)** 🧪 *(dépend de : D1, 3, **4-ter**, **4-quater**)* — **LIVRÉ : flux d'install adaptatif, clé Gemini dé-forcée ; smoke in-process end-to-end (canari sans clé) + verify-rag exit 0** _(2026-06-09 · 7be29f6→4e83c5e)_
  - [x] **Détecter la machine** (`os.totalmem()` + Mac Intel `darwin/x64`) → **reco adaptative** : **seuil figé à 12 Go** (Thomas) → ≥ 12 Go & pas Mac Intel = option 1 ⭐ ; sinon = option 2 ⭐. Logique PURE testée (`scripts/lib/embedder-choice.mjs`, `recommendedEmbedderKey`) _(2026-06-09 · 7be29f6)_
  - [x] **Présenter les 3 options** (ordre confidentialité, ⭐ sur la reco machine) ; **option 1 masquée + renumérotée sur Mac Intel** (`buildEmbedderOptions`) ; option 2 = sous-choix **Gemini OU endpoint compatible-OpenAI** (URL/modèle/dimension/clé) en interactif _(2026-06-09 · 26f6961)_
  - [x] **Option 2 (Gemini)** → cadrage **« gratuit ≠ privé »** affiché **avant** la clé (installeur interactif + amorce) _(2026-06-09 · 26f6961, 4e83c5e)_
  - [x] **Ne plus *forcer* la clé Gemini** : `geminiKeyRequired(env)` gate l'installeur, `verify-rag` et `session-status` ; options 1/3 → `EMBEDDING_PROVIDER` dans `.env`, étape clé sautée ; `--embedder` (non-interactif) sinon reco machine _(2026-06-09 · 4f620c1, d17a6d8, 26f6961)_
  - [x] Réutiliser les tableaux pédagogiques (échelle confidentialité / embedder≠LLM / réutilisable-au-swap) au point de choix (installeur interactif + amorce + SETUP) _(2026-06-09 · 26f6961, 4e83c5e)_
  - [x] `verify-rag` passe avec l'embedder retenu — **prouvé end-to-end en in-process SANS clé** (canari Mollecuisse, `exit 0`) ; `embedderReady` pilote indexation + post-flight _(2026-06-09 · d17a6d8, 26f6961)_
- [ ] **Étape 6 — Reranker local** 🧪 *(conditionnel ; dépend de : 4 + plafond constaté)* _(… · …)_
  - [ ] Ajouter le reranking local derrière une abstraction propre
  - [ ] Mesurer le gain sur l'eval-set → embarquer seulement si gain chiffré
- [ ] **Étape 7 — Profil grosse machine** 🧪 *(conditionnel ; dépend de : 4 + plafond persistant)* _(… · …)_
  - [ ] Brancher embedder « qualité max » (Qwen3 gros / Nemotron-8B) et/ou évaluer E2GraphRAG
  - [ ] Mesurer vs défaut bureautique ; documenter en opt-in (pas le défaut)

---

## Décision D1 — Trancher le défaut d'embedder à l'installation 🧭

> **✅ RÉSOLU (2026-06-09) → option C : choix explicite à 3 à l'install**, **défaut recommandé de façon
> ADAPTATIVE selon la machine** (cf. ci-dessous). Acté en **addendum ADR 0007**
> ([lien](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md#addendum-d1-2026-06-09--défaut-dembedder-à-linstallation--tranché)).
> La section ci-dessous est conservée comme **trace du raisonnement**. L'implémentation = **Étape 5**.
>
> **🎚️ Reco ADAPTATIVE (consigne Thomas, 2026-06-09) — l'install détecte la machine :**
> - **Poste capable (16 Go+ RAM, Apple Silicon / Windows)** → ⭐ **option 1 (in-process)** : privé,
>   gratuit, rien à installer. *(exige le plafonnement de lot, Étape 4-ter — sinon explose, cf. test dense.)*
> - **Petit poste (≤ 8 Go RAM) OU Mac Intel** → ⭐ **option 2 (clé d'API)** : Gemini, OpenAI, ou **n'importe
>   quel fournisseur, y compris l'endpoint de l'entreprise**. **Pourquoi** : l'in-process monte à **~6 Go en
>   indexation** → swappe sur 8 Go ; et il est **indisponible sur Mac Intel**. L'API = RAM ~0, ça reste léger.
> - **Seuil exact** (8/12/16 Go ?) à **finaliser après l'Étape 4-ter** (le pic RAM dépend du plafond de lot retenu).
>
> **Type :** décision **produit/UX de Thomas** (pas de code). Prise APRÈS les Étapes 4 ET 4-bis, à
> l'issue de **tests faits ensemble** (Thomas + Claude) sur les adaptateurs. Ne bloque que l'Étape 5.
>
> **🎯 Préférence affichée par Thomas (2026-06-08, affinée 2026-06-09) :** le défaut **idéal est le
> PUREMENT LOCAL**, et **encore mieux le LOCAL IN-PROCESS « Gemma inside »** (Étape 4-bis : embedder
> embarqué dans le MCP, **zéro serveur/app à installer**) — **argument produit fort** : *« on n'envoie
> pas tes données chez un provider, ET tu n'installes rien de plus »* (niveau 1 de l'échelle de
> confidentialité, sans la friction Ollama). On le retient **si l'Étape 4-bis prouve sa viabilité**
> (install Mac **et** Windows sans build tools, latence CPU tenable, qualité quantifiée à parité des
> 90 % mesurés Étape 4). Sinon, repli sur le local-via-Ollama (power-user) ou une option API. **C'est
> précisément ce que les tests tranchent — pas l'intuition.**

- **Charger :** résultats des Étapes 4 (mesure Ollama) **et 4-bis** (viabilité in-process : install
  Mac+Win, latence, qualité) ; ADR 0007 §« Questions ouvertes » (point 1) + § échelle de confidentialité ;
  `CLAUDE.md` du repo (philosophie d'install « toujours générique, le moins de questions possible »).
- **La question :** quel embedder par défaut, et quelle UX d'install autour ? Pistes (à départager *par
  les tests*) :
  - **Tout-local IN-PROCESS par défaut** *(cible privilégiée)* — zéro clé/cloud **et zéro install
    séparée** (Gemma embarqué dans le MCP), privacy max ; **conditionné à l'Étape 4-bis**.
  - **Local via Ollama** — privacy max aussi, mais **app séparée à installer** → plutôt power-user.
  - **A** — défaut unique simple + swap via `.env` après coup.
  - **B** — A + une **mini-question** seulement pour le cas entreprise (« OpenAI/Azure imposé ? »).
  - **C** — choix explicite à 3 dès l'install (plus clair, plus de friction).
- **Done :** la décision est **actée** (court addendum à l'ADR 0007, ou nouvel ADR si ça le mérite),
  avec son *pourquoi* **adossé aux chiffres des Étapes 4 + 4-bis**. Les cases de D1 sont cochées.

---

## Étape 1 — Le port `Embedder` + un index sûr face au swap 🧪

> **L'instrument fondateur.** Sans lui, rien n'est swappable proprement. **Garde Gemini comme seule
> impl réelle** (+ éventuel `FakeEmbedder` de test). **N'introduit AUCUN 2ᵉ adaptateur réel.**

- **Pré-requis :** aucun (c'est la base).
- **Charger :** plan [`embedder-spi.md`](archived/embedder-spi.md) **en entier** (il est autoporteur) + les
  fichiers qu'il cite (`rag/src/lib/embedder.ts`, `config.ts`, `vector-store.ts`, `index-manager.ts`,
  `tools/search-vault.ts`, `index.ts`, `tools/reindex.ts`, `embedder.test.ts`).
- **Faire :** exécuter la carte de refactor TDD du plan (`embedder-spi.md` §5), dans l'ordre :
  estampille round-trip → garde d'identité → extraire le port → injecter chez les 2 consommateurs →
  point de sélection unique `createEmbedder()` → (option) `FakeEmbedder`.
- **Done :** `npm test` (dossier `rag/`) vert ; le port `Embedder` existe ; l'index est estampillé
  (provider/modèle/dimension) ; un swap d'identité déclenche le **signal « index périmé »** +
  confirm-gate (pas de résultats faux) ; le contrat MCP n'a **pas** bougé. Commits conventionnels par
  baby-step.
- **Au sortir :** cocher les cases de l'Étape 1 ; déplacer `embedder-spi.md` vers `plans/archived/`
  quand c'est livré (cf. convention `maintainers/README.md`).

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
  Dimitry rédigée. Cases de l'Étape 4 cochées.
- **Sortie conditionnelle :** si un embedder local **égale/approche** Gemini → on tient le défaut
  gratuit+privé. Si **plafond** de qualité constaté → Étapes 6/7 deviennent pertinentes.

---

## Étape 4-bis — RAG MCP autonome « Gemma inside » : l'embedder in-process, SANS serveur 🧪

> **Le pas qui peut débloquer le défaut idéal.** L'Étape 4 a prouvé que le local **égale Gemini** en
> qualité — mais via **Ollama** (app séparée à installer), friction rédhibitoire pour un non-dev. Cette
> étape teste la **viabilité d'un embedder embarqué dans le MCP lui-même** (Transformers.js + Gemma en
> ONNX) : *« colle rien, ça marche »*. Si elle passe, c'est **le** candidat n°1 du défaut en D1.
> Veille consignée : étude [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md) **§3 ter**.

- **Pré-requis :** **Étape 1 livrée** (le port `Embedder`) + **Étape 4 livrée** (la baseline 90 %/80 %
  à égaler) ; eval-set (Étape 2).
- **Charger :** étude **§3 ter** (la veille in-process + les 3 validations + sources) ; `rag/src/lib/embedder.ts`
  (port + `selectEmbedder`) ; `rag/src/lib/openai-compatible-embedder.ts` (le modèle d'un adaptateur :
  `identity`, `embed()`, échec bruyant, dep injectée) ; le script d'eval (Étape 2).
- **Faire (TDD, baby-steps) :** implémenter `InProcessEmbedder implements Embedder` via **Transformers.js
  v4** (`@huggingface/transformers`, pipeline `feature-extraction`, **EmbeddingGemma-300m-ONNX** en q8) —
  `embedDocuments`/`embedQuery`, pooling moyen + normalisation ; **pipeline injectable** pour tester la
  logique d'enveloppe **sans** télécharger les poids (même esprit que le `fetch` injecté de l'Étape 3).
  `identity = { providerId: "transformers-js", model, dimension: 768 }`. Le brancher dans `selectEmbedder()`
  via `EMBEDDING_PROVIDER=in-process` (**ni URL ni clé**). Poids téléchargés+cachés au 1ᵉʳ usage,
  **échec bruyant** si DL impossible (jamais de vecteur vide dans l'index). **Ne touche ni au port ni au
  contrat MCP.**
- **Valider empiriquement (les 3, hors tests unitaires) :**
  - **V1 — cross-OS (exigence DURE : Mac ET Windows à parité)** : sur un **Mac nu ET un Windows nu**,
    `npm i` tire les binaires `onnxruntime-node` **pré-buildés** sans build tools / sans Python (env
    appauvri de l'onglet Code). *La pierre de touche du défaut — si ça casse sur l'un des deux OS, ce
    n'est pas le défaut.*
  - **V2 — latence CPU** : indexation du vault + recherche, sans GPU Metal → mesurer, juger tenable pour
    un non-dev (l'encodage est ponctuel ; q8/q4 aident).
  - **V3 — qualité re-mesurée** : rejouer l'eval-set avec l'adaptateur in-process (modèle **quantifié**)
    → score **vs 90 % (Ollama)** et **80 % (Gemini)**. **Confirmer la parité** ; ne pas supposer que
    quantifié = identique.
- **Done :** l'adaptateur existe (`npm test` vert), branché via `.env` ; un **tableau de viabilité**
  consigné (install Mac+Win OK ? · latence · score in-process vs Ollama vs Gemini) + un **verdict
  « viable comme défaut / pas viable »** → alimente **D1**. Contrat MCP **inchangé**. Commits
  conventionnels par baby-step.
- **Sortie conditionnelle :** **viable** → candidat n°1 du défaut tout-local en D1 (Ollama relégué au
  power-user, endpoint API à l'entreprise). **Pas viable** (install KO sur un OS, latence rédhibitoire,
  ou qualité quantifiée en chute) → repli documenté sur local-via-Ollama et/ou endpoint API.

---

## Étape 4-ter — Plafonnement de lot d'embedding (durcissement in-process) 🧪

> **Découvert par le test corpus dense (2026-06-09, vrai vault personnel = 264 notes / 2709 chunks).** La
> viabilité 4-bis a été mesurée sur Flemmr (7 notes) → photo trompeuse. Sur un vrai vault,
> `embedDocuments` reçoit **tous les chunks d'une note d'un coup** : une note longue (transcript de
> sync/1-1 = **78 chunks de ~2000 tokens**) crée un lot dont l'attention en O(seq²)×batch **fait
> exploser onnxruntime** → **8,5 Go RSS et ça grimpe, stall** (process tué à ~12 min, coincé). C'est un
> **correctif OBLIGATOIRE**, pas un edge-case : sans lui, le défaut option 1 plante chez un utilisateur
> dense. Chiffres consignés [`../eval-set.md`](../eval-set.md#étape-4-ter--corpus-dense--plafonnement-de-lot-2026-06-09).

- **Pré-requis :** **Étape 4-bis livrée** (`InProcessEmbedder`).
- **Charger :** `rag/src/lib/in-process-embedder.ts` (`embedDocuments`) ; `rag/src/lib/indexer.ts`
  (`indexPreparedDocs` appelle `ports.embed(tous les chunks du doc)`) ; les chiffres `eval-set.md`.
- **Faire (TDD, baby-steps) :** découper l'embedding en **sous-lots bornés** (constante `EMBED_BATCH`,
  valeur à caler) au lieu d'un lot par document. Au bon niveau : soit dans `InProcessEmbedder.embedDocuments`
  (borne tout appel), soit dans l'indexeur (borne l'orchestration). **Ne touche ni au port ni au contrat MCP.**
- **Mesurer :** re-jouer le corpus dense ; **balayer lot 4 / 8 / 16** pour le compromis RAM↔temps (réf.
  mesurée : lot 16 = pic **6,1 Go**, **7 min 27 s**, **6 chunks/s** ; sans plafond = explose). Figer la constante.
- **Done :** index complet d'un vrai vault **sans explosion RAM** (cible : tenir sur 8 Go ?), pic + temps
  consignés ; `npm test` vert ; contrat MCP inchangé. Commits conventionnels par baby-step.

---

## Étape 4-quater — Embedder partagé : une seule session ONNX chaude 🧪

> **Découvert en attaquant l'Étape 5 (question d'archi de Thomas).** Le serveur MCP réindexe DANS son
> process (auto-reindex au démarrage + watcher fil-de-l'eau) → la **recherche partage le CPU avec
> l'indexation**. Mesuré (`rag/scripts/measure-contention.mts`) : `search_vault` appelait
> `createEmbedder()` **à chaque requête**, et la mémoïsation du pipeline étant `private` (par instance),
> chaque recherche **rechargeait une session ONNX** (~440 ms même au repos) ; pire, recherche et reindex
> créaient **deux sessions concurrentes** → sur-réservation des cœurs → **recherche jusqu'à ×50 (25 s)**.
> Invisible avec Gemini (client gratuit, embed = réseau). **Correctif OBLIGATOIRE** : sans lui, l'option 1
> par défaut donne une recherche poussive.

- **Pré-requis :** **Étape 4-bis livrée** (`InProcessEmbedder`).
- **Charger :** `rag/src/lib/embedder.ts` (`createEmbedder`/`selectEmbedder`) ; `rag/src/index.ts`
  (`search_vault` ligne ~58) + `rag/src/lib/index-manager.ts` (`reindex` ligne ~60) — les 2 appelants.
- **Faire (TDD, baby-step) :** **mémoïser `createEmbedder()` au niveau module** → un singleton process,
  partagé par la recherche ET l'auto-reindex (une seule session ONNX chaude). Provider figé à la 1ʳᵉ
  sélection (un swap passe déjà par un redémarrage de Claude Code) ; clé Gemini toujours lue
  **paresseusement** à l'embed. **Ne touche ni au port ni au contrat MCP.**
- **Prouver :** re-jouer la sonde via le **vrai** `createEmbedder()` → recherche au repos **510 → 35 ms
  (p95)**, recherche pendant indexation de fond **25 429 → 810 ms (p95)**. Le lot=4 (4-ter) aère
  naturellement l'event-loop entre sous-lots. `worker_thread` jugé inutile (0,7 s dans une fenêtre rare —
  l'indexation initiale ; l'incrémental est sous la seconde).
- **Done :** `createEmbedder()` mémoïsé ; `npm test` vert (rag 112/112) ; contrat MCP inchangé ; chiffres
  consignés ici. Commits conventionnels par baby-step.

---

## Étape 5 — Onboarding / install : le choix d'embedder, rendu limpide 🧪

> Aujourd'hui l'install **force** une clé Gemini (`installer.mjs`, `scripts/verify-rag.mjs`,
> `gemini-key.mjs`, `.env.example`, amorce `CLAUDE.md` étape 4). Cette étape adapte le flux selon la
> **Décision D1**, et **capitalise sur les artefacts pédagogiques** (exigence ADR 0007).

- **Pré-requis :** **Décision D1 actée** (✅) + **Étape 3 livrée** (✅) + **Étape 4-ter livrée** (le
  plafonnement de lot, sinon l'option 1 recommandée explose chez un utilisateur dense).
- **Charger :** addendum **D1** de l'ADR 0007 (le tableau des 3 options + le cadrage clé gratuite/payante
  + la reco adaptative) ; ADR 0007 §« Exigence pédagogique » ; étude §1.3 (embedder≠LLM), §privacy
  (échelle), §2 (réutilisable-au-swap) ; mémoire `rag-adapters-pedagogy-requirement` +
  `local-embedder-in-process-path` (chiffres footprint réels) ; les fichiers d'onboarding qui **forcent**
  Gemini aujourd'hui (`installer.mjs`, `scripts/verify-rag.mjs`, `gemini-key.mjs`, `.env.example`, amorce
  `CLAUDE.md` étape 4) ; `rag/src/lib/embedder.ts` (`selectEmbedder` — les `EMBEDDING_PROVIDER` déjà câblés).
- **Faire — le flux d'install (option C, choix explicite à 3, reco ADAPTATIVE) :**
  1. **Détecter la machine** : RAM totale (`os.totalmem()`) + OS/arch (Mac Intel `darwin/x64` = option 1
     indisponible). En déduire la **reco** : poste **16 Go+** → ⭐ option 1 (in-process) ; **≤ 8 Go** ou
     **Mac Intel** → ⭐ **option 2 (clé d'API)**. *(Seuil exact à figer avec le pic RAM de l'Étape 4-ter.)*
  2. **Présenter les 3 options** (triées par confidentialité), l'option recommandée en tête avec « ⭐ recommandé
     pour ta machine » : **1.** tout sur ta machine, rien à installer (in-process) ; **2.** avec une clé d'API —
     **Gemini, OpenAI, ou n'importe quel fournisseur, y compris l'endpoint de ton entreprise** ; **3.** local
     via Ollama (avancé). Sur Mac Intel, **masquer l'option 1**.
  3. **Si option 2 choisie** : afficher le **cadrage « gratuit ≠ privé »** (Gemini gratuit = données
     exploitées ; payant ~dizaines de centimes/mois = non-exploitation ; endpoint entreprise = tenant), puis
     ouvrir `.env` pour la clé (logique actuelle, mais **conditionnée à ce choix**).
  4. **Si option 1 ou 3 choisie** : **ne plus forcer** la clé Gemini — écrire `EMBEDDING_PROVIDER=in-process`
     (ou la config Ollama) dans `.env`, **sauter** l'étape clé.
  5. **Réutiliser les 3 tableaux pédagogiques** (échelle confidentialité / embedder≠LLM / réutilisable-au-swap)
     au point de choix — toujours « tableau + verdict en une phrase, zéro jargon ».
- **Done :** un non-dev installe avec la **reco adaptée à sa machine** sans friction ; sur petit poste, l'API
  (Gemini/OpenAI/entreprise) est clairement recommandée et **expliquée** (pourquoi : RAM) ; la clé n'est
  demandée **que** si option 2 ; **`verify-rag` passe avec l'embedder retenu** (in-process inclus — canari
  Mollecuisse déjà prouvé). Commits conventionnels.

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
  chunk*, à préférer à LightRAG sur machine modeste) ; ADR
  [`../decisions/0008-lightrag-et-graph-rag-differes.md`](../decisions/0008-lightrag-et-graph-rag-differes.md)
  (le *pourquoi* du report de LightRAG / graph-RAG : LLM par chunk → coût + fuite ; à mesurer sur
  eval-set FR ; E2GraphRAG préféré).
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
- **Cross-platform DUR : la solution retenue marche sous Windows AUSSI BIEN que sous Mac** (exigence
  Thomas, 2026-06-09). Tout candidat au défaut (in-process, Ollama…) doit le prouver sur **les deux** OS
  nus — pas seulement sur le Mac de dev.
- **Le launcher reste générique** ; pas de sur-ingénierie contre un risque non prouvé (façon de bosser
  de Thomas).

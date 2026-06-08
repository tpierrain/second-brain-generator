<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🔬 ÉTUDE / VEILLE (créé 2026-06-08) — RIEN D'ACTÉ, exploration.    -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Étude — Offrir un éventail d'alternatives RAG selon les besoins et contraintes des gens

> **STATUT : 🔬 ÉTUDE / VEILLE** (créé le 2026-06-08, **veille rafraîchie le 2026-06-08** via
> recherche multi-sources + vérification adversariale — cf. §8). **Rien n'est acté ici** — c'est la
> note d'exploration qui alimentera des décisions (ADR) et le plan d'implémentation
> [`embedder-spi.md`](embedder-spi.md). Le choix concret d'un embedder/stratégie se fait **après
> mesure** (cf. §6), pas sur intuition.
>
> **La thèse (recadrée avec Thomas, 2026-06-08).** L'objet n'est **pas** « sortir de Gemini » —
> ça, c'est juste *un* cas. L'objet est : **proposer plusieurs alternatives RAG, et aider chacun à
> choisir la bonne selon SES besoins et SES contraintes** (privacy, budget, puissance machine, OS,
> type de corpus, tolérance à la friction d'install). « Sortir de Gemini » est *une* réponse parmi
> d'autres, pour le profil gratuit + privé. Le port SPI `Embedder` est le mécanisme qui rend cet
> **éventail** possible sans casser le harnais ni le contrat MCP.
>
> **Origine :** demande de **Dimitry Ernot** (« pouvoir utiliser autre chose que Google Gemini » —
> Betclic a ChatGPT packagé + Claude Code ; sa femme un outil Mistral) + pistes de **Gaël Bernier**
> (REX VIF à la Nuit des communautés de Nantes, 28/05 : LightRAG/GraphRAG, LangFuse, LLM-as-judge,
> human-in-the-loop).

---

## 1. Les axes de besoins / contraintes (ce qui pilote le choix)

L'étude ne cherche **pas** un « gagnant » unique : elle cherche à **mapper des profils
d'utilisateurs sur des profils RAG**. Les axes qui font basculer le choix d'une personne :

- **Privacy** — le vault doit-il rester **on-device** (rien au cloud), ou un envoi à une API tierce
  est-il acceptable ?
- **Budget** — gratuit obligatoire, ou un coût d'API toléré ?
- **Puissance machine** — poste **bureautique** modeste (sans GPU) vs **grosse machine** (GPU/RAM).
- **OS** — doit tourner sur **Mac ET PC (Windows)** (idéalement Linux).
- **Friction d'install** — **non-dev** (zéro install, « colle une clé ») vs **dev/power-user**
  (prêt à installer Ollama, un modèle, etc.).
- **Type de corpus & qualité visée** — corpus riche en entités/relations + besoin de raisonnement
  multi-hop (→ GraphRAG) vs recherche sémantique simple ; exigence de qualité en **français**.

### 1.1 — Le défaut visé par le générateur (les contraintes de Thomas, validées 2026-06-08)

Le **profil par défaut** que le générateur doit servir (cœur de cible : non-dev type « Mac nu
d'Achille ») coche **idéalement tout** ceci — Thomas reconnaît que les cocher *tous à la fois*
« va être compliqué », d'où la **mesure** (§6) et l'**offre à plusieurs niveaux** (§1.2) :

1. **Gratuit** — pas de paiement.
2. **Privacy** — local / **on-device**.
3. **Cross-plateforme** — Mac ET PC (Windows), pas de dépendance GPU NVIDIA.
4. **Tourne sur un poste bureautique** — machine modeste, sans GPU dédié.

### 1.2 — L'offre RAG à plusieurs niveaux (la vraie ambition)

Plutôt qu'un choix unique, **un éventail de profils**, sélectionnable (via `.env` / installeur),
chacun répondant à un jeu de contraintes :

| Profil RAG | Pour qui (besoins/contraintes) | Stack pressentie |
|---|---|---|
| **Bureautique** (défaut perso) | Non-dev, gratuit, privé, machine modeste, Mac/PC | Embedder local léger (**EmbeddingGemma** ou **bge-m3**) via Ollama, retrieval plat + reranker local |
| **Grosse machine** (opt-in) | Dev/power-user, GPU/RAM, qualité max, gratuit+privé | Embedder local gros (**Qwen3** / Nemotron-8B), reranking lourd, éventuellement **GraphRAG léger** (E2GraphRAG) |
| **Endpoint API (compatible OpenAI)** (opt-in) | • soit *zéro install locale* (clé perso) • soit **en entreprise** avec un OpenAI/Azure **validé par la boîte** (cas Dimitry) | **Un seul adaptateur « compatible OpenAI », URL + clé configurables** → OpenAI public, **Azure OpenAI**, **passerelle interne** d'entreprise, **Mistral**… (+ Gemini actuel via son adaptateur natif) |

> **Ce qui rend ça possible architecturalement :** le **port SPI `Embedder`** (plan
> [`embedder-spi.md`](embedder-spi.md)) + l'estampille d'identité de l'index. C'est lui qui permet
> d'offrir **plusieurs profils** (bureautique / grosse machine / endpoint API) sans toucher au
> harnais ni au contrat MCP (ADR
> [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)).
>
> **🎯 L'adaptateur « compatible OpenAI » est l'impl concrète au plus fort levier.** L'API
> d'embeddings d'OpenAI (`/v1/embeddings`) étant le **standard de fait**, **un seul** adaptateur avec
> **URL configurable** couvre presque tout l'écosystème : OpenAI public, **Azure OpenAI**, passerelle
> interne d'entreprise, **Mistral**, et même **Ollama en local** (qui expose aussi cette API). On
> change de backend en **changeant une URL dans `.env`**, sans une ligne de code en plus. Pour le
> **public entreprise de Dimitry** (OpenAI/Azure déjà validé par l'employeur), c'est **probablement le
> meilleur défaut** : zéro install, zéro Ollama, et **la confidentialité est déjà tranchée par la
> boîte** (pas d'approbation supplémentaire à demander). ⚠️ Ça reste du **cloud** (les notes partent à
> l'endpoint à l'indexation) — donc « fournisseur validé par l'employeur », *pas* « 100 % on-device ».
> → Ouvre la **discussion préalable** exigée par le plan SPI ([`embedder-spi.md`](embedder-spi.md) §0.2)
> avant toute 2ᵉ impl concrète : l'adaptateur OpenAI-compatible est le premier candidat naturel.

### 1.3 — Dégonfler le jargon « ressources » : embedder ≠ LLM de chat

> **La confusion à lever en premier.** On mélange deux familles de modèles **très** différentes :
>
> | | **Embedder** (ce dont le RAG a besoin) | **LLM de chat** (PAS besoin de le faire tourner) |
> |---|---|---|
> | Rôle | Transforme un texte en liste de nombres (pour retrouver) | Tient une conversation, raisonne, rédige (genre ChatGPT) |
> | Taille | **minuscule** (300M–600M paramètres) | **énorme** (7B–70B, soit 20 à 200× plus gros) |
> | Sur un laptop banal | **oui, tranquille** | **non**, exige une grosse machine/GPU |
>
> « RAG local » **ne veut PAS dire** « faire tourner ChatGPT sur ton laptop ». Le chat (la réponse)
> reste **Claude, dans le cloud**. La seule chose qu'on ferait tourner en local, c'est le **petit**
> modèle qui *encode* les notes.

**Chiffres concrets** (cible = laptop de PM banal : MacBook Air M2 16 Go, ou ultrabook Windows 16 Go,
**sans carte graphique de gamer**) :

| Modèle | Disque | RAM à l'usage | Sans GPU dédié ? | Réaliste sur ce laptop ? |
|---|---|---|---|---|
| **EmbeddingGemma** (300M) | ~0,3–0,6 Go | **< 200 Mo** | ✅ conçu pour ça | ✅✅ **les doigts dans le nez**, même 8 Go |
| **bge-m3** (568M) | 1,2 Go | ~1–2 Go | ✅ | ✅ très bien sur 16 Go |
| **Qwen3-0.6B** | ~0,6–1,2 Go | ~1–2 Go | ✅ | ✅ ok |
| Qwen3-**8B** (gros) | ~8–16 Go | ~8–16 Go | ❌ veut un vrai GPU | ❌ pas sur ce laptop |
| GraphRAG **+ LLM local** | ≥ 5 Go (le LLM) | ≥ 8–16 Go | ❌ GPU quasi obligatoire | ❌ **non** (indexation 1 h–3 h) |

- **Encoder le vault = ponctuel** (quelques minutes à ~15 min pour quelques milliers de notes ; à
  refaire seulement quand le contenu change).
- **Poser une question = encoder une phrase = < 1 s.** Encoder est *pas cher* ; c'est *générer la
  réponse* qui coûte — et ça, c'est Claude (cloud).

⇒ **Verdict** : un **embedder local léger est parfaitement réaliste** sur un laptop de PM banal
(EmbeddingGemma est fait *exprès* pour ça). C'est **GraphRAG-avec-LLM-local** qui ne l'est pas → d'où
son rangement en « profil grosse machine, pas le défaut » (§4).

### Cadrage honnête — où s'arrête vraiment la privacy

Le cerveau **tourne dans Claude** (ADR
[`../decisions/0004-claude-only-pour-l-instant.md`](../decisions/0004-claude-only-pour-l-instant.md)).
Donc la couche qui **répond** envoie déjà questions + passages récupérés à Anthropic (cloud). **Le
seul morceau qu'on peut rendre 100 % local, c'est le RAG** (embeddings + index + recherche).

⇒ L'objectif **atteignable et honnête** : *« le RAG ne dépend plus d'une API cloud payante
(Google) ; le vault est encodé et fouillé entièrement sur la machine »*. C'est réel, shippable, et
répond pile à Dimitry (sortir de Google) **et** aux critères 1–4. Ne pas survendre « tout est
privé » : le LLM qui répond reste Claude.

### Échelle de confidentialité par fournisseur (le vrai argumentaire d'install)

**Deux réflexes à intégrer :**
1. **La confidentialité n'est pas une affaire de code, mais d'endpoint + de palier.** L'adaptateur
   compatible-OpenAI est de la **tuyauterie neutre** : c'est l'URL + la clé (donc le fournisseur et
   son plan) mis dans le `.env` qui *décident* du niveau de privacy. Le même code est « fuyant » ou
   « béton » selon où on le pointe.
2. **« Pas d'entraînement » ≠ « ça ne quitte pas la machine ».** Toute option API (même Azure) envoie
   quand même le contenu du vault au fournisseur **à l'indexation**. Le **seul** niveau où *rien* ne
   part, c'est le **local**.

| Niveau | Option | Le contenu sort-il ? | Entraînement sur tes données ? | À savoir |
|---|---|---|---|---|
| 🟢 **1** | **Local** (EmbeddingGemma / bge-m3) | **Non** — rien ne sort | sans objet | Confidentialité max, **gratuit**, pas de clé |
| 🟢 **2** | **Azure OpenAI** / passerelle entreprise | oui, mais reste dans le **tenant** de la boîte | **Non** (garanties contractuelles) | **Le plus béton en cloud** ; déjà validé par l'employeur (cas Dimitry) |
| 🟡 **3** | **OpenAI API** | oui | **Non, par défaut** (depuis 2023) | ≠ ChatGPT grand public ; rétention ~30 j anti-abus puis suppression. **Plus simple que Gemini** (pas de manip) |
| 🟡 **4** | **Mistral** (payant, UE) | oui | **Non** en payant | Hébergé **UE** (bonus RGPD) ; ⚠️ vérifier les conditions du palier gratuit |
| 🔴 **5** | **N'importe quel palier GRATUIT** | oui | ⚠️ **souvent oui** (amélioration produit) | **Le piège.** Gemini gratuit en fait partie → payer qq centimes (activer la facturation) le fait passer ~niveau 3 |

> **Le net :** la gymnastique « payer ~13 cts pour sortir de l'entraînement » est une **bizarrerie du
> palier gratuit Gemini**, pas une fatalité. **OpenAI API** = pas d'entraînement par défaut ;
> **Azure** = le plus solide (et la porte naturelle du monde entreprise) ; **local** = la question ne
> se pose plus. ⚠️ Politiques **volatiles** (recul arrêté début 2026) → revérifier les pages
> officielles à la date d'usage avant d'en faire un argument public.

---

## 2. Le constat technique qui conditionne tout

L'index stocke les vecteurs en **BLOB `Float32` brut**, **sans trace du modèle** (ni provider, ni
**dimension**) — cf. `rag/src/lib/vector-store.ts`. Or chaque embedder a sa dimension propre
(Gemini ≈ 768–3072 selon config, bge-m3 = 1024, nomic = 768, Qwen3-8B = 4096). Swapper **sans
réindexer** ⇒ recherche **silencieusement fausse**. D'où, dans le plan SPI : **estampille
d'identité + confirm-gate** (on explique, on attend le « oui », jamais de réindex dans le dos).

**Ce qui est réutilisable au swap d'embedder (et ce qui ne l'est pas) :**

| Élément | Réutilisable ? |
|---|---|
| Les **notes Markdown** (la source) | ✅ toujours — elles ne bougent jamais |
| La **structure** de la base (SQLite, tables documents/chunks) | ✅ identique quel que soit l'embedder |
| Le **chunking** | ✅ si la stratégie de découpe est inchangée |
| Les **vecteurs** (embeddings stockés) | ❌ **JAMAIS** d'un embedder à l'autre → **réindex obligatoire** |

Chaque embedder encode dans son **espace propre** : deux vecteurs de modèles différents ne sont pas
comparables, **même à dimension égale**. ⚠️ La dimension égale est donc un **piège** (un garde qui ne
checkerait que la dimension laisserait passer un swap incompatible → recherche fausse) → l'estampille
**doit** s'identifier sur **provider + modèle + dimension**, pas la seule dimension. **Bonne nouvelle :**
réindexer = ré-encoder les notes (quelques minutes), **les notes ne sont jamais perdues** et la base
n'est pas reconstruite de zéro.

---

## 3. Veille embedders — filtrée par les critères (état 2026)

| Option | Gratuit | Local/privé | Cross-OS | Bureautique | Qualité FR | Verdict |
|---|---|---|---|---|---|---|
| **Gemini** (actuel) | ❌ payant | ❌ cloud | n/a | n/a | ⚠️ ~66.2 (MTEB FR) **non vérifié** (cf. §8) | **À remplacer** — échoue 1 & 2 |
| **bge-m3** (568M, 1024-dim) | ✅ | ✅ | ✅ | ✅ (1.2 Go Ollama, CPU-OK) | correcte **non SOTA** (~58.79 retrieval dense F-MTEB) ; multilingue 100+ langues = pertinence FR garantie, pas suprématie | **Candidat #1 profil bureautique** (à départager vs EmbeddingGemma) |
| **EmbeddingGemma** (300/308M) | ✅ | ✅ | ✅ | ✅✅ **<200 Mo RAM** quantifié, conçu *on-device* | n°1 open multilingue **<500M** sur MTEB (~61.15 mean ML-v2) ; score FR isolé à mesurer | **Rival direct de bge-m3 dans le tier léger** (2× plus petit) — **nouveau, à benchmarker** |
| **nomic-embed-text** (v1/v1.5, 768-dim) | ✅ | ✅ | ✅ | ✅✅ ultra-léger | **anglo-centré** (confirmé) — multilingue **uniquement** dans la variante séparée `nomic-embed-text-v2-moe` | « rapide partout » mais **FR faible** ; classé derrière bge-m3 en multilingue |
| **Qwen3-Embedding-0.6B** (1024-dim, comme bge-m3) | ✅ | ✅ | ✅ | ✅ | **inconnue** (le 8B=69.8 mais pas le petit) | À **benchmarker**. ⚠️ Même dimension que bge-m3 **n'évite PAS le réindex** (espaces différents) — et c'est un **piège** : l'estampille doit garder sur **provider+modèle**, pas que la dimension (cf. §2) |
| **Qwen3-Embedding-8B** (4096-dim) | ✅ | ✅ | ❌ exige gros GPU/RAM | ❌ | **~69.8** (excellent ; 70.58 mean ML, n°1 **juin 2025**) | **Profil grosse machine** uniquement — *dépassé en 2026* par NVIDIA Llama-Embed-Nemotron-8B |

**À noter :**
- **Le « Gemini 66.2 FR » de la version initiale n'est PAS confirmé** par la veille (aucune source
  survivante ne chiffre `gemini-embedding-001` en FR). À revérifier avant d'en faire un argument.
- **Classements volatils** : le n°1 Qwen3-8B date du **5 juin 2025** ; en 2026 NVIDIA
  Llama-Embed-Nemotron-8B est passé devant (Qwen3-8B ~rang 3). **Revalider les leaderboards à la date
  d'usage.** Et MTEB est critiqué comme prédicteur imparfait du retrieval réel (cf. RTEB) → un bon
  score MTEB ≠ qualité terrain sur un corpus Markdown perso FR. **Mesurer, pas supposer.**

**Mapping sur l'offre à plusieurs niveaux (§1.2) :**
- **Profil bureautique (défaut)** : `bge-m3` **OU `EmbeddingGemma`** via **Ollama** — gratuit, privé,
  Mac/PC, machine modeste. **EmbeddingGemma** est le nouveau prétendant le plus léger (conçu
  on-device, <200 Mo RAM) ; **lequel des deux par défaut = à départager par l'eval-set FR (§6).**
  (`nomic` écarté du défaut : FR trop faible.)
- **Profil grosse machine (opt-in)** : `Qwen3-Embedding` gros (ou Llama-Embed-Nemotron-8B) + reranking
  + éventuellement GraphRAG **léger** (E2GraphRAG, cf. §4).
- **Profil endpoint API (opt-in)** : **un adaptateur « compatible OpenAI » à URL configurable**
  couvre OpenAI public, **Azure OpenAI**, passerelle interne d'entreprise, **Mistral**, et même Ollama
  local (+ Gemini via son adaptateur natif). Option « zéro friction » pour non-dev sans Ollama **et**
  réponse directe au cas **entreprise de Dimitry** (OpenAI/Azure validé par la boîte = le défaut
  naturel pour ce public). Cf. encart §1.2.

---

## 4. LightRAG / GraphRAG (repo pointé par Thomas : <https://github.com/HKUDS/LightRAG>)

- **Licence MIT** ✅. **Full-local POSSIBLE** : LLM via Ollama + embeddings locaux + **stockage
  fichier par défaut** (aucun service externe obligatoire ; Neo4j/Postgres/Milvus optionnels) ✅.
- **Mais le point dur** : l'extraction entités/relations exige un **LLM capable**. Indexation
  **lourde** : **un appel LLM par chunk** (+ agrégation des communautés → `c+n` appels au total).
- **La taille minimale de LLM est INCERTAINE (veille 2026)** : le README parlait de ~30B, mais la
  veille a **réfuté à la fois** « ≥7B requis » *et* « 7-8B suffisent ». Constat solide en revanche :
  les **petits LLM échouent fréquemment l'extraction** (graphes **vides** — nano-graphrag documente
  *42 chunks → 0 entité / 0 relation*), avec un piège Ollama récurrent (`num_ctx` par défaut = 2048
  trop petit pour le prompt d'extraction → échec silencieux ; fix `PARAMETER num_ctx 32000`).
- **Pas démontré GPU-less** : le benchmark 2026 de référence tourne sur **GPU NVIDIA discret**
  (GTX 1070 Ti 8 Go, concurrence forcée à 1), indexation **88 min** (Qwen2.5-7B) à **211 min**
  (Llama3.1-8B). **Aucune démonstration CPU-only / Mac nu.**
- **Verdict vs critères** : *gratuit + privé* = faire tourner un **LLM local capable** → **hors
  profil bureautique** (impensable sur le Mac nu d'Achille ; lent même sur une bonne machine sans
  GPU). Le rendre fluide = LLM cloud = **payant + fuite**. ⇒ **En tension frontale avec les critères
  1–4.** À réserver au **profil grosse machine** / track R&D power-user. **Pas le défaut.**

**Alternative légère sans LLM par chunk — `E2GraphRAG`** (arXiv 2505.24226) : remplace l'extraction
LLM par le toolkit NLP **SpaCy** (co-occurrence d'entités), d'où **~10× plus rapide** à l'indexation
à efficacité comparable. **C'est la piste qui pourrait rendre le graphe jouable sans gros GPU** — à
préférer à LightRAG si on attaque un jour le track graphe. (Autre nom croisé : `nano-graphrag`, plus
léger que GraphRAG MS mais qui repose **toujours** sur un LLM par chunk.)

**Pertinence sur le fond :** un second cerveau perso est **très riche en entités/relations**
(personnes, décisions, réunions, 1-1, initiatives), donc GraphRAG **mappe bien** sur le cas — ce
n'est pas du hype. Mais à n'attaquer **que si l'eval prouve** que le retrieval plat plafonne, et
**par la voie sans-LLM-par-chunk** (E2GraphRAG) côté machine modeste.

---

## 5. Pistes intermédiaires de la veille

> ⚠️ **Tous les chiffres ci-dessous viennent des benchmarks Anthropic (cookbook/blog), qui sont
> CLOUD et EN ANGLAIS.** La fraction de gain **conservée avec un LLM/embedder local léger en FR**
> n'est **PAS** démontrée — c'est une extrapolation, pas un fait mesuré. D'où la primauté de
> l'eval-set local (§6). Deux affirmations marketing ont d'ailleurs été **réfutées** en vérification :
> « reranking −67 % » (0-3) et « hybrid 30/70 optimal partout » (0-3).

- **Contextual Retrieval (Anthropic)** : enrichir chaque chunk d'un mini-contexte avant embedding →
  **−35 %** d'échecs de retrieval (top-20 : 5.7 % → 3.7 %), **−49 %** avec Contextual BM25
  (→ 2.9 %). Version canonique = Claude à l'indexation (**payant + cloud** → échoue les critères tel
  quel). **Version gratuit+privé** = même technique avec un **LLM local** pour générer le contexte →
  **bien plus léger que LightRAG**, mais **personne n'a publié le gain conservé en local/FR** (cf.
  questions ouvertes §6). À garder en réserve.
- **Reranking local** (cross-encoder : `bge-reranker-v2-m3`, `Qwen3-Reranker` 0.6B/4B) : sur les
  chiffres **cloud** (Cohere rerank-v3) c'est **le plus gros saut incrémental** (Pass@10 95.3 %,
  −47 % d'échecs). **MAIS** : ⚠️ **aucun chiffre de gain isolé d'un reranker LOCAL n'a survécu à la
  vérification** — l'idée « meilleur ratio qualité/coût » reste une **hypothèse à valider
  empiriquement** (en FR, avec le reranker local), pas un acquis. Reste un candidat fort une fois
  l'embedder local en place.
- **Hybrid search (BM25 + dense + reciprocal rank fusion)** : 100 % local, pas de modèle
  supplémentaire — mais **gain MARGINAL** au-dessus des contextual embeddings d'après les chiffres
  cloud (Pass@10 quasi nul ; Pass@20 ~+1 pt). À considérer **après** reranker/contextual, pas avant.

---

## 6. Eval-first — la pièce maîtresse (et c'est dans l'ADN du projet)

Le REX VIF insiste : l'**évaluation** est « indispensable, souvent mise de côté » (LangFuse,
**LLM-as-judge**, **human-in-the-loop**). Et Thomas en a **déjà la graine** : le **canari
« Mollecuisse »** de `scripts/verify-rag.mjs` *est* un mini-eval (il prouve que la réponse vient du
vault).

⇒ **Avant** de choisir un embedder/stratégie, se faire un **eval-set local** (15–20 questions →
réponse attendue, sur le vrai vault), **juge = Claude** (déjà dans la boucle, usage occasionnel =
acceptable). Ça transforme « compliqué / risqué » en **« mesuré »** — exactement la façon de bosser
de Thomas (valider empiriquement, pas de sur-ingénierie contre un risque non prouvé).

- **Outils repérés** (au cas où on industrialise plus tard) : **RAGAS** (léger, spécifique RAG,
  sans ground-truth), **DeepEval**, **TruLens** ; **LangFuse** = observabilité self-hostable mais
  **= infra** → ne pas y aller avant d'avoir la question. Démarrer par un **script local façon
  `verify-rag`** donne 90 % de la valeur sans infra.

---

## 7. Séquence recommandée (recalée sur les critères)

1. **Finir le port `Embedder`** (plan [`embedder-spi.md`](embedder-spi.md)) — l'**instrument**.
2. **Eval-set local** (juge = Claude). Peu de code, levier énorme. **Confirmé indispensable par la
   veille** : aucun chiffre local/FR n'existe dans la littérature, on ne tranchera que par la mesure.
3. **Brancher `bge-m3` ET `EmbeddingGemma` via Ollama** derrière le port et **MESURER** vs Gemini sur
   du FR → réponse **chiffrée** à Dimitry, et choix du **profil bureautique** par défaut (départage
   bge-m3 vs EmbeddingGemma). `Qwen3-0.6B` en bonus (même dimension 1024 que bge-m3). (`nomic` écarté :
   FR trop faible.)
4. **Reranker local** (`bge-reranker-v2-m3` / `Qwen3-Reranker`) si l'eval montre un gain — à **mesurer**,
   le « meilleur ratio » n'étant pas prouvé en local.
5. **Profil grosse machine** (Qwen3 gros/Nemotron-8B / GraphRAG **E2GraphRAG** / Contextual Retrieval)
   **seulement si** l'eval prouve un plafond — en assumant le coût machine.

---

## 8. Sources de la veille

**Veille initiale (2026-06-08) :**
- [Ailog — Embedding Models 2026 (benchmark)](https://app.ailog.fr/en/blog/news/embedding-models-2026)
- [BentoML — Open-Source Embedding Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [AI Learning Guides — RAG in Production 2026 (GraphRAG, hybrid, evals)](https://ailearningguides.com/rag-production-patterns-2026/)
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [LightRAG — HKUDS (repo)](https://github.com/HKUDS/LightRAG)
- [Atlan — RAGAS / TruLens / DeepEval comparison 2026](https://atlan.com/know/llm-evaluation-frameworks-compared/)

**Veille rafraîchie (2026-06-08, sources vérifiées en adversarial — 21/25 affirmations confirmées) :**
- [Qwen3-Embedding — blog officiel](https://qwenlm.github.io/blog/qwen3-embedding/) · [arXiv 2506.05176](https://arxiv.org/abs/2506.05176) — tailles/dimensions, n°1 MTEB ML juin 2025 (70.58)
- [Google — Introducing EmbeddingGemma](https://developers.googleblog.com/en/introducing-embeddinggemma/) · [arXiv 2509.20354](https://arxiv.org/abs/2509.20354) · [HF model card](https://huggingface.co/google/embeddinggemma-300m) — 308M, <200 Mo RAM quantifié, on-device
- [bge-m3 — Ollama](https://ollama.com/library/bge-m3) · [HF BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) · [arXiv 2402.03216](https://arxiv.org/abs/2402.03216) · [F-MTEB arXiv 2405.20468](https://arxiv.org/abs/2405.20468) — 1.2 Go Ollama, FR ~58.79 dense
- [nomic-embed-text — Ollama](https://ollama.com/library/nomic-embed-text) · [v2-moe](https://ollama.com/library/nomic-embed-text-v2-moe) — multilingue réservé à v2-moe
- [Anthropic Cookbook — Contextual Embeddings guide](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide) — chiffres Pass@k reranker/hybrid (cloud, anglais)
- [E2GraphRAG — arXiv 2505.24226](https://arxiv.org/html/2505.24226v1) — extraction SpaCy, ~10× plus rapide ; [nano-graphrag FAQ](https://github.com/gusye1234/nano-graphrag/blob/main/docs/FAQ.md) — piège `num_ctx`, graphes vides
- [Bench GraphRAG local 2026 — arXiv 2605.20815](https://arxiv.org/html/2605.20815) — GPU NVIDIA discret, indexation 88–211 min
- [RTEB — arXiv 2508.21038](https://arxiv.org/abs/2508.21038) — MTEB critiqué comme prédicteur du retrieval réel

> **Réserves de méthode (issues de la vérification)** : (1) classements MTEB **volatils** — revalider
> à la date d'usage ; (2) métriques **non équivalentes** (Mean-Task multilingue ≠ score FR ≠ retrieval
> dense F-MTEB) ; (3) **Gemini FR ~66.2 NON vérifié** ; (4) **leviers contextual/hybrid/reranker non
> chiffrés en local/FR** ; (5) viabilité GraphRAG **CPU-only/Mac nu non démontrée**.

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

### 3 bis — ✅ MESURE Étape 4 (2026-06-09) : les locaux **ne dégradent pas** la qualité FR

> **Ce qui était « à benchmarker » ci-dessus l'est désormais.** Premier chiffrage réel sous notre
> propre harnais (eval-set, juge = Claude) sur le vault FR Flemmr, via Ollama + l'adaptateur
> compatible-OpenAI. Détail + repro : [`../eval-set.md`](../eval-set.md#étape-4--résultats-mesurés-local-vs-gemini-2026-06-09).

| Embedder | Lieu | Dim | **Score FR** | Index 7 notes (warm) | Disque | RAM |
|---|---|---|---|---|---|---|
| **EmbeddingGemma** | 🟢 local | 768 | **90 % (9/10)** | ~1,3 s | 621 Mo | ~0,67 Go |
| **bge-m3** | 🟢 local | 1024 | **90 % (9/10)** | ~1,7 s | 1,2 Go | ~0,66 Go |
| **Gemini** (baseline) | 🔴 cloud | 3072 | **80 % (8/10)** | ~20,8 s | 0 | 0 |

- **Conclusion robuste** : **aucun malus qualité** à passer en local sur ce corpus FR — les deux locaux
  sont **au moins à parité** avec Gemini (ils le dépassent même d'une question). Le profil par défaut
  visé (gratuit + privé + on-device, §1.1) est **viable côté qualité** : la mesure valide l'intuition,
  elle ne la contredit pas.
- **Caveat assumé** (ne pas survendre) : corpus minuscule → le 90 vs 80 = **1 question d'écart**, dans
  le bruit (variance juge + top-k qui ramène presque tout) ; chaque modèle rate une question
  *différente*. ⇒ **« local à parité »** est défendable, **« local > Gemini » ne l'est pas encore**.
  Pour **départager EmbeddingGemma vs bge-m3** (le choix fin de D1), refaire la mesure sur un **corpus
  riche** (cf. `eval-set.md` §discriminer). À score égal, **EmbeddingGemma** part favori du défaut
  bureautique : 2× plus léger sur disque, vecteurs plus petits (index plus compact), conçu on-device.
- **Footprint réel validé** : les deux modèles tiennent dans **~0,65 Go de RAM** (GPU Metal sur Mac
  Apple Silicon), très loin du laptop saturé — confirme §1.3 (embedder ≠ LLM de chat).

#### Réponse chiffrée à Dimitry (sortir de Gemini)

> *« Oui, on peut faire tourner le RAG **sans Google**, et sans perdre en qualité. Mesuré chez nous
> (eval-set FR maison) : un embedder **100 % local** (EmbeddingGemma ou bge-m3, via Ollama) score
> **9/10** contre **8/10** pour Gemini — donc **au moins à parité**, en restant **gratuit, on-device,
> zéro clé, zéro donnée envoyée à un provider**. Footprint : ~0,6 Go de RAM, indexation quasi
> instantanée sur un Mac/PC banal. Pour ton cas **entreprise** (OpenAI/Azure déjà validés par la
> boîte), le **même** code bascule sur ton endpoint en changeant une URL dans `.env` — l'adaptateur
> est neutre. Le seul niveau où *rien* ne sort de la machine reste le local (cf. échelle de
> confidentialité §privacy). »*

### 3 ter — 🔎 Piste « local SANS Ollama » (embedding **in-process**) — veille 2026-06-09

> **Pourquoi cette piste.** Le seul vrai prix du tout-local (§3 bis) n'est pas la qualité (mesurée ≥
> Gemini) ni le footprint (~0,65 Go) — c'est la **friction d'install d'Ollama** (app séparée + `ollama
> pull`) pour un non-dev (le « Mac nu d'Achille »). Question creusée : peut-on faire tourner l'embedder
> local **dans le process Node du RAG lui-même**, sans serveur ni app à installer ? **Réponse : oui.**

**Le mécanisme.** Au lieu de parler HTTP à un serveur local (Ollama), un adaptateur charge le modèle
**en mémoire dans le process** via un runtime ONNX. Les poids se téléchargent **une fois** (cache
local) au 1ᵉʳ usage, puis tout est offline. Côté archi : c'est **un 4ᵉ adaptateur derrière le port
`Embedder`** déjà en place (Étape 1) — il ne parle pas le dialecte OpenAI HTTP, il appelle le modèle
directement. **Zéro changement du harnais ni du contrat MCP.**

| Runtime local | Install pour un non-dev | Modèles utiles dispo | Accélération | Maintenu | Verdict |
|---|---|---|---|---|---|
| **Ollama** (serveur) — *testé Étape 4* | ⚠️ **app séparée** (cask) + `ollama pull` | EmbeddingGemma, bge-m3 (mesurés 90 %) | **GPU Metal** ✅ | ✅ actif | Marche, **mais friction app séparée** |
| **Transformers.js v4** (`@huggingface/transformers`) — *in-process* | ✅ **`npm i` only** (déjà fait par l'installeur) ; binaires `onnxruntime-node` **pré-buildés Windows (x64+arm64), macOS (x64+arm64), Linux (x64+arm64)** — CPU partout, **pas de build tools** ; modèle auto-téléchargé+caché | **EmbeddingGemma-300m-ONNX** (q4/q8) ✅ + `Xenova/bge-m3` ✅ | CPU (WebGPU en Node encore jeune) | ✅ actif (HF, v4 nov. 2025) | **🎯 piste la plus prometteuse pour « tout-local SANS friction »** |
| **fastembed-js** (`fastembed`) — *in-process* | ✅ `npm i` (bindings natifs précompilés) | bge-small/base, all-MiniLM, **multilingual-e5-large** ; ❌ **pas bge-m3 ni EmbeddingGemma** | CPU | ❌ **archivé 15/01/2026** (read-only) | Repli possible, mais **non maintenu** + pas nos meilleurs modèles → écarté |

**Ce que ça changerait pour le défaut d'install** : plus d'Ollama du tout. L'embedder local devient
une **dépendance npm** que l'installeur tire déjà, + un **téléchargement de poids transparent** au
1ᵉʳ lancement (~150–300 Mo en q8). Pour un non-dev : *« tu n'installes rien de plus, ça marche tout
seul »* — exactement ce qui débloque la cible §1.1 (gratuit + privé + on-device, **sans** le mur Ollama).

**Cross-platform (exigence DURE — Thomas, 2026-06-09) : Mac ET Windows à parité.** Sur le papier c'est
acquis — `onnxruntime-node` publie des binaires pré-buildés pour **Windows x64+arm64, macOS x64+arm64,
Linux x64+arm64** (CPU partout), donc *aucun* build tool ni sur Mac ni sur Windows. Le contrat MCP et
le port `Embedder` sont déjà OS-agnostiques. ⚠️ Builds **volatils** → revérifier la matrice de
plateformes à la version d'`onnxruntime-node` réellement épinglée (cf. réserves de méthode §8).

**⚠️ À VALIDER avant d'en faire le défaut D1 (honnête : recherché, PAS encore testé chez nous) :**
1. **Install réelle sur Mac nu ET Windows nu** : confirmer que `onnxruntime-node` tire bien le binaire
   pré-buildé sans build tools dans l'environnement appauvri de l'onglet Code (cf.
   [[achille-bare-mac-desktop-path]]) — **les deux OS**, pas seulement le Mac de dev.
2. **Latence CPU** : sans GPU Metal (qu'Ollama utilisait), l'encodage CPU est plus lent — à mesurer
   (acceptable a priori, l'encodage étant **ponctuel** ; q8/q4 aident).
3. **Re-mesurer la qualité sous ce runtime** : même modèle, mais **quantifié** (q8/q4) → rejouer
   l'eval-set avec l'adaptateur in-process pour **confirmer la parité** avec les 90 % mesurés via Ollama
   (ne pas supposer que quantifié = identique).

**Synthèse intégrée — le paysage complet du choix d'embedder par défaut :**

| Option | Statut chez nous | Abo/coût | Données sortent ? | Friction non-dev | Qualité FR |
|---|---|---|---|---|---|
| **Gemini** (actuel) | ✅ testé (baseline) | payant | oui (cloud) | ~nulle (coller clé) | 80 % |
| **Local via Ollama** (EmbeddingGemma/bge-m3) | ✅ **testé Étape 4** | gratuit | **non** | ⚠️ app Ollama + pull | **90 %** (mesuré) |
| **Local in-process** (Transformers.js + EmbeddingGemma) | 🔎 **envisagé** (veille OK, à tester) | gratuit | **non** | ✅ **npm only, rien à installer** | à confirmer (≈ parité attendue) |
| **Endpoint API** (OpenAI/Azure/Mistral) | ✅ adaptateur livré (Ét. 3) | payant | oui (tenant boîte pour Azure) | nulle (URL+clé) | ≈ cloud |

→ **Recommandation pour D1** : si la piste **in-process** passe les 3 validations ci-dessus, c'est
**le meilleur candidat pour le défaut « tout-local »** (lève la seule objection sérieuse, la friction
Ollama). L'adaptateur Ollama-compatible reste utile pour le **power-user** (GPU Metal, modèles plus
gros) et l'endpoint API pour l'**entreprise**. Prochain pas concret possible : un **spike adaptateur
in-process + re-run eval-set** pour transformer « envisagé » en « mesuré ».

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

**Veille « local sans Ollama » (2026-06-09) :**
- [Transformers.js v4 — blog HF](https://huggingface.co/blog/transformersjs-v4) · [doc installation](https://huggingface.co/docs/transformers.js/installation) — `npm i @huggingface/transformers`, tourne en Node/Bun/Deno, runtime WebGPU C++ réécrit
- [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX) — variantes fp32/q8/q4 (pas fp16), conçu pour Transformers.js ; [demo « no server required »](https://github.com/glaforge/embedding-gemma-semantic-search)
- [Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) · [aapot/bge-m3-onnx](https://huggingface.co/aapot/bge-m3-onnx) — bge-m3 en ONNX pour Transformers.js
- [onnxruntime-node — npm](https://www.npmjs.com/package/onnxruntime-node) · [README officiel js/node](https://github.com/microsoft/onnxruntime/blob/main/js/node/README.md) — postinstall `prebuild-install` ; binaires pré-buildés **Windows x64+arm64, macOS x64+arm64, Linux x64+arm64** (CPU partout ; WebGPU EP pas encore sur linux-arm64) ; fallback compile si absent
- [fastembed-js (`fastembed`)](https://github.com/Anush008/fastembed-js) — in-process ONNX, **archivé 15/01/2026** (v2.1.0) ; bge-small/base, all-MiniLM, multilingual-e5-large ; pas bge-m3/EmbeddingGemma

> **Réserves de méthode (issues de la vérification)** : (1) classements MTEB **volatils** — revalider
> à la date d'usage ; (2) métriques **non équivalentes** (Mean-Task multilingue ≠ score FR ≠ retrieval
> dense F-MTEB) ; (3) **Gemini FR ~66.2 NON vérifié** ; (4) **leviers contextual/hybrid/reranker non
> chiffrés en local/FR** ; (5) viabilité GraphRAG **CPU-only/Mac nu non démontrée**.

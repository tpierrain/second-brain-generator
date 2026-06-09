<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🧪 OUTIL DEV (livré 2026-06-09) — Étape 2 du plan embedder.        -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Eval-set RAG — mesurer la qualité de récupération (juge = Claude)

> **À quoi ça sert.** C'est l'**instrument de mesure** de l'[Étape 2 du plan
> embedder](plans/rag-embedder-plan-action.md) : il transforme « cet embedder est-il bon ? » en
> un **score chiffré reproductible**. Il établit la **baseline Gemini** ; en [Étape 4](plans/rag-embedder-plan-action.md#étape-4--brancher-le-local--mesurer-vs-gemini-),
> on rejoue le **même** harnais sur les embedders locaux (bge-m3, EmbeddingGemma) pour les
> comparer **sur du FR réel**, pas sur des leaderboards anglais.
>
> **Dev-only.** Exclu du cerveau généré (`DEV_ONLY_PREFIXES` dans
> [`../scripts/lib/tracked-files.mjs`](../scripts/lib/tracked-files.mjs)) : il sert à choisir
> l'embedder **du launcher**, il n'a aucune valeur chez un utilisateur (notes Flemmr purgées).

## Comment ça marche

Pour chaque question de l'eval-set : on lance `search_vault` (via le **vrai** serveur MCP
`vault-rag`, le contrat réel), puis on demande à **Claude** (`claude -p`) de juger **si les
passages remontés suffisent à répondre** — il ne se fie qu'aux passages, pas à ses connaissances.
Le juge termine par `VERDICT: PASS` / `VERDICT: FAIL` ; le score = `PASS / total`.

Le corpus de la baseline = le **vault d'exemple livré** (Flemmr, parodique → inventé, donc
public-safe, versionné et **rejouable par n'importe qui**). La 1ʳᵉ question reprend le **canari
grep-proof** de `demo.mjs` (réponse « Mollecuisse » introuvable par mots-clés → vraie preuve
sémantique).

## Lancer

Depuis la racine du repo, avec une **clé Gemini dans `.env`** (la recherche embedde les
questions) et le **CLI `claude`** dans le PATH :

```bash
node scripts/run-eval.mjs
```

- `exit 0` = eval menée à bien (le **score peut être bas** — c'est une *mesure*, pas un échec).
- `exit 1` = échec **opérationnel** (pas de clé, index KO, MCP mort, ou **verdict illisible** =
  juge qui n'a pas suivi le format → on ne publie pas un score invalide).
- Optionnel : `EVAL_JUDGE_MODEL=<modèle>` pour pinner un modèle de juge (ex. un Haiku, moins cher).

> **Reproductibilité.** Le juge est un LLM → le score est **stable**, pas bit-exact. La consigne
> est binaire et objective (les passages suffisent-ils, oui/non) → variance faible. Suffisant pour
> départager des embedders (étude §6 : un script local donne 90 % de la valeur, sans infra lourde).

## Baseline Gemini — **80 % (8/10)** _(2026-06-09)_

Premier chiffre de référence, embedder courant **Gemini**, sur le vault d'exemple Flemmr (7 notes) :

| | Questions | Score |
|---|---|---|
| **Gemini (baseline)** | 8 PASS / 10 | **80,0 %** |

Les **2 ratés** sont de **vrais échecs de récupération** (pas un bug d'eval-set) : la réponse
existe bien dans le vault, mais les passages remontés n'ont pas suffi au juge.

- *« Combien Flemmr a-t-elle levé en série A… ? »* — fait présent dans `vault/topics/flemmr.md`.
- *« Quel est le slogan de Flemmr ? »* — slogan présent dans le **même** fichier.

> C'est exactement le signal qu'un eval-set doit capturer : on **ne corrige pas** la question ni le
> vault pour faire monter le chiffre — ce serait vider la mesure de son sens. 80 % est la **vérité
> terrain** que les embedders locaux (Étape 4) devront égaler ou dépasser, **sous le même harnais**.
> (Note : corpus petit → un seul run ; si l'Étape 4 demande plus de finesse, moyenner quelques runs.)

## Ajouter / modifier une question

Éditer [`../scripts/lib/eval-set.mjs`](../scripts/lib/eval-set.mjs) : un item =
`{ question, expect }` (la question en langage naturel + la réponse **attendue**, le ground-truth
que la bonne récupération doit permettre de donner). Garde-fou : `eval-set.test.mjs` exige ≥ 8
questions bien formées et au moins une ancrée sur le canari Mollecuisse.

Mélanger volontairement des questions **faciles** (le terme-réponse est dans les notes → testent
le plancher) et des questions **par synonymes** (grep-résistantes → testent le sens) : un embedder
faible décroche sur les secondes.

## Les fichiers

| Fichier | Rôle | Testé |
|---|---|---|
| `scripts/lib/eval-set.mjs` | Les questions Flemmr (donnée, source de vérité) | structurel |
| `scripts/lib/eval-judge.mjs` | Prompt du juge, lecture du verdict, score (PUR) | ✅ unitaire |
| `scripts/lib/eval-run.mjs` | Orchestration `search → juge → verdict → score` (PUR, deps injectées) | ✅ unitaire |
| `scripts/lib/mcp-search.mjs` | N requêtes `search_vault` sur **une** session MCP | ✅ (stub MCP) |
| `scripts/run-eval.mjs` | Exécutable : câble index + MCP réel + `claude -p` | — (I/O, comme `verify-rag`) |

## Étape 4 — résultats mesurés (local vs Gemini) _(2026-06-09)_

Trois embedders, **même harnais**, même vault Flemmr, **même session** (sur secteur), via Ollama +
l'adaptateur compatible-OpenAI (`EMBEDDING_PROVIDER=openai-compatible`, `EMBEDDING_BASE_URL=http://localhost:11434/v1`) :

| Embedder | Lieu | Dim | **Score FR** | Raté(s) | Index 7 notes (warm) | Disque | RAM résidente |
|---|---|---|---|---|---|---|---|
| **EmbeddingGemma** | 🟢 local | 768 | **90 % (9/10)** | série A | ~1,3 s | 621 Mo | ~0,67 Go (GPU Metal) |
| **bge-m3** | 🟢 local | 1024 | **90 % (9/10)** | Q1 (employé oisif) | ~1,7 s | 1,2 Go | ~0,66 Go (GPU Metal) |
| **Gemini** (baseline) | 🔴 cloud | 3072 | **80 % (8/10)** | série A + slogan | ~20,8 s | 0 | 0 (clé+quota+réseau) |

**Anti-fallback (prouvé)** : estampilles d'index distinctes (`index_meta` = provider/modèle/dimension),
vecteurs stockés à la bonne dimension, **0 appel Gemini** durant les runs locaux (compteur quota figé).

**Lecture honnête** — le signal robuste est **« aucun malus qualité à passer en local »** : les deux
locaux **égalent ou dépassent** Gemini ici. Mais le 90 vs 80 = **une seule question d'écart**, dans le
bruit (variance juge LLM + **corpus minuscule** où le top-k ramène presque tout), et **chaque modèle
rate une question différente** → la conclusion défendable est **« local au moins à parité »**, pas
« local bat Gemini ». Latence : sur 7 notes le local indexe ~15× plus vite (pas de réseau/throttle) ;
l'écart se creuse à l'échelle d'un vrai vault, l'encodage restant **ponctuel**.

> **Reproduire** : `rm -f rag/.cache/vault.db*` puis, pour un local,
> `EMBEDDING_PROVIDER=openai-compatible EMBEDDING_BASE_URL=http://localhost:11434/v1 EMBEDDING_API_KEY= EMBEDDING_MODEL_NAME=<embeddinggemma|bge-m3> EMBEDDING_DIMENSION=<768|1024> node scripts/run-eval.mjs`
> ; sans les `EMBEDDING_*` = Gemini natif. Prérequis local : Ollama + `ollama pull <modèle>`.

## Étape 4-bis — viabilité de l'in-process « Gemma inside » (SANS Ollama) _(2026-06-09)_

Même harnais, même vault Flemmr, mais l'embedder tourne **dans le process Node du RAG**
(Transformers.js v4 + EmbeddingGemma-300m **ONNX q8**), **sans serveur ni app** — branché par
`EMBEDDING_PROVIDER=in-process` (ni URL ni clé). Verdict des **3 validations** :

| Validation | Résultat | Détail mesuré (ce Mac, Apple Silicon) |
|---|---|---|
| **V1 — install cross-OS** | ✅ **OK Mac+Windows** | `npm i @huggingface/transformers` → `onnxruntime-node@1.24.3` **embarque** les binaires pré-buildés `win32/x64`, `win32/arm64`, `darwin/arm64`, `linux/x64+arm64` ; `requirements=[]` partout (seul le GPU CUDA Linux est distant) → **rien à compiler, rien à télécharger, offline-friendly**. ⚠️ **Mac Intel (darwin/x64) non supporté** par cette version (Apple Silicon ✅). |
| **V2 — latence CPU** | ✅ **tenable** | Téléchargement des poids **~28 s une seule fois** (caché ensuite) ; démarrage à froid poids cachés = **675 ms** (load+1ᵉʳ embed) ; débit à chaud **8–9 ms/texte (~110/s)**, **sans GPU Metal** ; vecteur 768-dim **normalisé** (‖v‖=1). |
| **V3 — qualité (quantifié)** | ✅ **parité Ollama (90 %)** | eval-set rejoué : **90 % (9/10)**, = EmbeddingGemma via Ollama, **> Gemini 80 %**. Seul raté : « série A » (idem Ollama). |
| **V4 — empreinte (disque + RAM)** | ⚖️ **prix local assumé** | **Disque** : +~550 Mo dans `node_modules` (binaires onnxruntime tous OS ; ~35 Mo réellement chargés sur Mac) + ~150–300 Mo de poids en cache HF au 1ᵉʳ usage. **RAM** : modèle chargé = **~1,1–1,6 Go résident** (variance des arènes onnxruntime CPU), **stable** quelle que soit la taille du vault (l'indexeur embed **doc par doc**, `indexer.ts:46`). |

**Le démarrage du MCP n'est PAS ralenti (mesuré).** Boot → handshake « MCP running on stdio » =
**~0,5–0,7 s**, **identique** en défaut Gemini et en `in-process`. Raisons : `server.connect()` se fait
**avant** tout embedding (`index.ts:257`) ; le modèle n'est **jamais importé statiquement** (seul un
`await import("@huggingface/transformers")` **paresseux** + pipeline **mémoïsé**) ; il ne se charge qu'à
la **1ʳᵉ recherche** (ou au reindex de fond, non bloquant). En défaut Gemini, `InProcessEmbedder` n'est
même pas instancié → **impact nul**. Le coût (~675 ms de chargement par lancement du process, poids
cachés) est donc **payé à la 1ʳᵉ recherche, pas au boot**. Seul gonflement RAM possible (~2,1 Go) : une
**unique note** de plusieurs centaines de chunks encodée en un seul lot — edge case, traitable par
tranchage si ça mord un jour.

**La leçon V3 (importante).** EmbeddingGemma **exige ses prompts de tâche** (`task: search result |
query: …` côté recherche, `title: none | text: …` côté document). Ollama les applique en interne ;
en in-process **c'est à nous**. Sans eux, q8 brut = **80 %** (et le canari *Mollecuisse* rate) ; avec
eux, **90 %**. Donc l'écart venait du **mauvais usage du modèle, pas de la quantification** — la parité
quantifié↔Ollama est **confirmée, pas supposée** (exactement ce que le plan demandait de vérifier).

**Anti-fallback (prouvé)** : réindex complet (`7 indexés`) sous estampille `index_meta` =
`transformers-js`/`embeddinggemma-300m-ONNX`/`768`, **0 appel réseau** pendant l'eval (offline).

> **Verdict 4-bis → VIABLE comme défaut.** L'in-process lève la **seule** objection sérieuse du
> tout-local (la friction Ollama) **sans rien céder** : install `npm`-only sur Mac (Apple Silicon) ET
> Windows, latence ponctuelle tenable, qualité **à parité d'Ollama (90 %)** et au-dessus de Gemini.
> → **candidat n°1 du défaut en D1.** Réserves honnêtes : (a) **RAM** — le ~1,5 Go n'est vrai qu'**au
> repos/en recherche** ; **en indexation d'un corpus dense ça monte à ~6 Go** (cf. Étape 4-ter
> ci-dessous), confortable 16 Go+, **swappe sur 8 Go** (vs ~0 pour Gemini, distant) ; (b) **Mac Intel** hors couverture `onnxruntime-node` 1.24.3 ; (c) corpus Flemmr
> petit (90 vs 80 = une question, cf. limite ci-dessous) ; (d) binaires pré-buildés **volatils** →
> re-vérifier la matrice à chaque bump d'`onnxruntime-node`.

> **Reproduire** : `rm -f rag/.cache/vault.db*` puis
> `EMBEDDING_PROVIDER=in-process node scripts/run-eval.mjs` (ni URL ni clé ; poids téléchargés au 1ᵉʳ
> run puis cachés). Sans les `EMBEDDING_*` = Gemini natif. *(Le label « embedder courant : Gemini »
> affiché par le script est cosmétique et codé en dur — la mesure est bien in-process, prouvée par
> l'estampille et le réindex.)*

## Étape 4-ter — corpus dense : plafonnement de lot _(2026-06-09)_

La viabilité 4-bis a été mesurée sur Flemmr (7 notes). **Test sur le vrai vault Inqom (264 notes,
2709 chunks, moy. 10,3/note)** — copie temporaire, embedder **in-process** (rien ne sort), persistance
neutre — corrige cette photo sur deux points et révèle un correctif obligatoire :

| | **Prod actuelle** (lot = tous les chunks d'une note) | **Lot plafonné à 16 chunks** |
|---|---|---|
| Issue | ❌ **stall** (tué à ~12 min, coincé sur une note de 78 chunks) | ✅ **264/264 indexées** |
| RAM résidente pic | **8,5 Go** et ça grimpait | **6,1 Go** (OS : 6,55 Go) |
| Temps total | jamais fini | **7 min 27 s** |
| Débit | — | **6 chunks/s** · 0,6 note/s · load 0,8 s · repos 1,67 Go |

**Cause racine** : `embedDocuments` reçoit **tous les chunks d'une note d'un coup** (`indexer.ts:46`).
Une note longue (transcript sync/1-1 = **78 chunks de ~2000 tokens**) crée un lot dont l'attention en
**O(seq²)×batch** fait exploser onnxruntime. 17 notes du vault dépassent 20 chunks, 6 dépassent 50.

**Trois leçons (invisibles sur Flemmr) :**
1. **La prod actuelle n'est pas sûre sur un vrai vault** → **plafonner la taille de lot est OBLIGATOIRE**
   (Étape 4-ter du plan, TDD, bloquant pour le défaut option 1).
2. **RAM en indexation ≫ 1,5 Go** : ~6 Go même lot plafonné → OK 16 Go+, **swappe sur 8 Go**. Le ~1,5 Go
   ne vaut qu'au repos/recherche.
3. **Débit ≪ 110/s** : le « 8-9 ms/texte » était sur texte **court** ; les vrais chunks frôlent le
   contexte max → **6 chunks/s (~18× plus lent)**. Index à froid d'un vrai vault ≈ **7,5 min**, **une
   fois** (ensuite incrémental par hash).

> **Verdict D1 révisé** : in-process viable comme défaut **sur 16 Go+ ET avec plafonnement de lot** ;
> sur 8 Go / Mac modeste, l'option clé d'API (RAM ~0) reste raisonnable → **conforte le choix C (3
> options explicites)**. Valeur du plafond à caler (balayer 4/8/16) au moment d'implémenter l'Étape 4-ter.

## Étape 4 — discriminer plus finement (limite connue)

Le corpus Flemmr (7 notes) est petit → discrimination d'embedders **limitée** (le top-k ramène
presque tout, d'où le coude-à-coude ci-dessus). Pour départager **vraiment** EmbeddingGemma vs bge-m3
(et trancher D1 sur des chiffres qui séparent), pointer le même harnais sur un corpus **plus riche**
(le vrai cerveau de Thomas, ou un échantillon réaliste) : seul le jeu de questions change, le reste de
l'instrument est inchangé.

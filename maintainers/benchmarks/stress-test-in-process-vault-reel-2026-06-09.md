# Stress-test RAG in-process sur vault réel dense — 2026-06-09

> **Matière à publication.** Premier stress-test de l'embedder **tout-local in-process**
> (« Gemma inside ») sur un **vrai vault dense**, et non plus sur la démo Flemmr (7 notes).
> But : prouver hors-démo que (a) le plafonnement de lot tient la RAM, (b) la qualité du
> retrieval tient sur corpus dense réel. Run réalisé sur la branche `feat/rag-embedder-swappable`.

---

## Protocole (reproductible)

> Remplacer `<VAULT_SOURCE>` par un vault dense réel (ici un vault personnel **non versionné**,
> ~270 notes). Le cerveau de test est **jetable** : à supprimer après (`rm -rf`), il contient des
> données privées dans son `.git`.

**1. Installer un cerveau jetable en in-process** (aucune clé, aucun réseau), depuis la branche :
```bash
node installer.mjs --non-interactive --name brain-pr-test --dest "$HOME" \
  --owner "<nom>" --lang fr --embedder in-process
```

**2. Déverser le vault réel** (`.md` only, structure préservée, non destructif) :
```bash
rsync -a --prune-empty-dirs --include='*/' --include='*.md' --exclude='*' \
  "<VAULT_SOURCE>/" "$HOME/brain-pr-test/vault/"
```

**3. Déclencher l'indexation via le watcher** : ouvrir une **conversation Desktop (onglet Code)
rootée dans `~/brain-pr-test`** — le MCP démarre, son watcher détecte les fichiers et auto-indexe.
*(L'indexation se déclenche à la seconde où `rsync` dépose les fichiers, dès que le MCP tourne.)*

**4. Échantillonner pendant le run** — RSS du process d'indexation **isolé** (sinon pollué par les
~40 process « node » de Claude Desktop) + état du run :
```bash
# pic RAM réel de l'indexeur (RSS OS, Mo)
ps -A -o pid,rss,command | grep "rag/src/index.ts" | grep -v grep \
  | sort -k2 -rn | head -1 | awk '{printf "PID %s  %.0f Mo\n", $1, $2/1024}'
# progression (status / doneChunks / totalChunks / errors)
cat "$HOME/brain-pr-test/rag/.cache/last-run.json"
```

**5. Vérifier la libération mémoire** : fermer l'app Desktop (arrêt du MCP) → la RAM doit chuter.

> ⚠️ Une indexation **CLI concurrente** (`cd rag && npm run index`) lancée en parallèle est
> **correctement refusée** par le `ReindexLock` (`skippedLocked: true`) — garde-fou anti-double-index.

## Environnement

| | |
|---|---|
| Machine | MacBook (Apple Silicon **M4**), **24 Go** RAM, `darwin arm64` |
| Embedder | **in-process** — Transformers.js v4 (`@huggingface/transformers`), `onnxruntime-node` 1.24.3, CPU |
| Modèle | **EmbeddingGemma-300m ONNX (q8)**, avec prompts de tâche |
| Plafonnement de lot | `EMBED_BATCH = 4` (défaut, Étape 4-ter) |
| Provider | `EMBEDDING_PROVIDER=in-process` ; `GOOGLE_GEMINI_API_KEY` **vide** |

## Corpus

| | |
|---|---|
| Notes `.md` indexées | **271** (+ 6 notes démo skippées, inchangées ; 277 fichiers scannés) |
| Poids markdown | ~2,8 Mo, **24 dossiers** |
| Notes les plus longues | transcripts de **~85 à 103 Ko** pièce (`raw-sources/transcripts/`) |
| Non-`.md` (json, py, txt, pptx, png…) | **ignorés** par le scanner (`.md` only) |

## Résultats — indexation (mesuré dans ce run)

| Métrique | Valeur |
|---|---|
| Chunks produits / indexés | **2 764 / 2 764** (100 %, `doneChunks == totalChunks`) |
| Erreurs | **0** |
| Durée totale | **~5 min 48 s** (21:10:12 → 21:16:00 UTC) |
| Débit moyen | **~7,9 chunks/s** (~477 chunks/min ; ~47 notes/min) |
| Chunks par note (moyenne) | ~10,2 |
| **Pic RAM** (RSS OS, process d'indexation isolé) | **~2,9 Go** |
| RAM en cours d'indexation (échantillons) | 2,44 Go (32 %) → 2,48 Go (57 %) → 2,92 Go (81 %) |

**Lecture :** le RSS reste **quasi plat ~2,5 Go** sur l'essentiel du run et culmine à **~2,9 Go** —
**jamais près des 4 Go**, et *très* loin des **8,5 Go (puis stall)** observés sur ce même type de
corpus **sans** plafonnement de lot (cf. Étape 4-ter). Le plafonnement tient la RAM **bornée et
découplée de la taille du vault**, sur corpus dense réel.

## Résultats — mémoire au repos (mesuré dans ce run)

- Après indexation, le process MCP **conserve ~2,8 Go** : c'est l'**embedder partagé** (Étape
  4-quater) **gardé chaud** pour des recherches rapides — **choix assumé, pas une fuite**.
- **Confirmé empiriquement** : à la **fermeture de l'app Desktop** (donc arrêt du MCP), la **RAM
  chute** immédiatement. L'index reste persistant sur disque (`rag/.cache/vault.db`) → réouverture
  instantanée, **sans ré-indexation**.

## Résultats — qualité du retrieval (qualitatif, ce run)

3 questions-test **discriminantes** posées dans une conversation Desktop rootée — **3/3 réussies** :

1. **Fait isolé + chiffre** niché dans un tableau d'**une seule** note (score Resonance le moins
   exprimé). → bonne note citée, bon chiffre.
2. **Fait + piège de nuance** : squad porteuse d'un POC + périmètre, en **écartant un distracteur**
   (« personne désignée *après* ≠ critère de choix »). → nuance correctement traitée.
3. **Multi-hop** : réponse impossible depuis une seule note, obligeant à **croiser 2 notes**
   (autocapture analytics × architecture micro-frontends). → les deux sources remontées.

→ Précision **et** multi-hop tiennent sur 271 docs denses. **Aucun plafond qualité constaté** →
les Étapes 6/7 (reranker) restent non nécessaires.

## Latence de recherche (référence — bench dédié, PAS ce run)

La latence par requête n'a **pas** été instrumentée dans ce run (questions posées à la main).
Chiffres pertinents issus du bench instrumenté de l'**Étape 4-quater** (embedder partagé), même
embedder in-process :

- Recherche au repos : **~510 ms → ~35 ms** après mémoïsation de `createEmbedder()` au niveau process.
- Recherche **pendant** une indexation : **~25 400 ms → ~810 ms** (p95).

> La cause du pic était `createEmbedder()` rappelé à chaque recherche (rechargement d'une session
> ONNX ~440 ms) + sur-réservation des cœurs ; le fix = embedder **singleton process**.

## Bonus — bug débusqué par ce test (et corrigé)

Le test d'install réel (in-process, sans clé) a fait sortir un **faux vert** invisible en démo :
`vault_stats` affichait un **quota Gemini codé en dur** (« Quota : 0/7600 ») même en in-process,
que le LLM aggravait en « clé Gemini fonctionnelle » alors qu'aucune clé n'existait. **Corrigé en
TDD** (commit `2e2c320`) : le rapport reçoit le `providerId` de l'embedder actif et n'affiche le
quota que pour Gemini ; ligne locale honnête sinon. **Leçon : seul un test d'install *réel* fait
sortir ce genre de faux vert.**

## Pièges de mesure (à réutiliser)

- **`ps | grep node` est pollué** : Claude Desktop (Electron) lance des dizaines de process
  « node » → la somme RSS ne reflète **pas** l'indexeur. **Isoler** `rag/src/index.ts`.
- Le **watcher indexe à la seconde** où les fichiers sont déposés → toute indexation manuelle
  concurrente est refusée par le lock (normal).

## Verdict

L'embedder **in-process** tient **charge, RAM et qualité** sur un corpus dense réel (271 notes,
2 764 chunks), **sans clé ni réseau**, sur une machine grand public (M4 / 24 Go), pic RAM **~2,9 Go**
en **~5 min 48 s**. Le défaut « tout-local » est validé hors démo.

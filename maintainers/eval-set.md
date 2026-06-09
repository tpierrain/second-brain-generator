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

## Étape 4 — discriminer finement

Le corpus Flemmr (~5 notes) est petit → discrimination d'embedders **limitée** (le top-k ramène
presque tout). Pour la mesure fine de l'Étape 4, pointer le même harnais sur un corpus **plus
riche** (le vrai cerveau de Thomas, ou un échantillon réaliste) : seul le jeu de questions change,
le reste de l'instrument est inchangé.

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : ✅ LIVRÉ (créé 2026-06-08, livré 2026-06-08) — port + index sûr.   -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — Abstraire l'embedder du RAG derrière un port SPI

> **STATUT : ✅ LIVRÉ** (créé le 2026-06-08, livré le 2026-06-08 — Étape 1 du plan
> d'action `rag-embedder-plan-action.md`). Commits : `2ac9698` (estampille round-trip),
> `7e9fdec` (garde d'identité), `9d3b869` (port `Embedder`), `50b6fcd` (shouldStamp),
> `a49f861` (createEmbedder), `99abe61` (index-manager câblé + estampille), `7fc678b`
> (garde câblé sur la recherche), `bf2ead8` (FakeEmbedder). 91/91 tests verts, tsc OK.
> Le contrat MCP n'a pas bougé.
> Plan autoporteur : une session Claude vierge doit pouvoir l'exécuter en ne lisant QUE ce
> fichier + les fichiers cités. Discipline **TDD** (skill `tdd-discipline`, et `outside-in-diamond-tdd`
> pour le périmètre back-end/Hive), commits **manuels** en conventionnel + co-author Claude.
>
> **Concrétise l'ADR [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)**
> (port MCP stable, embedder = SPI interchangeable) + son **addendum « confirm-gate »**.

---

## 0. Décisions prises (le « quoi » et le « pourquoi »)

Validé avec Thomas le 2026-06-08 (origine : demande de Dimitry Ernot — « pouvoir utiliser autre
chose que Google Gemini ») :

1. **Ce plan abstrait l'embedder, point.** Il extrait un **port SPI `Embedder`** propre et rend
   l'index **sûr face à un swap**. Il garde **Gemini comme seule impl concrète** (plus,
   optionnellement, un `FakeEmbedder` de test). **Il n'introduit AUCUN second embedder réel**
   (Mistral / OpenAI / local-Ollama).

2. **Le choix d'un 2ᵉ embedder/indexeur se discute AVANT de l'implémenter.** Thomas a des idées ;
   on en parle d'abord. ⛔ **Ne pas démarrer une 2ᵉ impl concrète sans cet échange.** Ce plan
   prépare juste le terrain pour que ce soit ensuite un branchement local, sans toucher au harnais.
   → Veille + critères du choix dans l'étude
   [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md) (gratuit,
   privacy/local, Mac+PC, poste bureautique, offre tiered ; candidats bge-m3 / nomic / Qwen3 ;
   décision **après mesure** via un eval-set local).

3. **Swap d'embedder = confirm-gate en langage naturel, jamais de réindex dans le dos** (décision #1,
   verrouillée — cf. §5 et l'addendum ADR 0006). Sur changement de modèle d'embedder, le cerveau
   **explique à l'utilisateur** que sa config de recherche a changé et qu'il faut **ré-indexer les
   documents** (eux ne bougent pas — juste ré-encodés), que **ça prend un peu de temps**, et **attend
   une confirmation explicite**. Par défaut : **on ne réindexe rien.**

---

## 1. Le constat technique qui commande tout le plan

Les embeddings sont stockés en **BLOB `Float32` brut** ; la similarité lit `byteLength / 4`
(`rag/src/lib/vector-store.ts` ~l.154). **L'index ne porte AUCUNE trace de qui l'a produit** :
ni provider, ni modèle, ni **dimension**.

Or chaque embedder a sa dimension propre (Gemini `gemini-embedding-001` ≈ 3072, `mistral-embed`
= 1024, `nomic-embed-text` local = 768). Donc — **certitude mécanique, pas hypothèse** :

> Le jour où on swappe l'embedder **sans réindexer**, `cosineSimilarity` compare un vecteur requête
> neuf à des vecteurs d'une autre dimension → **résultats silencieusement faux** (ou crash). Rien ne
> le détecte aujourd'hui.

⇒ « Rendre l'embedder swappable » = **deux livrables indissociables** :
1. **Le port `Embedder`** (extraire l'interface SPI — la partie facile).
2. **L'estampille d'identité de l'index** (l'index sait quel embedder l'a rempli, et **refuse une
   recherche périmée** → déclenche le confirm-gate — la partie qui rend le swap *sûr*).

C'est l'esprit « au pire l'utilisateur ré-indexe » de l'ADR 0006 — sauf qu'aujourd'hui **rien ne
déclenche ce ré-index**. C'est la dette cachée derrière la décision déjà actée.

---

## 2. Le port SPI `Embedder` (contrat interne, agnostique)

Une interface nommée, à l'altitude hexagonale (et non plus une fonction `embedOne` injectée
seulement pour les tests, cf. `EmbedDeps` actuel) :

```ts
export interface Embedder {
  readonly identity: EmbedderIdentity;                    // qui je suis (stampé dans l'index)
  embedDocuments(texts: string[]): Promise<number[][]>;   // chemin indexation
  embedQuery(text: string): Promise<number[]>;            // chemin recherche (prioritaire)
}

export interface EmbedderIdentity {
  providerId: string;   // "gemini" | "fake" | … (futur : "mistral", "ollama")
  model: string;        // "gemini-embedding-001"
  dimension: number;    // 3072 — la clé d'invalidation de l'index
}
```

**Pourquoi deux méthodes (`embedDocuments` vs `embedQuery`) et pas un `embed()` générique ?** Le port
capture l'**intention** de façon agnostique (« document à ranger » vs « question posée ») ; **chaque
adaptateur traduit cette intention dans le dialecte natif de son fournisseur** — ou l'ignore si son
backend n'a pas ce réglage. Les spécificités fournisseur vivent **dans** l'adaptateur, **jamais** dans
la signature du port (cohérent avec l'« enveloppe vs lettre » de l'ADR 0007 §3).

| Méthode du port | Intention agnostique | Traduction par l'adaptateur |
|---|---|---|
| `embedDocuments(...)` | « j'encode des **documents à ranger** » | `GeminiEmbedder` → `taskType=RETRIEVAL_DOCUMENT` ; `OpenAiCompatibleEmbedder` → pas ce bouton, **ignore** |
| `embedQuery(...)` | « j'encode une **question** » | `GeminiEmbedder` → `taskType=RETRIEVAL_QUERY` ; `OpenAiCompatibleEmbedder` → **ignore** |

- **`GeminiEmbedder implements Embedder`** = la seule impl concrète : tout le contenu actuel de
  `rag/src/lib/embedder.ts` (client `GoogleGenAI`, `embedWithRetry`/retry 429, `EMBEDDING_MODEL`)
  **déplacé derrière le port**, **sans changement de comportement** (les tests existants restent le
  filet).
- **Le garde-fou quota (`UsageTracker`) reste orthogonal** : c'est une préoccupation transverse
  (anti-emballement), pas une spécificité Gemini. Il **décore** n'importe quel `Embedder`. Seuls ses
  **défauts** sont Gemini-flavored (timezone `America/Los_Angeles`, message « minuit Pacifique ») →
  **dette notée, hors scope** (cf. §7).
- **`FakeEmbedder` (optionnel)** : impl déterministe (hash → vecteur, dimension fixe), sans réseau ni
  clé. Sert en test ET prouve que le port tient. Ne PAS la confondre avec un « 2ᵉ embedder réel »
  (décision §0.2).

---

## 3. L'estampille d'identité de l'index (le livrable qui rend le swap *sûr*)

- À l'**indexation** : écrire `identity` (provider/model/dimension) dans une **table `index_meta`**
  de la DB (`vector-store.ts`).
- À la **recherche** (et au reindex) : comparer l'identité de l'embedder courant à celle stampée.
  - **Match** → on continue normalement.
  - **Mismatch** (ou DB sans stamp = index d'avant ce plan) → **on ne renvoie PAS de résultats
    faux** : on remonte un **signal « index périmé »** qui porte les **deux identités** (stampée vs
    courante), pour déclencher le confirm-gate (§5).

Cohérent avec la culture **fail-loud** du projet (cf. ADR 0005 révisé, plans `harden-run-node-*`) :
mieux vaut un refus explicite et actionnable qu'une recherche qui ment en silence.

---

## 4. Le confirm-gate (où ça vit, et pourquoi le contrat MCP ne bouge pas)

Le serveur MCP ne « demande » pas tout seul — il **retourne du texte** que Claude relaie. Découpage :

| Acteur | Rôle |
|---|---|
| **Garde-d'identité** (hexagone RAG) | Détecte le mismatch au moment d'une recherche. |
| **`search_vault`** (`src/tools/search-vault.ts`, `src/index.ts:50`) | Au lieu de résultats faux, **retourne le signal « index périmé »** (les deux identités) — actionnable, traduisible en langage naturel. |
| **Claude** (couche conversationnelle) | Relaie le message ci-dessous **et attend la réponse de l'utilisateur**. |
| **`reindex`** (`src/tools/reindex.ts` → `index-manager.reindex(force)`) | L'**action confirmée** : appelée **seulement après** le « oui ». |

**Message-type** (la prose nomme les modèles **dynamiquement** via l'`identity` — rien n'est codé en
dur « Gemini ») :

> « Mes capacités de recherche rapide et sémantique reposent sur un **indexeur/embedder** ; or **sa
> configuration a changé** (avant : `<model stampé>`, maintenant : `<model courant>`). Pour continuer
> à fonctionner, il me faut **ré-indexer tes documents** — eux ne bougent pas, c'est juste qu'ils
> doivent être ré-encodés avec le nouveau modèle. **Ça peut prendre un peu de temps.** Tu veux que je
> le fasse maintenant ? »

→ **par défaut on ne réindexe RIEN** tant que l'utilisateur n'a pas confirmé (« on ne va pas indexer
pour rien »).

**Conséquence heureuse : aucune nouvelle surface MCP à inventer.** On réutilise `search_vault`
(retour enrichi) + `reindex` (déjà là). Le **port MCP reste le contrat stable** de l'ADR 0006 —
zéro breaking change, zéro provider-leak dans les **schémas** d'outils.

---

## 5. Carte de refactor — séquence TDD (outside-in, baby-steps)

Un seul test à la fois, **red → green → refactor complet** à chaque pas. Ordre pressenti (le risque
le plus grave d'abord) :

1. **Estampille — round-trip** : `index_meta` écrit l'identité à l'indexation, relue ensuite. *Tire
   la table + l'accès.*
2. **Estampille — garde d'identité** : recherche avec identité divergente (ou absente) → **signal
   « périmé » explicite** porteur des deux identités, **pas** de résultats. *Tire le garde dans le
   chemin `search_vault`.*
3. **Extraire le port `Embedder`** : introduire l'interface ; faire implémenter `GeminiEmbedder` par
   le code existant. Les tests actuels (`rag/src/lib/embedder.test.ts`, qui stubbent déjà via
   `EmbedDeps`/`embedOne`) restent le filet — idéalement reformulés autour du port. **Comportement
   inchangé.**
4. **Injecter le port chez ses 2 consommateurs** : `index-manager` (indexation → `embedDocuments` ;
   c'est lui qui stampe l'identité) et `search-vault`/`index.ts:50` (recherche → `embedQuery` ; c'est
   lui qui consulte le garde).
5. **Un seul point de sélection** : `createEmbedder()` dans `rag/src/lib/config.ts` retourne
   `GeminiEmbedder`. Le futur `EMBEDDING_PROVIDER` se branchera **là**, un seul `switch`, **sans
   toucher au harnais ni au port MCP**. (⛔ on n'ajoute pas le `switch` multi-provider maintenant —
   juste le point d'entrée unique.)
6. *(optionnel)* `FakeEmbedder` déterministe + son test.

Après chaque pas vert : `npm test` (ou la commande de test du dossier `rag/`) doit passer ; commit
conventionnel.

---

## 6. Fichiers concernés

- `rag/src/lib/embedder.ts` — devient le port `Embedder` + `GeminiEmbedder` (extraction).
- `rag/src/lib/config.ts` — `EMBEDDING_MODEL`, `readGeminiKey` ; **ajouter** `createEmbedder()` (point
  de sélection unique).
- `rag/src/lib/vector-store.ts` — **ajouter** la table `index_meta` (stamp d'identité) + accès.
- `rag/src/lib/index-manager.ts` — chemin indexation (`embed?: typeof embedTexts` → injecter le port) ;
  **stampe** l'identité.
- `rag/src/tools/search-vault.ts` + `rag/src/index.ts` (l.50) — **consultent le garde** avant de
  chercher ; renvoient le signal « périmé » le cas échéant.
- `rag/src/tools/reindex.ts` — inchangé sur le principe : reste l'**action confirmée** (vérifier juste
  qu'un reindex `force` ré-stampe la nouvelle identité).
- `rag/src/lib/embedder.test.ts` — reformuler autour du port (filet anti-régression).

---

## 7. Hors scope (fidèle à « juste abstraire »)

- ❌ **Aucun 2ᵉ embedder réel** (Mistral / OpenAI / local-Ollama) — **discussion préalable avec
  Thomas** (décision §0.2).
- ❌ Pas de `switch` multi-provider ni de catalogue dans `createEmbedder()` — juste le point d'entrée.
- ❌ Pas de refonte de l'onboarding (`installer.mjs`, `scripts/verify-rag.mjs`, `scripts/lib/gemini-key.mjs`,
  `.env.example`, amorce `CLAUDE.md` étape 4) : ils supposent une **clé Gemini**. Un embedder local
  *sans clé* casserait ce flux → **à traiter le jour où une vraie 2ᵉ impl arrive**, pas ici.
- ❌ Dé-Gemini-iser les **défauts** du `UsageTracker` (timezone Pacifique, libellés « minuit
  Pacifique ») : dette notée, pas faite ici.

---

## 8. Provider-leak du contrat MCP — déjà propre ✅

L'ADR 0006 citait `vault_stats` « parle Quota Gemini ». **Vérifié le 2026-06-08 :** `rag/src/tools/vault-stats.ts`
ne sort que des termes **agnostiques** (Documents / Chunks / Par type), **zéro** quota Gemini. Le leak
résiduel est **interne au SPI** (commentaires, message d'erreur `DailyCapExceededError`,
`"google-rate-limit"` dans `index-manager.ts`), **pas dans les schémas d'outils MCP**. Le contrat
public exposé est déjà propre — rien à corriger côté port dans ce plan.

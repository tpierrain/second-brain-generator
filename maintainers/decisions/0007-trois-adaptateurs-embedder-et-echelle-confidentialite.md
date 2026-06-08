# ADR 0007 — Trois adaptateurs d'embedder (Gemini natif / compatible-OpenAI / local) + échelle de confidentialité

- **STATUT :** ACTÉ (2026-06-08) pour la **direction** (les trois adaptateurs + l'échelle de
  confidentialité). **Ouvert / différé :** le **défaut d'embedder à l'installation** (cf. §Questions
  ouvertes) — à trancher par Thomas (décision produit/UX).
- **Lié :** [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md)
  (cet ADR **concrétise** son SPI « embedder interchangeable » en nommant les adaptateurs visés),
  [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (le LLM qui répond reste
  Claude → borne la promesse de privacy).
- **Plan d'implémentation associé :** [`../plans/embedder-spi.md`](../plans/embedder-spi.md) (le port
  `Embedder` + l'estampille d'identité) — cet ADR **ouvre la « discussion préalable »** que son §0.2
  exigeait avant toute 2ᵉ impl concrète.
- **Étude / veille :** [`../plans/etude-rag-local-criteres-et-veille.md`](../plans/etude-rag-local-criteres-et-veille.md)
  (éventail de profils, veille embedders, échelle de confidentialité détaillée).

## Contexte

Demande de **Dimitry Ernot** : pouvoir utiliser **autre chose que Google Gemini**. Deux réalités
derrière ça : (a) le profil **gratuit + privé** (sortir d'une API cloud payante), et (b) le profil
**entreprise**, où les gens passent par un **OpenAI/Azure validé par leur boîte** (gouvernance des
données déjà tranchée à leur niveau) — pas par le service public central.

Aujourd'hui, l'embedder est **Gemini uniquement** (SDK natif Google, `rag/src/lib/embedder.ts` +
`config.ts`), et l'install **force** une clé Gemini dans `.env`. L'ADR 0006 a déjà acté que
l'embedder est un **SPI interchangeable** derrière un contrat MCP stable ; il restait à décider
**quels** adaptateurs on vise et **pourquoi**.

## Décision

### 1. Trois choix côté utilisateur, ~deux implémentations côté code

| # | Choix utilisateur | Implémentation |
|---|---|---|
| 1 | **Gemini** (l'existant) | `GeminiEmbedder` — **SDK natif Google**, conservé tel quel |
| 2 | **Endpoint API** (OpenAI public, **Azure OpenAI**, passerelle d'entreprise, **Mistral**…) | `OpenAiCompatibleEmbedder` — **un seul** adaptateur, **URL + clé configurables** |
| 3 | **Local** (EmbeddingGemma / bge-m3 via Ollama) | **rien de neuf** : l'adaptateur n°2 **pointé sur `http://localhost:11434/v1`** (Ollama expose l'API compatible-OpenAI), sans clé |

→ **3 options à proposer, mais potentiellement 2 seules impls à coder** (Gemini natif + compatible-
OpenAI). Le local **réutilise** l'adaptateur n°2 — moins de pièces mobiles, moins de bugs.

```
          ┌──────────────────────────────────────────────┐
          │   PORT  Embedder  (le contrat interne, UNIQUE) │
          │   • embedDocuments(textes) → vecteurs           │
          │   • embedQuery(texte)      → vecteur             │
          │   • identity (provider / modèle / dimension)    │
          └──────────────────────────────────────────────┘
                 ▲                ▲                ▲
                 │ implémente     │ implémente     │ (réutilise n°2)
        ┌────────┴─────┐  ┌───────┴─────────┐  ┌───┴───────────────┐
        │GeminiEmbedder│  │OpenAiCompatible │  │ LOCAL = n°2 pointé │
        │ = SDK Google │  │ Embedder        │  │ http://localhost…  │
        │  (l'ACTUEL)  │  │ URL + clé config│  │ (Ollama, sans clé) │
        └──────────────┘  │ OpenAI · Azure ·│  └────────────────────┘
                          │ passerelle ·    │
                          │ Mistral · …     │
                          └─────────────────┘

   Les CONSOMMATEURS (indexation via index-manager, recherche via search-vault)
   ne connaissent QUE le port → changer d'adaptateur ne touche ni eux, ni le
   contrat MCP (ADR 0006). Les spécificités fournisseur (taskType…) vivent
   DANS chaque adaptateur, sans fuiter dans le port.
```

### 2. On **garde** le `GeminiEmbedder` natif — on ne le remplace pas par du compatible-OpenAI

Pour de l'embedding « brut », SDK natif et porte compatible-OpenAI rendent la même chose (un
vecteur). Mais le **natif expose des boutons spécifiques** que la couche compatible-OpenAI aplatit —
surtout le **`taskType`** (encoder un *document* ≠ encoder une *question*, ce qui améliore la
pertinence), plus `outputDimensionality` et `title`. Remplacer le natif ne **gagne rien** pour Gemini
et **perdrait** ces réglages. Règle : **on parle à chaque fournisseur dans sa langue maternelle quand
on l'a déjà ; on utilise l'« espéranto compatible-OpenAI » pour tous ceux qu'on ne veut pas coder un
par un.**

### 3. L'adaptateur compatible-OpenAI est l'impl concrète **au plus fort levier**

L'API `/v1/embeddings` d'OpenAI étant le **standard de fait**, **un seul** adaptateur à URL
configurable couvre presque tout l'écosystème (OpenAI, Azure, passerelle interne, Mistral, Ollama
local). On change de backend **en changeant une URL dans `.env`**, sans une ligne de code en plus.
C'est donc le **premier candidat** de 2ᵉ impl à implémenter (après le port `Embedder` du plan SPI).

**Jusqu'où va ce standard — l'enveloppe vs la lettre.** Ce qui a convergé, c'est l'**enveloppe** :
requête `{ model, input }` → réponse `{ data: [{ embedding: [...] }] }`. C'est *ça* qui rend
l'adaptateur unique possible. Restent **non** standardisés : (a) les **réglages fins** propres à un
fournisseur (p. ex. le « type de tâche » document-vs-requête de Gemini/Cohere), accessibles seulement
via le SDK natif → **justifie de garder l'adaptateur Gemini natif** (§2) ; (b) le **contenu** des
vecteurs, propre à chaque modèle → **non interchangeable**, d'où le réindex obligatoire au swap (§5).
Autrement dit : **on standardise *comment on se parle*, pas *ce que les nombres veulent dire*.**

### 4. La confidentialité est une propriété de l'**endpoint + du palier**, pas du code

L'adaptateur est de la **tuyauterie neutre**. Le niveau de privacy est décidé par où on le pointe et
sous quel plan. On **documente l'échelle de confidentialité** (détail dans l'étude) :

```
🟢 1. LOCAL (EmbeddingGemma/bge-m3) ── rien ne sort. Gratuit. Privacy max.
🟢 2. Azure OpenAI / passerelle boîte ─ sort mais reste dans le tenant, 0 entraînement, contractuel.
🟡 3. OpenAI API ──────────────────── sort, 0 entraînement par défaut, rétention ~30 j.
🟡 4. Mistral payant (UE) ──────────── sort, 0 entraînement, hébergé UE (RGPD).
🔴 5. N'IMPORTE QUEL palier GRATUIT ── ⚠️ souvent exploité (Gemini gratuit inclus → payer = passe ~3).
```

Deux vérités à ne pas survendre : **« pas d'entraînement » ≠ « ça ne quitte pas la machine »** (seul
le local ne sort pas) ; et **le LLM qui répond reste Claude** (ADR 0004) — la privacy locale ne
concerne **que** le RAG (embeddings + index + recherche).

### 5. Au swap d'embedder : la base reste, les vecteurs non

Quel que soit l'adaptateur, le **stockage est le même** (SQLite, mêmes tables) et les **notes ne
bougent jamais**. Mais les **vecteurs ne sont JAMAIS réutilisables** d'un embedder à l'autre (espaces
différents, **même à dimension égale**) → **réindex obligatoire** au swap. C'est l'estampille
d'identité du plan SPI qui le détecte et déclenche le **confirm-gate** (addendum ADR 0006) ;
l'estampille garde sur **provider + modèle + dimension** (pas la seule dimension, qui serait un
piège).

## Conséquences

- **Réponse directe et complète à Dimitry** : profil entreprise (Azure/passerelle) et profil
  gratuit+privé (local) couverts par le même mécanisme, sans toucher au harnais ni au contrat MCP.
- **Un seul adaptateur neuf** (`OpenAiCompatibleEmbedder`) débloque OpenAI + Azure + Mistral + local
  → effort minimal, surface de bug minimale (fidèle à « pas de sur-ingénierie »).
- **Argumentaire d'install clair** : l'échelle de confidentialité dit, en une ligne par option, quelle
  promesse on tient (et laquelle on **ne** tient pas).
- **Coûte** : maintenir une 2ᵉ voie d'auth/erreurs (clé + URL configurables, codes d'erreur OpenAI) et
  rester discipliné sur le provider-leak hors des schémas MCP (déjà propre, cf. ADR 0006 §8).

### Exigence pédagogique (capitaliser sur ce qui a déjà fait ses preuves)

Offrir trois adaptateurs **n'a de valeur que si le choix est rendu limpide** pour un non-dev. Les
**artefacts pédagogiques validés en conversation avec Thomas** (jugés « vraiment très clairs ») sont
des **livrables de premier rang**, pas de la déco, et doivent être **réutilisés** partout où
l'utilisateur rencontre ce choix (doc d'install, message de confirm-gate, futur explainer
utilisateur) :

1. **« Embedder ≠ LLM de chat »** + tableau disque/RAM/GPU + verdict « réaliste sur un laptop banal »
   (étude §1.3) — dégonfle la peur « faire tourner ChatGPT chez moi ».
2. **L'échelle de confidentialité par fournisseur** (étude § cadrage privacy) — une ligne par option :
   ce que la promesse tient, et ce qu'elle ne tient pas.
3. **Le tableau « réutilisable au swap ou pas »** (étude §2) — rassure : *tes notes ne sont jamais
   perdues, on ré-encode, ça prend quelques minutes.*

Règle : **toujours expliquer avec un tableau/échelle concret + un verdict en une phrase**, jamais en
jargon. C'est le registre qui a marché ; on le standardise pour le RAG.

## Questions ouvertes (NON tranchées ici — décision produit/UX de Thomas)

1. **Défaut d'embedder à l'installation.** Aujourd'hui l'install force une clé Gemini. Or l'install la
   plus *simple* pourrait être **tout-local par défaut** (zéro clé, zéro cloud, zéro piège « gratuit
   exploité »). **Tension réelle :**
   - *Pour le tout-local* : pas de clé, privacy max, gratuit, pas de dépendance cloud.
   - *Contre, pour un vrai non-dev (« Mac nu d'Achille »)* : exige **Ollama installé + modèle pull**
     (~0,3–1,2 Go) → une **nouvelle dépendance native** à gérer (échos des leçons `run-node` /
     PATH desktop nu). « Coller une clé » peut rester *mécaniquement* plus simple — mais traîne le
     palier payant + le caveat cloud.
   - **Pistes :** (A) défaut unique simple + swap via `.env` après coup ; (B) mini-question seulement
     pour le cas entreprise ; (C) choix explicite à 3 à l'install (plus de friction). **Penchant
     non engageant : A + B.** ⚠️ À confronter à la règle « install toujours générique, le moins de
     questions possible » du `CLAUDE.md`. **Non tranché.**
2. **Local : via l'adaptateur n°2 (localhost) ou un adaptateur Ollama natif ?** Détail
   d'implémentation ; penchant = **réutiliser le n°2** (moins de code), à valider à l'usage.

## Alternatives écartées

- **Remplacer le `GeminiEmbedder` natif par du compatible-OpenAI** — ne gagne rien pour Gemini,
  **perd** le `taskType` et casse une voie éprouvée (canari). Refusé (§2).
- **Un adaptateur codé à la main par fournisseur** (OpenAI, Azure, Mistral séparés) — inutile :
  le dialecte OpenAI est le standard de fait, un seul adaptateur à URL configurable suffit. Refusé.
- **Imposer un choix de fournisseur à chaque non-dev à l'install** — friction, et frotte avec la
  philosophie d'install générique. Écarté comme *défaut* (reste l'option C, ouverte).

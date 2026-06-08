# ADR 0006 — Le serveur MCP du RAG est un contrat d'interface stable

- **STATUT :** ACTÉ (2026-06-06).
- **Lié :** [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (renforce
  son invariant « serveur RAG = MCP standard, sans dépendance à une API propriétaire »),
  [`0003-pas-upgrade-capacites-cerveaux.md`](0003-pas-upgrade-capacites-cerveaux.md) (tension
  examinée ci-dessous), [`0005-support-onglet-code-desktop.md`](0005-support-onglet-code-desktop.md).
- **Plan d'implémentation associé :** [`../plans/archived/onglet-code-desktop.md`](../plans/archived/onglet-code-desktop.md) (§8).

## Contexte

Le RAG a d'abord **émergé dans le vrai second cerveau local de Thomas**, puis a été **généralisé
dans le générateur**. Il va **continuer de s'améliorer** — et Thomas anticipe de vouloir **changer
de techno** : sortir de Google/Gemini (confidentialité, coût, lock-in), passer **100 % local**
(Ollama / embeddings open-source), changer de vector store, de stratégie de chunking, etc.

Or **l'interface MCP du RAG (les outils exposés) est, elle, plutôt stable.** Tout le harnais des
utilisateurs en dépend : `CLAUDE.md`, skills, `sync-sources` consomment les **outils MCP**, pas la
techno derrière. Sans décision explicite, rien n'empêche du provider-specific de fuiter dans cette
surface (c'est déjà le cas : `vault_stats` parle « quota Gemini ») et de **re-coupler** ce qui est
déjà agnostique.

## Cadrage architecture hexagonale

Le serveur `vault-rag` est un **hexagone** :

- **Port API (contrat public, STABLE)** = les **outils MCP** exposés et leurs schémas d'entrée/
  sortie : `search_vault`, `get_document`, `list_documents`, `vault_stats`, `reindex` (liste à
  figer/versionner). C'est **tout** ce dont dépend le harnais des gens.
- **SPI / adaptateurs (détails internes, INTERCHANGEABLES)** = moteur d'embeddings (Gemini
  aujourd'hui, via `EMBEDDING_MODEL` dans `rag/src/lib/config.ts` + `embedder.ts` — **déjà
  partiellement modulaire**), vector store (SQLite / `better-sqlite3`), stratégie de chunking,
  garde-fous quota.

## Décision

**La surface MCP du RAG (noms d'outils + schémas I/O) est un contrat public stable, versionné.**

- Tout changement de ce contrat est un **breaking change explicite** (versionnement / migration
  annoncée), jamais un effet de bord d'un refactor interne.
- Ce qui est **derrière le port** (embedder, vector store, chunking, garde-fous quota) est
  **librement remplaçable** sans toucher au harnais. L'utilisateur choisit via `.env`
  (`EMBEDDING_MODEL` / équivalent).
- **Aucun vocabulaire provider-specific ne doit fuiter dans le contrat.** Action actée :
  généraliser `vault_stats` — sortir « Quota Gemini X/7600 », « réserve 50 » au profit de termes
  **agnostiques** (« budget d'embeddings », « requêtes restantes »), pour qu'un embedder **local
  sans quota** satisfasse le contrat sans incohérence (il renverrait p. ex. « illimité / N/A »).

## Conséquences

- **Changer d'adaptateur ne casse jamais un cerveau déjà déployé.** Gemini → local/Ollama,
  SQLite → autre store : au pire l'utilisateur **ré-indexe**. Son harnais (skills, constitution)
  ne bouge pas. C'est ce qui rend l'amélioration continue du RAG **sûre** pour les gens.
- **Renforce 0004 :** garde la porte cross-platform ouverte à faible coût (un contrat MCP propre,
  sans provider-leak, est consommable par tout client MCP-capable).
- **Discipline de design imposée :** toute évolution du RAG se pose la question « est-ce que ça
  touche le port (→ breaking, versionné) ou seulement le SPI (→ libre) ? ». Le provider-leak de
  `vault_stats` devient une **dette à corriger**, pas une fatalité.
- **Coûte un peu de rigueur :** il faut résister à exposer un détail pratique mais spécifique (un
  champ « modèle Gemini », un code d'erreur SQLite) directement dans un outil MCP.

## Tension avec l'ADR 0003 — examinée et tranchée

L'ADR 0003 acte qu'on **ne propage pas** d'upgrade de capacités vers les cerveaux déjà générés
(ils sont figés à l'install). **Aucune contradiction avec le présent ADR**, qui ne parle que de
**stabilité d'interface**, pas de distribution :

- 0006 dit : *le port MCP est stable, le SPI est swappable* → un utilisateur peut changer son
  embedder **dans son propre cerveau** (geste local, via `.env`), exactement l'esprit « itération
  locale » de 0003. Aucun canal de propagation amont n'est créé.
- Les deux ADR sont donc **complémentaires** : 0003 = pas de flotte synchronisée ; 0006 = quand un
  cerveau évolue (localement, ou via une régénération), l'interface ne casse pas sous lui.

**Ce qui frotterait avec 0003 est scopé DEHORS de cet ADR** : l'idée sœur « packager le RAG comme
**composant partagé et upgradable** » (potentiellement publié/versionné). Le contrat MCP stable en
est le **préalable** (extractabilité hexagonale), mais un composant *partagé upgradable*
réintroduirait un canal de propagation que 0003 a justement écarté. **Décision différée, à
remonter à Thomas** : soit le packaging respecte 0003 (chaque cerveau garde SA copie figée, mise à
jour = geste explicite opt-in non destructif), soit ça demande un addendum à 0003. **On ne tranche
pas ici.**

## Addendum (2026-06-08) — Swap d'embedder = confirm-gate, jamais de réindex silencieux

Précision actée avec Thomas en concrétisant cet ADR (plan
[`../plans/embedder-spi.md`](../plans/embedder-spi.md)) : **comment** un cerveau déjà déployé
réagit quand son embedder change (le « au pire l'utilisateur ré-indexe » ci-dessus).

**Constat technique :** l'index stocke les vecteurs en BLOB `Float32` brut **sans aucune trace du
modèle qui les a produits** (ni provider, ni modèle, ni **dimension**). Comme chaque embedder a sa
dimension propre (Gemini ≈ 3072, Mistral 1024, local ~768), un swap **sans** réindex rend la
recherche **silencieusement fausse** (comparaison de vecteurs de dimensions incompatibles). Rien ne
le détecte aujourd'hui.

**Décision :**

1. **L'index est estampillé** d'une **identité d'embedder** (`providerId` / `model` / `dimension`).
2. Au moment d'une recherche, si l'identité courante **diffère** de celle stampée (ou est absente),
   le RAG **ne renvoie pas de résultats faux** : il remonte un **signal « index périmé »**.
3. **Confirm-gate en langage naturel, jamais de réindex dans le dos.** Claude **explique** à
   l'utilisateur que la config de recherche a changé, qu'il faut **ré-indexer les documents**
   (inchangés — juste ré-encodés), que **ça prend un peu de temps**, et **attend une confirmation
   explicite**. **Par défaut : on ne réindexe rien** (« on ne va pas indexer pour rien »).
4. **Aucune nouvelle surface MCP :** le signal passe par le retour de `search_vault`, et le réindex
   par l'outil `reindex` existant — **appelé seulement après le « oui »**. Le port MCP reste donc le
   contrat stable de cet ADR (zéro breaking change, zéro provider-leak dans les schémas ; le message
   nomme les modèles **dynamiquement** via l'identité, rien codé en dur « Gemini »).

C'est l'application directe de la posture **fail-loud + opt-in budget** du projet (cf. ADR 0005
révisé) : un refus explicite et actionnable plutôt qu'une recherche qui ment, et jamais de
consommation de budget d'embeddings sans accord humain.

## Alternatives écartées

- **Coupler le harnais directement à Gemini / au schéma SQLite** (rapide à court terme) — re-couple
  ce qui est déjà agnostique, casse l'invariant 0004 et interdit le passage en local. Refusé.
- **Laisser le provider-leak dans `vault_stats`** (« ça marche aujourd'hui ») — piège : le premier
  embedder local sans quota rendrait l'outil incohérent. Corrigé par la généralisation actée.
- **Figer aussi le SPI** (vector store / embedder gravés) — tuerait précisément la liberté
  d'évolution qui motive cet ADR. Refusé.

# 0002 — Démarrage MCP non-bloquant (transport d'abord, reindex en fond)

- **Statut** : Accepté
- **Date** : 2026-05-31 (formalisation rétroactive d'une décision déjà en place)

## Contexte

Le serveur MCP `vault-rag` se lance à chaque ouverture de session Claude Code.
Une version antérieure lançait l'auto-reindex **avant** d'ouvrir le transport stdio :
le handshake MCP arrivait trop tard → Claude Code marquait le serveur « failed »
(timeout) alors qu'il finissait juste d'indexer. De plus, une erreur d'embedding
(quota) pendant ce reindex tuait le process au démarrage.

## Décision

Dans `index.ts:main` (mode serveur) : **ouvrir le transport stdio d'abord**
(`server.connect`), logguer « running », **puis** lancer l'auto-reindex incrémental
en tâche de fond (`reindex(false)` non awaité). Le `.catch` du reindex logue l'échec
sans tuer le serveur. Les recherches fonctionnent pendant le reindex (SQLite WAL).

## Conséquences

- Handshake instantané → plus de « failed » au démarrage.
- Un mur quota ou une erreur d'embedding au démarrage est **non fatal** : le serveur
  reste debout et interrogeable.
- **Invariant à ne pas violer** : ne jamais `await` le reindex avant `server.connect`,
  et ne jamais laisser une erreur du reindex de démarrage remonter non catchée. Un
  « nettoyage » de `main()` qui re-séquence ça réintroduit le timeout et la fragilité.

## Alternatives écartées

- **Reindex synchrone au boot** — simple à lire mais rend le démarrage fragile et lent.
- **Pas de reindex au démarrage du tout** — l'index dériverait du vault ; on veut la
  convergence-par-session (cf. [0003](0003-pas-de-daemon-session-declencheur.md)).

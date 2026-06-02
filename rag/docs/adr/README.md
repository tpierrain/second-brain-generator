# Architecture Decision Records — RAG vault

Décisions d'architecture du moteur RAG (`rag/`). **Près du code**, versionnées avec
lui : un dev qui touche le RAG doit voir ces décisions sans ouvrir le vault Obsidian.

> À ne pas confondre avec `vault/decisions/` — celui-là est pour le contenu du second
> cerveau (stratégie, management). Ici : décisions **techniques** du moteur.

## Format

MADR-lite : **Contexte / Décision / Conséquences / Statut**. Court (~15-25 lignes).
Pas de cérémonie. Numérotation `NNNN-titre-kebab.md`, incrémentale, jamais réutilisée.

## Règle de vie

**Toute nouvelle décision d'architecture → un ADR dans le même commit que le code.**
Une décision n'est pas « prise » tant qu'elle n'est pas écrite ici. On ne réécrit pas
un ADR passé : si on change d'avis, on en crée un nouveau qui *supersède* l'ancien
(statut `Superseded by NNNN`).

## Index

| # | Titre | Statut |
|---|---|---|
| [0001](0001-atomicite-document-hash-chunks.md) | Atomicité d'indexation par document (hash ⇔ chunks) | Accepté |
| [0002](0002-demarrage-mcp-non-bloquant.md) | Démarrage MCP non-bloquant (transport d'abord, reindex en fond) | Accepté |
| [0003](0003-pas-de-daemon-session-declencheur.md) | Pas de daemon — la session est le déclencheur | Accepté |

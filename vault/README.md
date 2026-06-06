# vault/ — Ton contenu

C'est ici que vivent **tes notes** : c'est le substrat que le RAG indexe et que Claude
interroge. Tout est en Markdown, compatible Obsidian.

> Les notes ci-dessous (`daily/`, `people/`, `topics/`…) tournent autour d'une **entreprise
> parodique inventée** (Flemmr, qui « industrialise la procrastination ») — volontairement
> **impossibles à confondre** avec de vraies notes de travail. Elles servent juste à voir comment
> ça marche dès la 1re question. Supprime-les quand tu commences ton vrai vault (efface les fichiers
> de `vault/`) — ou garde-les comme gabarits.

## Dossiers

| Dossier | Pour quoi | Édition |
|---|---|---|
| `daily/` | Note du jour, une par jour (`YYYY-MM-DD.md`) | **Append-only** — jamais éditée a posteriori |
| `people/` | Une fiche par personne (`prenom-nom.md`) | Vivante — on append des sections datées |
| `topics/` | Une fiche par sujet (`sujet-kebab.md`) | Vivante |
| `decisions/` | Une décision = un fichier (`YYYY-MM-DD-titre.md`) | Immuable (on supersède, on ne réécrit pas) |
| `meetings/` | Comptes-rendus (`YYYY-MM-DD-titre.md`) | Immuable |
| `backlog/` | Listes d'actions ouvertes/fermées | Vivante (on coche, on n'efface pas) |

Ajoute les dossiers dont tu as besoin — la structure est libre, le RAG indexe tout `.md`.

## Workflow

1. Tu écris / Claude écrit des notes ici.
2. Le RAG les indexe (auto au démarrage, ou `cd rag && npm run reindex`).
3. Tu poses des questions → Claude répond depuis le vault, sources citées en `[[backlinks]]`.

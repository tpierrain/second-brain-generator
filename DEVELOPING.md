# DEVELOPING — contexte pour bosser sur le starter lui-même

> Ce fichier s'adresse à **celui qui développe le template** (toi + Claude), pas à
> l'utilisateur final. Lis-le en début de session de dev pour avoir le contexte.

## Objectif du projet

`second-brain-starter` est un **template installable** d'un second cerveau : un vault
Markdown versionné qu'un agent Claude Code interroge en langage naturel via un moteur RAG.
Extrait d'un second cerveau personnel pour être réutilisable par n'importe qui.

**Principe directeur** : livrer un *starter*, pas un cerveau tout fait. Le moteur est prêt ;
le harnais est un template que l'utilisateur adapte. Rester **générique et neutre** — aucune
donnée perso, aucun nom d'entreprise, aucun nom de personne réel.

## Architecture en 3 couches

- 🟢 **Moteur** (`rag/`) — MCP server TypeScript : chunking, embeddings Gemini, recherche
  sémantique, garde-fous quota, lock single-writer. Générique. Tests : `cd rag && npm test`
  (doit rester vert), typecheck : `cd rag && npx tsc --noEmit`.
- 🟡 **Harnais** — fichiers `*.template` (`CLAUDE.md.template`, `.mcp.json.template`,
  `.claude/settings.json.template`) + skills génériques (`sync`, `improve`) +
  `.claude/skills/EXAMPLES.md`. Le bootstrap génère les fichiers réels à partir des templates.
- 🟢 **Onboarding** — `bootstrap.mjs` (installateur foolproof, Node pur → multi-OS), `vault/`
  d'exemple, `README.md`, `SETUP.md`. Les hooks (`scripts/session-status.mjs`,
  `scripts/auto-commit.mjs`) sont aussi en Node → pas de dépendance bash/jq/sqlite3, marche sur
  macOS / Linux / Windows.

## Règles de dev

1. **Commits manuels.** Pas de hook auto-commit dans ce repo (il n'existe que dans
   `.claude/settings.json.template`, généré côté utilisateur). Après une avancée :
   `git add -A && git commit -m "..." && git push`.
2. **Neutralité.** Avant tout commit, vérifier l'absence de fuite :
   `grep -rniE "<noms/entreprises à exclure>" .` doit sortir vide. Pas de chemin absolu en dur
   (sauf placeholders `{{PROJECT_ROOT}}` dans les templates).
3. **Fichiers générés non versionnés.** `.mcp.json`, `.claude/settings.json`, `.env`,
   `rag/.cache/`, `node_modules/` sont gitignorés. Ne pas les committer.
   Ne **pas** ajouter de `CLAUDE.md` à la racine : il entrerait en conflit avec le bootstrap
   (qui refuse d'écraser un `CLAUDE.md` existant) → l'utilisateur n'aurait pas le sien.
4. **Tester le bootstrap dans une copie jetable** (jamais en place), pour ne pas polluer le
   template avec des fichiers générés / `node_modules` :
   ```bash
   # stdin non-TTY → bootstrap part en mode non-interactif (valeurs par défaut)
   cp -R . /tmp/sbs-test && cd /tmp/sbs-test && node bootstrap.mjs < /dev/null
   ```
5. **Garder le moteur synchronisable** avec le second cerveau source : `rag/` est resté quasi
   identique à l'original → les correctifs peuvent être rapatriés dans un sens ou l'autre.
6. **TDD strict sur tout le code — moteur ET harnais.** Discipline détaillée et actionnable
   dans la skill **`tdd-discipline`** (`.claude/skills/tdd-discipline/`, chargée dès qu'on écrit
   du code) : baby-steps, fail-first, triangulation, refactor obligatoire. Elle s'applique à
   **toute la logique du repo**, pas seulement au moteur :
   - **Moteur RAG** (`rag/`) : tests `rag/src/lib/*.test.ts`, suite verte `cd rag && npm test`
     + typecheck `cd rag && npx tsc --noEmit`.
   - **Harnais / bootstrap** (`bootstrap.mjs`, `scripts/lib/*.mjs`) : tests
     `scripts/lib/*.test.mjs`, suite verte `node --test scripts/lib/*.test.mjs`.

   Chaque évolution se fait en **red → green → refactor** : écrire d'abord le test qui échoue,
   le voir rouge pour la bonne raison, puis le minimum de code pour le verdir, puis refactor à
   vert. Exception assumée et **signalée explicitement** : le purement mécanique/non testable
   unitairement (renommage, message, config triviale, intégration réseau Gemini) — pas de test
   artificiel juste pour la forme.

## Pistes d'amélioration (backlog informel)

- ~~Connecteurs externes optionnels (Slack/Drive/Notion)~~ ✅ livré : wizard guidé à l'étape
  5/8 du bootstrap (catalogue `scripts/lib/connectors-catalog.mjs` + merge idempotent
  `connectors-merge.mjs`/`connectors-apply.mjs`), doc `SETUP.md §6`. Suite : enrichir le
  catalogue (plus de connecteurs MCP communautaires) au fil des besoins.
- Bootstrap : option `--non-interactive` avec fichier de réponses (pour CI / re-provisioning).
- Internationalisation : les templates sont en français. Prévoir une variante EN ?
- Skills d'exemple réellement fonctionnels (un `prepare-meeting` générique branché Calendar).

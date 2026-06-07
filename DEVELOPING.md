# DEVELOPING — contexte pour bosser sur le générateur lui-même

> Ce fichier s'adresse à **celui qui développe le template** (toi + Claude), pas à
> l'utilisateur final. Lis-le en début de session de dev pour avoir le contexte.

## Objectif du projet

`second-brain-generator` est un **template installable** d'un second cerveau : un vault
Markdown versionné qu'un agent Claude Code interroge en langage naturel via un moteur RAG.
Extrait d'un second cerveau personnel pour être réutilisable par n'importe qui.

**Principe directeur** : livrer un *générateur*, pas un cerveau tout fait. Le moteur est prêt ;
le harnais est un template que l'utilisateur adapte. Rester **générique et neutre** — aucune
donnée perso, aucun nom d'entreprise, aucun nom de personne réel.

## Architecture en 3 couches

- 🟢 **Moteur** (`rag/`) — MCP server TypeScript : chunking, embeddings Gemini, recherche
  sémantique, garde-fous quota, lock single-writer. Générique. Tests : `cd rag && npm test`
  (doit rester vert), typecheck : `cd rag && npx tsc --noEmit`.
- 🟡 **Harnais** — fichiers `*.template` (`CLAUDE.md.template`, `.mcp.json.template`,
  `.claude/settings.json.template`) + skills génériques (`sync`, `improve`) +
  `.claude/skills/EXAMPLES.md`. L'installeur génère les fichiers réels à partir des templates.
- 🟢 **Onboarding** — `installer.mjs` (installateur foolproof, Node pur → multi-OS), `vault/`
  d'exemple, `README.md`, `SETUP.md`. Les hooks (`scripts/session-status.mjs`,
  `scripts/auto-commit.mjs`) sont aussi en Node → pas de dépendance bash/jq/sqlite3, marche sur
  macOS / Linux / Windows.

> 📁 **`maintainers/`** — contexte de dev versionné (décisions/ADR, plans), **synchronisé entre
> les machines du mainteneur** mais **jamais livré** à l'utilisateur (exclu de la copie d'install
> via `filterCopyable`, non auto-chargé par Claude). Voir [`maintainers/README.md`](maintainers/README.md).
> C'est là que vit l'historique de décision — ce dossier remplace l'ancienne « mémoire » Claude,
> qui n'était pas portable entre laptops.

### Note de design — onboarding piloté par Claude

Deux chemins d'install coexistent (README « Option A / B ») : **manuel** (`node installer.mjs`
interactif) et **assisté par Claude** (une instruction en langage naturel). Le principe directeur
du chemin assisté est le **déterminisme** : tout ce qui est mécanique + critique + répétable reste
**dans le script** (génération, `git init`, install RAG, smoke-test auto-jugé) ; **Claude n'est
qu'un emballage conversationnel** — il récolte les réponses en chat, appelle **une seule commande**
`--non-interactive`, relaie le verdict du script, puis gère les 3 consignes finales (clé `.env`,
dépôt distant, redémarrage). On ne confie **pas** la séquence d'install à Claude. L'amorce
`CLAUDE.md` (marqueur `installer-stub`) porte ce runbook ; `scripts/lib/installer-args.mjs`
(`parseAnswers`, `resolveTargetDir`) et `scripts/lib/tracked-files.mjs` (`parseLsFilesZ`,
`filterCopyable`) en sont les briques pures testées.

### Note de design — hooks via `run-node.*` (PATH minimal de l'app desktop)

L'onglet Code de Claude Desktop lance les **hooks** (et les serveurs MCP) dans un shell
**non-interactif à PATH minimal** — mesuré sur un Mac nu : `PATH=/usr/local/bin`, sans les shims
`nvm`/`asdf` ni `/opt/homebrew/bin`. Si `node` a été installé via **nvm** ou Homebrew, il est alors
**introuvable** : un hook qui appelle `node …` en direct **échoue EN SILENCE**. Le plus grave —
l'**auto-commit** ne tourne jamais → les notes s'écrivent sur disque mais ne sont jamais versionnées
(la promesse centrale, cassée sans bruit). C'est l'anti-pattern « échec silencieux » que le projet
combat.

**Fix.** Les 3 commandes de hook de `.claude/settings.json.template` passent par `{{NODE}}` (résolu
par l'installeur selon l'OS) au lieu de `node` en direct → un lanceur **self-heal** `scripts/run-node.*`
qui rejoue le même prepend PATH éprouvé que le serveur RAG (`scripts/lib/rag-launcher.mjs`,
`buildNodeRunnerSh/Cmd`), puis `exec node "$@"`. Portable, **aucun chemin machine baké** (on ne
prepende que les dossiers existants, glob nvm inclus). L'installeur **smoke-teste** `run-node` à
l'install (`-e "process.exit(0)"`) : un échec = **install bruyante** (sortie non-zéro), pas un warning.
En complément, `scripts/session-status.mjs` **crie au démarrage** (via `scripts/lib/repo-status.mjs`)
si des notes du vault sont restées **non committées** — transformant un futur échec d'auto-commit en
alerte visible plutôt qu'en silence.

**Smoke-test en PATH appauvri (preuve réelle, pas faux positif).** Le smoke-test ne lance plus
`run-node` avec le PATH riche du shell d'install (où `node` est toujours trouvable → il ne testait
en fait que « node existe quelque part ? »). Il passe désormais par `minimalPathEnv(platform, env)`
(`scripts/lib/rag-launcher.mjs`) qui **neutralise le PATH** (posix : `""` ; Windows : juste
`System32` pour garder `cmd.exe`) tout en préservant `HOME`/`LOCALAPPDATA`/etc. dont le self-heal a
besoin. On prouve ainsi, **à l'install et en conditions réelles d'app desktop**, que le wrapper SEUL
retrouve node — et un gestionnaire **non couvert** échoue **bruyamment et tôt** (message actionnable
listant les emplacements pris en charge) plutôt qu'en silence au runtime. La **couverture** du
self-heal est une **liste curée** (POSIX : `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, asdf,
nvm, volta, nodenv, fnm Linux+macOS ; Windows : nodejs, npm, Volta, `NVM_SYMLINK`) — pas une
énumération exhaustive : le smoke-test appauvri est le **filet** pour tout le reste.

## Règles de dev

1. **Commits manuels.** Pas de hook auto-commit dans ce repo (il n'existe que dans
   `.claude/settings.json.template`, généré côté utilisateur). Après une avancée :
   `git add -A && git commit -m "..." && git push`.
2. **Neutralité.** Avant tout commit, vérifier l'absence de fuite :
   `grep -rniE "<noms/entreprises à exclure>" .` doit sortir vide. Pas de chemin absolu en dur
   (sauf placeholders `{{PROJECT_ROOT}}` dans les templates).
   **Exception assumée — Thomas Pierrain (`tpierrain`) lui-même.** La règle interdit les noms de
   **tiers** (collègues, clients, employeurs), mais **pas** le propriétaire du repo et auteur de
   la méthode : ce repo public sert aussi de **personal branding**. Citer « Thomas Pierrain » /
   `@tpierrain` et ses articles Medium (série « second cerveau ») est **voulu**, pas une fuite —
   ne pas les générifier ni les retirer (README en particulier).
3. **Fichiers générés non versionnés.** `.mcp.json`, `.claude/settings.json`, `.env`,
   `rag/.cache/`, `node_modules/` sont gitignorés. Ne pas les committer.
   **Exception — le `CLAUDE.md` « amorce ».** Un `CLAUDE.md` **est** livré à la racine, mais c'est
   une **amorce de pré-installation** : elle porte le marqueur `<!-- second-brain-generator:installer-stub -->`
   et signale à Claude que le repo n'est pas encore installé (→ guide l'utilisateur vers
   `node installer.mjs`). L'installeur la **remplace** par le vrai `CLAUDE.md` personnalisé : la
   détection est dans `scripts/lib/claude-md.mjs` (`isInstallerStub`), branchée sur `gen()` dans
   `installer.mjs`. Un `CLAUDE.md` **sans** ce marqueur (= vraie constitution utilisateur) est
   toujours **préservé**. Donc : **ne supprime pas** cette amorce, et n'y touche que via le marqueur.
4. **Tester l'installeur dans une copie jetable** (jamais en place), pour ne pas polluer le
   template avec des fichiers générés / `node_modules` :
   ```bash
   # stdin non-TTY → l'installeur part en mode non-interactif (valeurs par défaut)
   cp -R . /tmp/sbg-test && cd /tmp/sbg-test && node installer.mjs < /dev/null
   ```
5. **Garder le moteur synchronisable** avec le second cerveau source : `rag/` est resté quasi
   identique à l'original → les correctifs peuvent être rapatriés dans un sens ou l'autre.
6. **TDD strict sur tout le code — moteur ET harnais.** Discipline détaillée et actionnable
   dans la skill **`tdd-discipline`** (`.claude/skills/tdd-discipline/`, chargée dès qu'on écrit
   du code) : baby-steps, fail-first, triangulation, refactor obligatoire. Elle s'applique à
   **toute la logique du repo**, pas seulement au moteur :
   - **Moteur RAG** (`rag/`) : tests `rag/src/lib/*.test.ts`, suite verte `cd rag && npm test`
     + typecheck `cd rag && npx tsc --noEmit`.
   - **Harnais / installeur** (`installer.mjs`, `scripts/lib/*.mjs`) : tests
     `scripts/lib/*.test.mjs`, suite verte `node --test scripts/lib/*.test.mjs`.

   Chaque évolution se fait en **red → green → refactor** : écrire d'abord le test qui échoue,
   le voir rouge pour la bonne raison, puis le minimum de code pour le verdir, puis refactor à
   vert. Exception assumée et **signalée explicitement** : le purement mécanique/non testable
   unitairement (renommage, message, config triviale, intégration réseau Gemini) — pas de test
   artificiel juste pour la forme.

## Pistes d'amélioration (backlog informel)

- ~~Connecteurs externes optionnels (Slack/Drive/Notion)~~ ✅ livré : wizard guidé à l'étape
  5/8 de l'installeur (catalogue `scripts/lib/connectors-catalog.mjs` + merge idempotent
  `connectors-merge.mjs`/`connectors-apply.mjs`), doc `SETUP.md §6`. Suite : enrichir le
  catalogue (plus de connecteurs MCP communautaires) au fil des besoins.
- **Embedder local (mode 100 % privé)** : permettre de remplacer Gemini par un modèle
  d'embeddings local (Ollama / open-source) via `EMBEDDING_MODEL` (`rag/src/lib/config.ts` +
  `embedder.ts`), pour que rien ne sorte de la machine. Aujourd'hui seulement documenté
  (README/SETUP §9 : palier payant Gemini = données hors entraînement).
- ~~Installeur : option `--non-interactive`~~ ✅ livré : `parseAnswers` (`scripts/lib/installer-args.mjs`)
  → flags `--name/--owner/--lang` (+ env `SB_*`, précédence flag > env > défaut),
  `--non-interactive`/`--yes`/`--no-input` ; **jamais la clé Gemini** (différée en `.env`).
  L'installeur CRÉE le dossier cerveau (TARGET, cf. `resolveTargetDir`/`--dest`) et y fait un `git init`
  trivial (dossier neuf, 0 remote). Doc : `SETUP.md §2`. Suite : variante avec fichier de réponses
  si besoin CI / re-provisioning.
- Internationalisation : les templates sont en français. Prévoir une variante EN ?
- Skills d'exemple réellement fonctionnels (un `prepare-meeting` générique branché Calendar).

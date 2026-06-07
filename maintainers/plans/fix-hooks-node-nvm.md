# Plan — Fix : hooks muets quand `node` vient de nvm (PATH minimal)

> **État : À EXÉCUTER** (plan validé, code non commencé). Document auto-suffisant :
> il contient tout le contexte nécessaire pour exécuter dans une session neuve.
> Discipline : **TDD baby-steps** (skill `tdd-discipline`) — un test à la fois,
> red→green→refactor. Le launcher est un outil Node/JS (pas un back-end Hive).

## Origine (feedback terrain — Mac nu d'Achille, 2026-06-07)

Installation testée sur un Mac vierge (compte `ap`). Parcours d'install nominal OK
(Node installé via **nvm**, bootstrap non-interactif, cerveau créé, canari RAG OK,
nettoyage démo OK, backup GitHub privé OK). **MAIS** découverte d'un bug majeur :

### Cause racine (confirmée)
L'app Claude Desktop (onglet Code) lance les **hooks** dans un shell
**non-interactif à PATH minimal** (mesuré : `PATH=/usr/local/bin`, sans les shims
nvm/asdf ni `/opt/homebrew/bin`). Or les 3 hooks appellent `node …` **en direct** :

- `.claude/settings.json.template` l.42 — `statusLine` → `node "…/scripts/status-line.mjs"`
- l.52 — `PostToolUse Write|Edit` → `node "…/scripts/auto-commit.mjs"`
- l.64 — `SessionStart` → `node "…/scripts/session-status.mjs"`

Si `node` vient de nvm/Homebrew, il est **introuvable** dans ce PATH minimal → les 3
hooks **échouent EN SILENCE**. Le plus grave : **l'auto-commit ne tourne jamais** →
les notes s'écrivent mais ne se committent pas (promesse centrale cassée, sans bruit).
C'est exactement l'anti-pattern « échec silencieux » que le projet combat.

### La solution existe déjà à 80 % dans le codebase
`scripts/lib/rag-launcher.mjs` résout **déjà cette même cause racine** pour le serveur
MCP RAG : `rag/launch.sh` (généré par le bootstrap) prepend les emplacements node
usuels au PATH **avant** de lancer le serveur. Extrait (sh) :
```sh
add() { [ -d "$1" ] && PATH="$1:$PATH"; }
add /usr/local/bin
add /opt/homebrew/bin
add "$HOME/.asdf/shims"
for d in "$HOME"/.nvm/versions/node/*/bin; do add "$d"; done
export PATH
exec npx tsx rag/src/index.ts
```
Portable, **aucun chemin machine baké** (prepend uniquement les dossiers existants),
glob nvm inclus. Le `.cmd` Windows fait l'équivalent (`buildCmdLauncher`).
`applyRagLauncher(mcp, platform)` recâble `.mcp.json` vers `/bin/sh rag/launch.sh`
(posix) ou `cmd /c rag\launch.cmd` (win32).

> **Le fix = généraliser ce mécanisme éprouvé aux hooks**, PAS inventer un wrapper
> ad-hoc. (Un cerveau de test avait improvisé un `run-node.sh` ad-hoc dans SON
> instance ; on ne le reprend pas — on fait propre et DRY dans le launcher source.)

## Décisions prises (validées avec Thomas)
1. **Garde-fou fail-loud INCLUS dans ce lot** (étape 4).
2. **Support Windows MAINTENANT** (`run-node.cmd` aussi), par cohérence avec
   `rag-launcher` qui gère déjà win32. Pas de dette.

## Principe directeur
Réutiliser le self-heal PATH déjà testé de `rag-launcher.mjs` (DRY, portable, prouvé
sur le terrain — le RAG marche sur le Mac d'Achille). Invoquer les lanceurs via
`/bin/sh script` (comme le RAG) → **pas de bit exec à gérer** (évite chmod/portabilité).

## Étapes (TDD, baby-steps — un test à la fois)

### 1. Factoriser le bloc PATH self-heal — `scripts/lib/rag-launcher.mjs`
- Extraire le self-heal PATH dans des helpers réutilisables :
  `pathPrependSh()` (lignes `add …`) et `pathPrependCmd()` (bloc `if exist …`).
- `buildShLauncher`/`buildCmdLauncher` les réutilisent → **comportement identique**
  (les tests existants `scripts/lib/rag-launcher.test.mjs` restent verts = filet de
  sécurité du refactor). Vérifier d'abord que ces tests existent et passent.

### 2. Lanceurs `node` génériques pour les hooks — même module, mêmes helpers
- `buildNodeRunnerSh()` = en-tête + `pathPrependSh()` + `exec node "$@"`.
- `buildNodeRunnerCmd()` = en-tête + `pathPrependCmd()` + `node %*`.
- **Test-first** : asserter que la sortie contient le self-heal **et**
  `exec node "$@"` / `node %*` (miroir des tests RAG).

### 3. Générer les lanceurs + recâbler les hooks — `bootstrap.mjs` (vers l.242)
- Écrire `scripts/run-node.sh` et `scripts/run-node.cmd` dans TARGET (comme
  `rag/launch.*` aux l.242-243).
- Ajouter un replacement `{{NODE}}` résolu **selon `process.platform`** (objet
  `replacements` l.207) :
  - posix → `/bin/sh "{{PROJECT_ROOT}}/scripts/run-node.sh"`
  - win32 → `cmd /c "{{PROJECT_ROOT}}\\scripts\\run-node.cmd"`
  - ⚠️ ordre des substitutions : `{{NODE}}` contient `{{PROJECT_ROOT}}` → s'assurer
    que la boucle `gen()` (l.226, `.split().join()` sur chaque clé) résout bien les
    deux (mettre `{{PROJECT_ROOT}}` APRÈS `{{NODE}}` dans l'itération, ou faire 2
    passes). À vérifier/tester explicitement.
- Dans `.claude/settings.json.template`, remplacer les 3 `node "…/X.mjs"` (l.42/52/64)
  par `{{NODE}} "…/X.mjs"`.

### 4. Garde-fou « fail-loud » — `scripts/session-status.mjs`
- La bannière SessionStart tournera désormais de façon fiable (via le wrapper).
- Ajouter : si le working tree contient des modifs **non committées du vault**
  (= un auto-commit précédent n'a pas tourné), **crier** dans la bannière
  (⚠️ rouge au lieu du ✅ « Repo à jour », avec invite à vérifier les hooks).
- Transforme un futur échec silencieux d'auto-commit en **alerte visible** au
  démarrage suivant. (Lire l'état actuel de `session-status.mjs` avant d'éditer.)

### 5. Vérification à l'install — `bootstrap.mjs` (principe « le script juge lui-même »)
- Après génération des lanceurs : smoke-test `run-node.sh -e "process.exit(0)"`.
- Si non-zéro → **échec d'install bruyant** (sortie non-zéro), pas un simple warning.
  Cohérent avec `verify-rag.mjs` et la posture « ne pas faire semblant ».

### 6. Tests & docs
- Suite verte : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (helpers
  refactorés + nouveaux builders).
- Test comportemental du wrapper : exécuter `run-node.sh` avec un PATH **privé de
  node** mais un faux dossier `~/.nvm/versions/node/vX/bin` peuplé → doit résoudre ;
  node réellement absent → exit non-zéro (pas de silence).
- Note dans `DEVELOPING.md` / `SETUP.md` : pourquoi les hooks passent par
  `run-node.*` (PATH minimal de l'app desktop + node via nvm).

## Fichiers touchés
- `scripts/lib/rag-launcher.mjs` (factorisation + `buildNodeRunnerSh/Cmd`) + `.test.mjs`
- `scripts/run-node.sh` / `scripts/run-node.cmd` — **nouveaux, versionnés** (donc
  copiés dans le cerveau via les fichiers suivis)
- `bootstrap.mjs` (génération lanceurs + replacement `{{NODE}}` + smoke-test)
- `.claude/settings.json.template` (3 commandes de hook : l.42/52/64)
- `scripts/session-status.mjs` (garde-fou fail-loud)
- `DEVELOPING.md` / `SETUP.md` (note)

## Hors périmètre (anti sur-ingénierie — style Thomas)
- Pas de détection/réparation auto de nvm au-delà du PATH self-heal existant.
- Owner = username (`ap`) au lieu d'un prénom : **hors scope**. Éventuel « proposer
  un prénom » dans un lot séparé plus tard.
- Pas de chemin node absolu baké (contraire au principe « aucun chemin machine baké »
  de `rag-launcher`, et casserait au prochain `nvm install`).

## Validation finale attendue
- `git init` d'un cerveau de test → hooks passent par `run-node.*` → auto-commit
  tourne même avec node via nvm.
- Suite de tests verte.
- Idéalement : re-tester le parcours sur une instance fraîche (ou simuler un PATH
  minimal sans node-global mais avec faux nvm) pour **prouver** que l'auto-commit
  tourne. Valider le **livré** (template/bootstrap), pas une instance de test jetable.

## Commits suggérés (séparés)
1. `refactor(rag-launcher): extraire pathPrependSh/Cmd réutilisables`
2. `feat(hooks): lanceur self-heal node (run-node.sh/.cmd) — fin des hooks muets sous nvm`
3. `feat(session-status): alerte fail-loud si modifs vault non committées`
4. `docs: noter le pourquoi du wrapper run-node (PATH minimal app desktop)`

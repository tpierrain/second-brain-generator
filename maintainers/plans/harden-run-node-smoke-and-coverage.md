# Plan — Durcir `run-node` : preuve en PATH appauvri + couverture élargie

> **État : À EXÉCUTER** (plan validé, code non commencé). Document auto-suffisant :
> il contient tout le contexte nécessaire pour exécuter dans une session neuve.
> Discipline : **TDD baby-steps** (skill `tdd-discipline`) — un test à la fois,
> red→green→refactor. Le launcher est un outil Node/JS (pas un back-end Hive).
>
> **Pré-requis** : ce plan fait suite à `fix-hooks-node-nvm.md` (LIVRÉ + poussé,
> commits `c1d21a7` / `8bfafbf` / `d8c1f17`). Il en corrige deux angles morts.

## Origine (discussion de design, 2026-06-07)

Le lot précédent a introduit `scripts/run-node.*` : un lanceur « self-heal PATH »
par lequel passent les 3 hooks (`{{NODE}}` dans `.claude/settings.json.template`),
pour que `node` (souvent installé via nvm/Homebrew) soit retrouvé malgré le **PATH
minimal** de l'app desktop. Mécanisme prouvé sur le terrain.

En revoyant le design, **deux angles morts** sont apparus :

### Angle mort A — le smoke-test d'install ne prouve PAS le scénario réel
Le smoke-test actuel (`bootstrap.mjs`, bloc « Smoke-test du lanceur ») lance
`run-node` via `run(...)`, qui **hérite du PATH complet du shell d'install**. Or
c'est précisément ce PATH riche qui masque le bug : node y est toujours trouvable.
Le test répond donc à « node existe-t-il quelque part ? » et **non** à la vraie
question « le wrapper, SEUL, retrouvera-t-il node quand l'app desktop l'appellera
en PATH appauvri ? ». C'est un quasi-faux-positif.

### Angle mort B — la couverture du self-heal est incomplète
`pathPrependSh()` regarde dans `/usr/local/bin`, `/opt/homebrew/bin`,
`~/.asdf/shims` et les dossiers nvm. Il **manque** des emplacements courants :
- **`/usr/bin`** — node installé via le gestionnaire système **Linux**
  (`apt`/`dnf`/nodesource). Trou réel sur Linux.
- **Volta** (`~/.volta/bin`).
- **nodenv** (`~/.nodenv/shims`).
- **fnm** (`~/.local/share/fnm/node-versions/*/installation/bin`, et sur macOS
  `~/Library/Application Support/fnm/node-versions/*/installation/bin`).

Côté Windows (`pathPrependCmd()`), il manque notamment **Volta**
(`%LOCALAPPDATA%\Volta\bin`).

## Principe directeur (et garde-fou anti sur-ingénierie — style Thomas)

On **n'essaie pas** d'énumérer tous les gestionnaires de versions à l'infini : c'est
une course perdue. Le **vrai filet**, c'est l'angle mort A — un smoke-test qui
**prouve à l'install, en PATH appauvri**, que le wrapper trouve node tout seul ;
ainsi même un gestionnaire **non listé** échoue **bruyamment et tôt** (message
actionnable), au lieu de casser en silence au runtime. Élargir la couverture
(angle mort B) ne fait que **réduire la fréquence** où ce smoke-test recale un setup
légitime. Donc : **A est prioritaire, B est un complément curé** (pas exhaustif).

Rappel design (déjà acté dans `fix-hooks-node-nvm.md`, ne PAS revenir dessus) : on
**re-résout** le PATH à chaque exécution (coût ≈ nul : quelques `stat`, noyés dans
le démarrage de node) plutôt que de **figer un chemin absolu** à l'install — un
chemin gelé casserait au prochain `nvm install` / changement de version. On
n'auto-installe pas node non plus (node = LE prérequis, vérifié fort à l'étape 1).

## Étapes (TDD, baby-steps — un test à la fois)

### 1. Élargir la couverture POSIX — `scripts/lib/rag-launcher.mjs`
- **Test-first** (`rag-launcher.test.mjs`) : `pathPrependSh()` doit contenir
  `/usr/bin`, `$HOME/.volta/bin`, `$HOME/.nodenv/shims`, et les deux globs fnm
  (`~/.local/share/fnm/.../installation/bin` et le chemin macOS
  `~/Library/Application Support/fnm/.../installation/bin`).
- Ajouter les `add …` correspondants dans `pathPrependSh()`. ⚠️ **Ordre** : `add`
  **prepend** (le dernier `add` finit en TÊTE de PATH). Garder en tête que les
  ajouts tardifs priment — placer les gestionnaires utilisateur (volta/fnm/nodenv)
  APRÈS les chemins système si on veut qu'ils priment, ou l'inverse. Décision par
  défaut : conserver l'ordre actuel (système d'abord, puis nvm), ajouter
  volta/fnm/nodenv à la suite. Le glob avec espace (« Application Support ») doit
  être quoté correctement en sh (`"$HOME/Library/Application Support/fnm"/...`).
- `buildShLauncher`/`buildNodeRunnerSh` héritent automatiquement (ils appellent
  `pathPrependSh()`). Vérifier que les tests RAG existants restent verts.

### 2. Élargir la couverture Windows — même module
- **Test-first** : `pathPrependCmd()` doit contenir `%LOCALAPPDATA%\Volta\bin`.
- Ajouter la ligne `if exist "%LOCALAPPDATA%\\Volta\\bin" set "PATH=…"`.
  (fnm-Windows = globbing cmd pénible → **hors scope**, couvert par le smoke-test A.)

### 3. Helper « env à PATH appauvri » testable — `scripts/lib/rag-launcher.mjs`
- Nouveau `minimalPathEnv(platform, baseEnv)` : renvoie une copie de `baseEnv` où
  **seul `PATH` est neutralisé**, en conservant le reste (HOME, ProgramFiles,
  APPDATA, LOCALAPPDATA, NVM_SYMLINK… dont le self-heal a besoin).
  - **posix** → `PATH: ""` (sh est lancé en absolu `/bin/sh`, node ne viendra QUE
    du self-heal → preuve que le wrapper est auto-suffisant).
  - **win32** → `PATH: "<SystemRoot>\\System32"` (cmd.exe doit rester trouvable ;
    node viendra du self-heal). Utiliser `baseEnv.SystemRoot || "C:\\\\Windows"`.
- **Test-first** : `minimalPathEnv("darwin", {HOME:"/h", PATH:"/usr/local/bin:/x"})`
  → `PATH === ""` et `HOME === "/h"` (préservé). `minimalPathEnv("win32",
  {SystemRoot:"C:\\Windows", ProgramFiles:"C:\\PF", PATH:"…"})` → `PATH` se termine
  par `System32` et `ProgramFiles` préservé.

### 4. Durcir le smoke-test d'install — `bootstrap.mjs`
- Dans le bloc « Smoke-test du lanceur », passer l'env appauvri au `run(...)` :
  `run(runner.command, [...], { cwd: TARGET, env: minimalPathEnv(process.platform, process.env) })`.
- Importer `minimalPathEnv` depuis `./scripts/lib/rag-launcher.mjs`.
- Adapter le message d'échec : c'est maintenant la **preuve en conditions réelles**
  (PATH appauvri façon app desktop) → si ça recale, dire à l'utilisateur que son
  node est dans un emplacement **inhabituel** (lister les emplacements couverts) et
  qu'il faut soit l'ajouter, soit signaler le cas. Garder `process.exit(1)` (échec
  bruyant, cohérent avec « le script juge lui-même »).
- ⚠️ Vérifier que `run()` transmet bien `opts.env` à `execFileSync` (il spread
  `...opts` → oui). Sur Windows, `command: "cmd"` doit rester résoluble via le
  `System32` du PATH appauvri (d'où le choix du helper).

### 5. Test comportemental hermétique — `scripts/run-node.test.mjs`
- Ajouter un cas (POSIX, skip win32) : créer un **HOME temporaire** avec un faux
  node sous un dossier de gestionnaire (ex. `<tmpHome>/.volta/bin/node`, script sh
  qui imprime un marqueur unique), écrire `run-node.sh` via `buildNodeRunnerSh()`,
  puis l'exécuter avec `env = minimalPathEnv("darwin", { HOME: tmpHome, PATH:
  "/usr/local/bin" })` MAIS en neutralisant le node système : pour rendre le test
  **déterministe** malgré un éventuel node système, s'appuyer sur le fait que `add`
  **prepend** → placer le faux gestionnaire de sorte qu'il soit ajouté EN DERNIER
  (donc prioritaire) ; asserter que le **marqueur** du faux node est bien imprimé
  (preuve que c'est CE node-là qui a tourné, pas un node système). Si l'ordre des
  `add` ne garantit pas la priorité du dossier choisi, utiliser plutôt un dossier
  **exclusif** au HOME temporaire (asdf/nvm/volta) ET `PATH: ""` ; le seul node
  atteignable via $HOME temporaire sera le faux. (Documenter le choix dans le test.)
- Objectif : prouver que la **couverture élargie** (volta/fnm/nodenv) résout
  vraiment, pas seulement que la chaîne « forwarde vers node ».

### 6. Suite verte & docs
- `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` → tout vert.
- `DEVELOPING.md` (note de design existante sur run-node) : ajouter un paragraphe
  « le smoke-test tourne désormais en PATH appauvri (preuve réelle, pas faux
  positif) ; couverture = liste curée, le smoke-test est le filet pour le reste ».
- `SETUP.md` (encadré utilisateur run-node) : préciser que si l'install **recale**
  au smoke-test, c'est que node est dans un emplacement inhabituel → quoi faire.

## Fichiers touchés
- `scripts/lib/rag-launcher.mjs` (couverture POSIX+Win, `minimalPathEnv`) + `.test.mjs`
- `bootstrap.mjs` (smoke-test en env appauvri + import)
- `scripts/run-node.test.mjs` (test comportemental couverture)
- `DEVELOPING.md` / `SETUP.md` (notes)

## Hors périmètre (anti sur-ingénierie)
- **Énumération exhaustive** des gestionnaires de versions : non. Liste curée +
  smoke-test comme filet. fnm-Windows (globbing cmd) explicitement exclu.
- **Chemin node absolu figé** à l'install : non (casse au prochain `nvm install` —
  décision déjà actée).
- **Auto-installation de node** : non (invasif, dépendant OS ; node = prérequis
  vérifié fort à l'étape 1 du bootstrap).
- Refonte du wrapper ou du format des hooks : non — on ne fait qu'élargir la liste
  et durcir la preuve.

## Validation finale attendue
- Reproduire le scénario A : sur une machine où node n'est PAS dans `/usr/local/bin`
  (ex. uniquement Homebrew Apple Silicon ou nvm), l'ancien smoke-test passait à
  tort ; le nouveau (PATH appauvri) doit **réussir** car le self-heal couvre ces
  cas — ET **échouer** si on simule un node dans un dossier NON couvert (preuve que
  le filet mord). À tester en simulant un PATH appauvri + un faux node placé hors
  liste.
- Test comportemental volta/fnm hermétique vert.
- Suite complète verte. Valider le **livré** (bootstrap/wrapper générés), pas une
  instance jetable : refaire un bootstrap frais dans `/tmp`, vérifier que le
  smoke-test tourne en env appauvri et que `run-node` du cerveau résout node.

## Commits suggérés (séparés)
1. `feat(run-node): élargir la couverture PATH (/usr/bin, volta, fnm, nodenv ; volta win)`
2. `feat(bootstrap): smoke-test run-node en PATH appauvri — preuve réelle, plus de faux positif`
3. `test(run-node): preuve hermétique que la couverture élargie résout node`
4. `docs: smoke-test appauvri + emplacements node couverts`

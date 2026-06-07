<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : ✅ LIVRÉ (2026-06-03) — archive. Décision : decisions/0001-launcher-vs-brain.md -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — bascule du modèle d'install (launcher ↔ cerveau)

> **STATUT : ✅ LIVRÉ (2026-06-03).** La décision d'architecture correspondante est consignée dans
> [`../../decisions/0001-launcher-vs-brain.md`](../../decisions/0001-launcher-vs-brain.md). Archive
> conservée pour le détail des étapes (R, A→G).

---

## Plan détaillé d'origine

# PLAN — Dissociation launcher / cerveau (« le bootstrap CRÉE le dossier »)

> **But de ce fichier** : plan autoporteur. Une session Claude **vierge** doit pouvoir
> l'exécuter en ne lisant QUE ce fichier + les fichiers source cités. Écrit dans `tmp/`
> (gitignoré) → ne part pas chez l'utilisateur. Repo : `second-brain-starter` (le *template*).
> Discipline **TDD obligatoire** (charger la skill `tdd-discipline`). Commits **manuels**.
> Neutralité : aucun nom/chemin absolu en dur (placeholders `{{…}}` uniquement dans les `*.template`).
> **Multi-OS strict (Windows inclus)** : voir §4.

---

## 0. Objectif (le « pourquoi »)

Supprimer **la cause racine** de tous nos corner-cases git : on **recyclait le clone** du starter
comme cerveau (transform in-place) → d'où strip-remote, garde-fou mainteneur, gating `wasStub`…

**Nouveau modèle :** on **dissocie**.
- **Launcher** = le repo starter cloné. **Source en LECTURE SEULE, réutilisable** : un même launcher
  sur un poste peut bootstrapper plusieurs cerveaux. Le bootstrap n'écrit **jamais** dedans.
- **Cerveau** = un dossier **neuf que le bootstrap CRÉE lui-même** (nom + emplacement donnés).
  Comme c'est nous qui le créons, y déposons les fichiers, puis `git init` dedans → **aucun lien
  vers le starter, par construction**. Plus aucune chirurgie git.

```
~/second-brain-starter   (launcher cloné, RÉUTILISABLE, jamais modifié)
   └─ node bootstrap.mjs --name perso     → crée  <dest>/perso/   (git init, 0 remote)
   └─ node bootstrap.mjs --name boulot     → crée  <dest>/boulot/  (git init, 0 remote)
```

Rôle de **Claude** (amorce) : cloner le launcher, poser les questions (**nom**, **emplacement**,
contexte, langue), lancer **UNE** commande. Le bootstrap décide et fait tout.

---

## 1. Déterminisme (principe directeur, à ne pas trahir)

Mécanique + critique + répétable → **dans `bootstrap.mjs`** (déterministe, idempotent, auto-vérifiant
via smoke-test + exit non-zéro). Claude = emballage conversationnel minimal (récolte des réponses,
1 commande, relai du verdict + consignes finales). On NE confie PAS la séquence d'install à Claude.

---

## 2. État actuel du code (faits VÉRIFIÉS le 2026-06-03 — ne pas re-explorer)

- **`bootstrap.mjs`** (~360 l.) : `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))`
  (l.33) puis `process.chdir(ROOT)` (l.34). **Tout opère sur ROOT** (= le dossier du script lui-même) :
  - `defaultProject` = basename de ROOT (l.113).
  - `replacements` (l.171-178) : `{{PROJECT_ROOT}}: toPosix(ROOT)`, `{{PROJECT_NAME}}`,
    `{{OWNER_NAME}}`, `{{OWNER_CONTEXT}}`, `{{LANGUAGE}}`, `{{TMP_DIR}}: toPosix(tmpdir())`, `{{SOURCE_1}}`.
    **`toPosix()` existe déjà** et convertit en forward-slash → règle le souci JSON/Windows pour les chemins.
  - `gen(tpl, out, canOverwrite)` (l.182-194) : substitue `replacements` puis écrit `out`.
    Appels l.200-202 : CLAUDE.md (overwrite stub via `isBootstrapStub`), .mcp.json, .claude/settings.json.
  - `.env` copié depuis `.env.example` (l.205-206), clé écrite seulement si fournie.
  - **Bloc git (l.~213-250)** : utilise `planGitSetup({hasDotGit, wasStub, isMaintainer})` +
    `git init`/`remote remove`/`commit` sur ROOT. ← **À SUPPRIMER/REMPLACER** (modèle in-place).
  - Connecteurs (étape 5), notes d'exemple (6), `npm install` rag (7, `join(ROOT,"rag")` l.313),
    index (8), smoke-test (9, lit `join(ROOT,".mcp.json")` l.341, `cwd: srv.cwd ?? ROOT` l.354).
- **`scripts/lib/git-init.mjs`** : `planGitSetup(...)` (Couche 2). ← **À SUPPRIMER** (+ son test
  `git-init.test.mjs`). Plus aucun mode in-place → plus de strip-remote ni garde-fou.
- **`scripts/auto-commit.mjs`** : **Couche 1 = push opt-in** (`secondbrain.autopush`). ← **GARDER**
  tel quel (`auto-commit.test.mjs` aussi : 4 tests, dont remote bare = vérif comportementale).
- **`scripts/lib/bootstrap-args.mjs`** : `parseAnswers(argv, env, defaults)` →
  `{projectName, ownerName, ownerContext, language, nonInteractive}`. Flags `--name/--owner/--context/--lang`
  (formes `--x v` ET `--x=v`), env `SB_*`, précédence flag>env>default ; alias `--non-interactive/--yes/--no-input`.
  **N'accepte jamais de secret.** ← **À ÉTENDRE** : ajouter l'emplacement (`--dest`, env `SB_DEST`).
- **Tests** : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (40 verts). Moteur :
  `cd rag && npm test` (76) + `npx tsc --noEmit`.
- **Dernier commit** `c5d3627` (Couches 1+2). Ce plan **supersède** la Couche 2 (retrait assumé).
- **`tmp/` gitignoré** (ce plan y vit). `toPosix` = helper interne de bootstrap.mjs (chercher sa def).

---

## 3. Décisions verrouillées avec Thomas

1. **On refuse un dossier cible EXISTANT.** Garantit que c'est bien le bootstrap qui crée le dossier.
   Pas de gestion « mettre un cerveau dans un repo existant ».
2. **On ne supprime RIEN.** Le launcher reste en place, réutilisable ; l'utilisateur le jette s'il veut.
3. **Launcher = lecture seule.** Le bootstrap n'écrit jamais dans le launcher (son CLAUDE.md reste
   l'amorce, son `rag/` reste sans `node_modules`). Réutilisable pour N cerveaux.
4. **Copie = fichiers SUIVIS** du launcher (`git -C <launcher> ls-files -z`) → exclut auto `.git`,
   `node_modules`, `.env`, et les gitignorés `CLAUDE.local.md` / `tmp/`.
   ⚠️ **CORRECTION (vérifié le 2026-06-03)** : `DEVELOPING.md` est **TRACKÉ** (pas gitignoré),
   donc `ls-files` l'inclut. **Décision Thomas : denylist dans la copie** — `bootstrap.mjs`
   exclut explicitement `DEVELOPING.md` (constante `DEV_ONLY = new Set(["DEVELOPING.md"])`).
   On NE le dé-tracke PAS (il reste versionné/public). Tests, templates, `rag/` source → copiés (OK).
5. **Couche 1 (push opt-in) gardée ; Couche 2 retirée.**
6. **« Use this template » (GitHub)** : ~~recadré en « juste une façon d'obtenir le launcher »~~
   → **RÉVISÉ le 2026-06-03 (Thomas) : SUPPRIMÉ du README.** Dans le modèle local-first (le cerveau
   est créé par le bootstrap, 0 remote par défaut), « Use this template » n'apporte rien et risque de
   réveiller l'ancien modèle mental (« ce repo = mon projet »). On ne garde que `git clone <URL>`.
7. **README/SETUP réécrits en étape E APRÈS le code (A→C→D)** — choix Thomas, pour éviter tout
   écart doc/code. Ne PAS toucher au narratif in-place du README avant E (les 7 occ. « Use this
   template » + « un seul dossier / aucun second dossier » seront remplacées d'un bloc en E).

---

## 4. Multi-OS strict (Windows inclus) — incompressible

- **Emplacement par défaut calculé en Node** : `path.join(os.homedir(), name)`. **JAMAIS** un `~/…`
  littéral. `--dest <parent>` surcharge → cible = `join(dest ?? homedir(), name)`. Tous les chemins
  via `path.join`/`path.resolve` (jamais de concat `/` manuelle).
- **Copie en Node PUR** : `git ls-files -z` (NUL → gère espaces/accents) + `mkdir` parents + copie
  `fs`. **PAS** `git archive | tar` (pipe shell + tar fragiles sous Windows).
- **`{{PROJECT_ROOT}}`** doit rester en forward-slash dans le JSON → utiliser `toPosix(TARGET)`
  (helper déjà présent). Vérifier que `.claude/settings.json` généré reste un JSON valide.
- `existsSync` pour le refus-si-existe ; `git`/`npm` lancés avec `cwd: join(target, …)` explicite.
- Pas de dépendance bash/jq/tar/sqlite3 (cohérent avec la philosophie du repo).

---

## 5. Travaux (ordonnés, chacun en TDD) — = les « grandes étapes »

### R. Renommage `second-brain-starter` → `second-brain-generator` [à faire EN PREMIER]
> **Pourquoi ce nom.** « starter » = une graine qu'on fait pousser **sur place** = le modèle
> in-place qu'on ABANDONNE → faux. « template » = un truc qu'on copie/modifie → faux aussi.
> **« générateur »** = un outil qui **PRODUIT** des sorties, **réutilisable**, **non modifié** →
> mappe 1:1 sur « un launcher en lecture seule génère N cerveaux ». Le nom raconte l'archi.
> Nom retenu : **Second Brain Generator** (en) / `second-brain-generator` (repo) / « générateur de
> second cerveau » (fr).

**R1 — Texte (in-repo), à committer séparément AVANT A** :
- **Formes composées** (remplacement direct, même longueur → alignement bannière ASCII préservé) :
  `Second Brain Starter` → `Second Brain Generator` ; `second-brain-starter` → `second-brain-generator`.
  Fichiers connus : `.env.example`, `.gitignore`, `CLAUDE.md` (amorce), `DEVELOPING.md`, `README.md`,
  `bootstrap.mjs` (commentaire l.3 + bannière l.60). Commande sûre (zsh → lister les fichiers, pas `$VAR`) :
  `perl -i -pe 's/second-brain-starter/second-brain-generator/g; s/Second Brain Starter/Second Brain Generator/g' <fichiers>`
- **Marqueur bootstrap-stub** (garder synchrone !) : `<!-- second-brain-starter:bootstrap-stub -->`
  → `<!-- second-brain-generator:bootstrap-stub -->` dans **`scripts/lib/claude-md.mjs`**
  (`BOOTSTRAP_STUB_MARKER`) ET **`CLAUDE.md`** (l.1) ET **`DEVELOPING.md`** (l.52). Le test
  `claude-md.test.mjs` importe la constante (ne hardcode pas la string) → reste vert. Vérifier
  `isBootstrapStub(CLAUDE.md) === true` après coup.
- **« starter » employé SEUL** (≈30 occ.) — **désignant le PROJET** → « générateur » (FR correct :
  « le générateur enforce… », « récupérer le générateur »). Fichiers : `README.md`, `CLAUDE.md`
  (amorce, ex. « Récupérer le générateur »), `SETUP.md`, `CONNECTORS.md`, `bootstrap.mjs`
  (commentaires + message « lien vers le générateur retiré »), `scripts/auto-commit.mjs`,
  `scripts/auto-commit.test.mjs`, `scripts/lib/git-init.mjs`, `scripts/lib/git-init.test.mjs`
  (⚠️ git-init.* sera de toute façon supprimé en étape D), `.claude/skills/EXAMPLES.md`,
  `.claude/skills/tdd-discipline/SKILL.md`, `example-notes.mjs`. **À la main / ciblé** (pas de
  remplacement aveugle : « le creator/generator » ≠ voulu partout — réfléchir au cas par cas).
- **Métaphore « graine » : GARDÉE** (décrit le *cerveau* qu'on fait pousser, ≠ le générateur qui le
  produit). Vit dans `README.md` (L17-18, 212-213, 216, 230, 392-393). **Seul ajustement** : L17
  « c'est une **graine** (un *starter*) » conflate repo=graine → reformuler en « le **générateur**
  **produit** une graine/un squelette que tu fais pousser ». (Confirmer le sort de la métaphore avec
  Thomas si doute — défaut : garder + recadrer L17.)
- **Vérifs** : `git grep -niE "second[ -]brain[ -]starter"` vide ; `isBootstrapStub(CLAUDE.md)` vrai ;
  suite harnais + RAG vertes ; `node --check bootstrap.mjs`. **Neutralité** OK.
- **Commit** : `chore: renommage second-brain-starter → second-brain-generator`.

**R2 — Repo GitHub distant (optionnel, faisable EN session)** :
`gh repo rename second-brain-generator` (depuis le repo) puis `git remote set-url origin <nouvelle-url>`.
GitHub **redirige** automatiquement l'ancienne URL. (Si pas de `gh`/droits → guider Thomas.)

**R3 — Dossier local sur disque (MANUEL par Thomas, HORS session)** :
⚠️ **Ne pas faire depuis une session Claude active** : la session est ancrée sur le chemin, et la
mémoire auto est indexée dessus (`~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter/`).
Procédure à donner à Thomas : fermer Claude Code, puis
```bash
mv ~/Dev/second-brain-starter ~/Dev/second-brain-generator
mv ~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter \
   ~/.claude/projects/-Users-tpierrain-Dev-second-brain-generator   # préserve la mémoire
```
puis rouvrir Claude Code dans `~/Dev/second-brain-generator`.

### A. Résolution de la cible — `bootstrap-args.mjs` [TDD]
- Étendre `parseAnswers` : reconnaître `--dest`/`--dest=` + env `SB_DEST` (précédence flag>env>défaut).
  Ajouter au retour un champ pour l'emplacement (p. ex. `destParent`, défaut `undefined`).
- **Nouvelle fonction PURE** `resolveTargetDir({ name, destParent, home })` → chemin absolu de la
  cible = `path.join(destParent ?? home, name)`. (Pure → `home` injecté, pas d'appel `os.homedir()`
  dedans, pour testabilité + déterminisme.)
- **Tests** (red d'abord) : défaut = `join(home, name)` ; `--dest` → `join(dest, name)` ; formes
  `--dest v` et `--dest=v` ; précédence flag>env>défaut ; jamais de secret reconnu (garde existante).

### B. Refus-si-existe + liste des fichiers suivis [TDD-léger]
- Petit helper PUR pour parser la sortie `git ls-files -z` → tableau de chemins relatifs
  (split sur `\0`, filtrer le vide). Test trivial sur une string `"a\0b/c\0"`.
- Le refus-si-existe (`existsSync(target)`) et la copie réelle (`fs`) sont des side-effects →
  couverts par l'e2e §6 (pas de test unitaire artificiel). Le **message** d'erreur si la cible
  existe doit être clair (mais **ne pas** asserter sur la string en test — cf. règle anti-fragile).

### C. Refactor `bootstrap.mjs` vers le modèle CIBLE [le gros morceau]
- Introduire `TARGET` = `resolveTargetDir(...)`. **Refuser** (exit non-zéro, message clair) si
  `existsSync(TARGET)`. Sinon `mkdirSync(TARGET, { recursive: true })`.
- **Copier les fichiers suivis** ROOT(launcher)→TARGET : `git -C ROOT ls-files -z` → pour chaque,
  `mkdir` du parent dans TARGET + copie `fs`. (ROOT reste intact.)
- **Rediriger TOUT vers TARGET** : `gen()` écrit dans TARGET (templates lus depuis TARGET, qui les
  a reçus à la copie) ; `.env` dans TARGET ; `{{PROJECT_ROOT}} = toPosix(TARGET)` ; `npm install`
  dans `join(TARGET,"rag")` ; smoke-test lit `join(TARGET,".mcp.json")`, `cwd` = TARGET.
- **Git du cerveau, trivial** : `git init` dans TARGET + `add -A` + commit « initialisation du
  second cerveau » (commit non-fatal si pas d'identité git). **Toujours** init (dossier neuf),
  **aucun** conditionnel, **aucun** remote, **aucune** suppression. Retirer `process.chdir(ROOT)`
  ou le remplacer par un usage explicite des chemins (vigilance : ne plus dépendre du cwd).
- `defaultProject` : dériver du `--name` (sinon fallback « second-brain »), plus du basename de ROOT.

### D. Retrait de la Couche 2
- Supprimer `scripts/lib/git-init.mjs` + `scripts/lib/git-init.test.mjs` + l'import/usage
  `planGitSetup` dans `bootstrap.mjs`. (Couche 1 / `auto-commit.mjs` **inchangée**.)
- Retirer de `.claude/settings.json.template` la permission `Bash(git init:*)` ? **Non** — le
  bootstrap fait toujours `git init` (mais dans la CIBLE) ; et le hook côté user n'en a pas besoin.
  Laisser tel quel sauf si incohérent (vérifier).

### E. Amorce `CLAUDE.md` + README + SETUP [garder le marqueur stub]
- **Amorce `CLAUDE.md`** (conserver `<!-- second-brain-starter:bootstrap-stub -->`) : nouveau runbook.
  - Étape 1 : cloner le **launcher** (clone normal) `git clone --depth 1 <URL> <launcher-dir>` ; `cd`.
    Préciser : **launcher réutilisable**, le bootstrap **crée un dossier cerveau séparé**.
  - Étape 2 : questions EN CHAT — **nom du cerveau**, **emplacement** (défaut `~/<nom>`), contexte,
    langue. **Pas la clé Gemini.**
  - Étape 3 : UNE commande exacte
    `node bootstrap.mjs --non-interactive --name "<nom>" --dest "<emplacement-parent>" --owner "<user>" --context "<ctx>" --lang "<langue>"`
    (`--dest` optionnel). Le script **crée le dossier**, refuse s'il existe, fait tout, juge la réussite.
  - Étape 4 : relai + 3 consignes finales → (a) clé dans `<cerveau>/.env` ; (b) dépôt distant
    optionnel → si oui : `git remote add` + `git config secondbrain.autopush true` ; si non : rien
    (push opt-in off = aucune fuite) ; (c) **rouvrir Claude Code dans le DOSSIER CERVEAU créé**.
  - Garde-fous : commande exacte, clé jamais en argument, idempotence (relancer = autre nom/échec
    propre si existe), ne pas inventer.
- **README** : Option A (assisté) → prompt minimal *« Installe-moi un second cerveau nommé `<nom>`
  à partir de `<URL>` »* + expliquer launcher↔cerveau + 3 gestes finaux. Option B (« Use this
  template ») = juste obtenir le launcher.
- **SETUP** : §2 (le bootstrap crée le dossier, refuse si existe, launcher réutilisable, copie
  fichiers suivis, 0 lien par construction) ; flags `--name/--dest/...` ; §7 push opt-in (déjà).

### F. Tests & e2e (multi-OS-safe)
- Unitaires A+B verts (`resolveTargetDir`, parse `ls-files -z`).
- Suite complète verte : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (sans git-init.*),
  `cd rag && npm test` + `npx tsc --noEmit`, `node --check bootstrap.mjs`.
- **E2E** (copie jetable du launcher, voir §6) :
  - run 1 : `--name perso --dest <tmp>` → asserter : `<tmp>/perso` **créé** ; `.git` présent **neuf**
    (1 commit, `git remote` **vide**) ; CLAUDE.md **n'est plus l'amorce** ; `.mcp.json` +
    `.claude/settings.json` générés (+ JSON valide, `{{PROJECT_ROOT}}` en `/`) ; `.env` clé vide ;
    `rag/node_modules` présent ; smoke-test MCP OK ; **launcher INTACT** (son CLAUDE.md toujours
    l'amorce, pas de `rag/node_modules` ajouté, `git status` du launcher inchangé).
  - run 2 : **réutiliser le même launcher** `--name boulot --dest <tmp>` → `<tmp>/boulot` créé, OK
    → prouve la réutilisabilité.
  - run 3 : refuser si existe → relancer `--name perso` → **exit non-zéro**, `<tmp>/perso` inchangé.
  - non-fuite : écrire une note dans `<tmp>/perso/vault` + lancer son `scripts/auto-commit.mjs` →
    commit local, `secondbrain.autopush` absent, `git remote` vide → aucun push (vérif par dépôt
    bare comme dans `auto-commit.test.mjs`, **pas** par string de message).

### G. Commit + push (manuel, conventionnel, co-author Claude) — quand tout est vert.

---

## 6. Procédure e2e (copie jetable, multi-OS dans l'esprit)
```bash
# Launcher jetable (working tree courant, sans .git/node_modules/dev). On RE-init un .git
# pour simuler un vrai launcher cloné (git ls-files a besoin d'un dépôt).
LAUNCH=$(mktemp -d)
rsync -a --exclude node_modules --exclude .git --exclude 'rag/.cache' --exclude 'rag/dist' \
  --exclude CLAUDE.local.md --exclude DEVELOPING.md --exclude tmp \
  <repo>/ "$LAUNCH"/
cd "$LAUNCH" && git init -q && git add -A && git -c user.email=t@e -c user.name=t commit -qm snap
DEST=$(mktemp -d)
node bootstrap.mjs --non-interactive --name perso  --dest "$DEST" --owner Hossam --context DevOps --lang français
node bootstrap.mjs --non-interactive --name boulot --dest "$DEST" --owner Hossam --context DevOps --lang français
# Vérifs : voir §5.F. Le launcher ($LAUNCH) doit rester INTACT.
```
*(Le test interactif réel reste à faire par Thomas en vrai terminal — Claude ne pilote pas un clavier.)*

---

## 7. Ordre d'exécution (= grandes étapes, une par session après /clear)
0. **R** (renommage → `second-brain-generator`, R1 texte + commit ; R2 GitHub optionnel ; R3 dossier = manuel Thomas).
1. **A** (resolveTargetDir + --dest, TDD) → suite verte.
2. **B** (parse ls-files -z, TDD).
3. **C** (refactor bootstrap → TARGET) + `node --check`.
4. **D** (retrait Couche 2).
5. **E** (amorce + docs ; vérifier `isBootstrapStub` toujours vrai).
6. **F** (e2e §6) — multi-cerveaux + launcher intact + refus-si-existe + non-fuite.
7. **G** (commit + push) — seulement quand tout est vert.

---

## 8. Pour REPRENDRE après un /clear
- Dire : **« Reprends le plan dans `tmp/PLAN-launcher-vs-brain.md`, va à l'étape <X> »**.
- Claude : lire ce fichier en entier, charger la skill **`tdd-discipline`**, exécuter l'étape via §5/§7.
- Garder sacré : déterminisme (§1), lecture seule du launcher (§3), multi-OS (§4), TDD strict,
  **pas d'assert sur des strings de messages** (tester l'état/comportement réel).
- **Suivi vivant** : §9 (cases à cocher) = source de vérité du progrès — la mettre à jour à chaque pas.

---

## 9. SUIVI — cases à cocher (tableau de bord, source de vérité unique)

### R. Renommage → `second-brain-generator` [EN PREMIER]
- [x] R1 formes composées (`Second Brain Starter`/`second-brain-starter`) remplacées ; bannière ASCII réalignée (50 ch.)
- [x] R1 marqueur bootstrap-stub synchro (claude-md.mjs + CLAUDE.md + DEVELOPING.md) ; `isBootstrapStub` vrai ✓
- [x] R1 « starter » seul (sens projet) → « générateur » ; métaphore « graine » gardée + L17 recadré ; reste « starter » uniquement dans `git-init.*` (supprimé en D)
- [x] R1 vérifs (git grep composées vide ; 40 harnais + 76 RAG + tsc + `node --check` verts) + commit `chore: renommage …`
- [x] R2 repo GitHub renommé (`gh repo rename second-brain-generator`, remote auto-màj → `…/second-brain-generator.git`, fetch OK) ; commit R1 poussé
- [ ] R3 dossier local — **manuel par Thomas hors session** (mv dossier + mv dossier mémoire)

### A. Résolution de la cible (`resolveTargetDir` + `--dest`)
- [x] Test défaut = `join(home, name)` (red→green) + triangulation `destParent` → `join(dest, name)`
- [x] Test `--dest` (formes `v` et `=v`) → `destParent` (red→green)
- [x] Test précédence flag (`--dest`) > env (`SB_DEST`) > défaut
- [x] `parseAnswers` renvoie `destParent` (défaut `undefined`) ; garde anti-secret toujours verte ; `onlyDefaults` deepEqual màj (nouveau champ)
- [x] Suite verte (44 tests harnais) + `node --check bootstrap.mjs`

### B. Refus-si-existe + parse `ls-files -z`
- [x] Helper pur `parseLsFilesZ` (`scripts/lib/tracked-files.mjs`) : `"a\0b/c\0"` → `["a","b/c"]`, `""` → `[]` (red→green)
- [x] Helper pur `filterCopyable` + denylist `DEV_ONLY={DEVELOPING.md}` (`tracked-files.mjs`, red→green) — §3.4
- [ ] (side-effects refus/copie → couverts par e2e §F)

### C. Refactor `bootstrap.mjs` → modèle CIBLE
- [x] `TARGET` résolu (`resolveTargetDir`) ; refus si `existsSync(TARGET)` (exit 1, msg clair) ; `mkdir` sinon
- [x] Copie des fichiers suivis launcher→TARGET (Node pur, `ls-files -z` + `filterCopyable`) ; ROOT lecture seule
- [x] `gen` (templates lus dans TARGET) / `.env` / `{{PROJECT_ROOT}}=toPosix(TARGET)` / `npm install` / connecteurs / notes / smoke → tous sur TARGET
- [x] `git init` + commit dans TARGET (toujours, 0 remote, 0 suppression) ; `chdir(ROOT)` retiré ; defaultProject `--name` ?? "second-brain"
- [x] `node --check bootstrap.mjs` OK ; suite harnais 47 verts + RAG + tsc verts

### D. Retrait Couche 2
- [x] `git-init.mjs` + `git-init.test.mjs` supprimés ; usage `planGitSetup` déjà retiré en C ; 0 ref résiduelle
- [x] Couche 1 (`auto-commit.mjs`) inchangée et toujours verte (43 harnais après retrait des 4 tests git-init)
- [x] `.claude/settings.json.template` vérifié : permission `git init` conservée (cohérente côté cerveau user)
- [x] DEVELOPING.md : 2 refs à `git-init.mjs` recadrées (`tracked-files.mjs`/`resolveTargetDir`)

### E. Amorce + docs
- [x] Amorce `CLAUDE.md` réécrite (marqueur stub conservé ; runbook launcher↔cerveau, `--dest`, refus-si-existe, 3 consignes finales sur `<cerveau>`)
- [x] `isBootstrapStub(CLAUDE.md)` toujours vrai ; `CLAUDE.md.template` SANS marqueur (constitution ≠ amorce)
- [x] README : section « modèle » réécrite (launcher↔cerveau, 0 lien par construction), Option A (prompt + 3 gestes sur `<cerveau>`), Option B (clone launcher → bootstrap crée dossier → cd cerveau), « Use this template » recadré en « façon d'obtenir le launcher » (§3.6), métaphore graine gardée
- [x] SETUP §2 réécrit (crée le dossier, refus-si-existe, copie fichiers suivis, `--dest`/`SB_DEST`, 0 lien — retrait du narratif strip-remote Couche 2) ; §3 (`cd <cerveau>`) ; §7 (autre machine = clone du cerveau, PAS bootstrap)
- [x] Neutralité : aucun nom perso / chemin absolu en dur (placeholders `~/<nom>`, `<emplacement>`) ; grep in-place contradictions vide (hors « Use this template » recadrés)

### F. Tests & e2e
- [x] Unitaires A+B verts (`resolveTargetDir`, `parseLsFilesZ`, `filterCopyable`)
- [x] Suite complète verte : 43 harnais (sans git-init.*) + 76 RAG + tsc + `node --check`
- [x] E2E run1 (perso créé, **amorce E remplacée**, launcher intact) + run2 (boulot, réutilisabilité) + run3 (refus-si-existe, exit 1)
- [x] E2E non-fuite : autopush **off** → **aucun push** (bare vide) + commit local OK ; flip autopush=true + upstream → push suit le local (opt-in OK dans les 2 sens)

### Final
- [x] Commits manuels + push au fil de l'eau (C `edc32b1`, D `e0096ce`, E `0ff9d01`, suppr. « Use this template » `695705f`) — tout vert, tout sur origin/main
- [ ] **R3 rappelé à Thomas** (cf. §11) — renommage dossier local + mémoire (geste manuel, Claude fermé)

---

## 11. 🏁 RAPPEL DE CLÔTURE — à ressortir à Thomas une fois TOUT terminé (après G)

> ⚠️ **Pour Claude (dernière session) :** quand A→G sont finis/poussés, **redonne ces instructions
> à Thomas** (il l'a explicitement demandé : « tu me rediras comment faire à ce moment-là »). C'est
> **R3** : aligner le **dossier local** sur le nouveau nom du repo. **Toi (Claude) tu ne le fais PAS** —
> la session est ancrée sur le chemin et la mémoire auto est indexée dessus.

**Message à donner à Thomas :**

R3 = renommer le dossier sur ton disque (le repo GitHub est déjà `second-brain-generator` ; le
dossier local s'appelle encore `…second-brain-starter`). À faire **Claude Code fermé** :

```bash
mv ~/Dev/second-brain-starter ~/Dev/second-brain-generator
mv ~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter \
   ~/.claude/projects/-Users-tpierrain-Dev-second-brain-generator   # préserve la mémoire auto
```

Puis rouvrir Claude Code dans `~/Dev/second-brain-generator`. Le 2ᵉ `mv` préserve la mémoire
(indexée par le chemin du projet). Non bloquant / purement cosmétique : pouvait être fait à tout
moment, mais c'est le dernier geste qui « ferme » le renommage de bout en bout.

## 10. État (MÀJ 2026-06-03, fin de session — étape C terminée)
**Fait & commité localement (PAS encore poussé sur origin) :**
- **R** terminé : R1 (renommage texte, commit `1c0ee33`, poussé), R2 (repo GitHub renommé
  `second-brain-generator`, remote màj, poussé). **R3 (mv dossier local + dossier mémoire) =
  reste à faire MANUELLEMENT par Thomas, Claude Code fermé** (cf. §5.R3).
- **A** commité `e7449f4` (`--dest`/`SB_DEST` + `resolveTargetDir` pur, 44 tests verts).
- **B** commité `0e45b00` (`parseLsFilesZ` pur).
- **C** commité + **poussé** `edc32b1` : `bootstrap.mjs` refactoré vers le modèle TARGET
  (résolution cible, refus-si-existe, copie fichiers suivis Node pur, tout redirigé sur TARGET,
  `git init` trivial 0-remote, plus de `chdir`/`planGitSetup`). Helper pur `filterCopyable` +
  denylist `DEVELOPING.md` (`tracked-files.mjs`, TDD red→green).
  **E2E validé** (§6, launcher fidèle avec DEVELOPING.md tracké) : run1 perso (.git neuf 1 commit
  0 remote, CLAUDE.md dé-amorcé, .mcp.json/settings.json générés + JSON valide, PROJECT_ROOT en
  `/`, .env clé vide, rag/node_modules, **DEVELOPING.md NON copié**, CLAUDE.local.md absent) ;
  run2 boulot (réutilisabilité launcher) ; run3 refus-si-existe (exit 1, perso inchangé) ;
  **launcher resté INTACT** (CLAUDE.md amorce, pas de node_modules, git status inchangé).
- **D** commité + **poussé** `e0096ce` : `git-init.mjs`/`git-init.test.mjs` supprimés, refs
  DEVELOPING.md recadrées, Couche 1 intacte. Suite **43 harnais + 76 RAG + tsc + `node --check`** verts.
- **E** **codé, à committer** : amorce `CLAUDE.md` réécrite (stub conservé, runbook launcher↔cerveau,
  `--dest`, refus-si-existe) ; README (modèle + Options A/B + « Use this template » recadré) ; SETUP
  §2/§3/§7 réécrits. `isBootstrapStub` toujours vrai, `CLAUDE.md.template` sans marqueur, 43 harnais verts.
- ✅ **A, B, C, D poussés sur origin/main** ; E en working tree.

**À FAIRE ensuite = étape F** (e2e complet §6 : multi-cerveaux + launcher intact + refus-si-existe +
**non-fuite autopush** via dépôt bare). Puis G (commit final). ⚠️ Après G : rappeler R3 à Thomas (cf. §11).

**Rappels :** Ce plan supersède la Couche 2 (retrait en D) et le « transform in-place ». Couche 1
(push opt-in) conservée. Mémoire de référence : `install-model-launcher-vs-brain`,
`feedback-no-string-fragile-asserts`.

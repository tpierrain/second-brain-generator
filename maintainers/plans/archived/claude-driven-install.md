<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : ✅ LIVRÉ ET POUSSÉ (2026-06-03) — archive, plus rien à reprendre. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — onboarding « installe mon second cerveau » piloté par Claude

> **STATUT : ✅ LIVRÉ ET POUSSÉ (2026-06-03).** Toutes les sections A→E livrées. Dernier commit
> de la série `af406b8`. Archive conservée pour le *pourquoi* ; rien à reprendre.

## Résumé de ce qui a été livré

L'utilisateur part de Claude Code + l'URL du repo, **une seule instruction** ; Claude pose les
questions à l'oral puis délègue **toute** la mécanique au script déterministe `bootstrap.mjs`
(principe : déterminisme dans le script, Claude = emballage minimal). Sections cochées :

- **(A)** mode `--non-interactive` + `scripts/lib/bootstrap-args.mjs` (`parseAnswers` → flags
  `--name/--owner/--lang`, env `SB_*`, précédence flag > env > défaut).
- **(B)** `git init` auto du cerveau (`git-init.mjs`).
- **(C)** amorce `CLAUDE.md` réécrite en notice d'auto-install (marqueur `bootstrap-stub` conservé).
- **(D)** docs README option A/B + SETUP + DEVELOPING.
- **(E)** tests + e2e.

La **clé Gemini est différée** vers `.env` (jamais chat/argv).

## Validation e2e (✅ FAIT 2026-06-03)

L'e2e a été exécuté dans une **copie jetable** (`mktemp -d`, copie détachée sans `.git`) via
`node bootstrap.mjs --non-interactive` : exit 0 ; amorce `CLAUDE.md` (marqueur `bootstrap-stub`)
bien **remplacée** par la vraie constitution ; `.mcp.json` + `.claude/settings.json` générés ;
`git init` auto (1 commit) ; `.env` clé vide ; deps RAG installées ; smoke-test MCP OK (5 outils) ;
puis note vault + `auto-commit.mjs` → commit local sans remote, **aucun push, aucune erreur**.
Verrouillé en plus par le test de non-régression `scripts/auto-commit.test.mjs`.

> **Reste hors périmètre Claude :** le test **interactif** réel du wizard (questions + connecteurs
> au clavier) que seul Thomas peut piloter dans un vrai terminal.

---

## Plan détaillé d'origine

# PLAN — Installation assistée par Claude (« Claude-driven onboarding »)

> **But de ce fichier** : plan autoporteur. Une session Claude **vierge** doit pouvoir
> l'exécuter en ne lisant QUE ce fichier + les fichiers source cités. Écrit dans `tmp/`
> (gitignoré) → ne part pas chez l'utilisateur. Repo : `second-brain-starter` (le *template*,
> pas un cerveau utilisateur). Discipline **TDD obligatoire** (charger la skill `tdd-discipline`).
> Commits **manuels** (pas de hook auto-commit dans ce repo). Neutralité : aucun nom/chemin
> absolu en dur (placeholders `{{…}}` uniquement dans les `*.template`).

---

## 0. Objectif (le « pourquoi » / l'UX cible)

Permettre à un utilisateur (ex. **Hossam**, agent DevOps, demain matin) d'installer son second
cerveau **en ne partant que de Claude Code + l'URL du repo** (auquel il a accès), avec **une
seule instruction**. Claude lui pose les questions à l'oral, puis **délègue toute la mécanique
au script déterministe `bootstrap.mjs`**, et termine par 2 consignes manuelles.

### Flux cible
```
USER (dans Claude Code, hors repo) :
  « Crée-moi un second cerveau nommé 'mon-cerveau' à partir de ce starter : <URL>.
    Fais-en une COPIE (pas un clone lié à ce repo), puis installe-le en suivant son CLAUDE.md.
    Pose-moi les questions nécessaires, mais ne me demande PAS ma clé Gemini. »

CLAUDE :
  1. git clone --depth 1 <URL> mon-cerveau   (puis SUPPRIME mon-cerveau/.git → copie détachée)
  2. cd mon-cerveau ; lit CLAUDE.md (= l'amorce = la NOTICE d'auto-install)
  3. pose les questions EN CHAT : nom du projet, ton nom, ton contexte, langue (PAS la clé)
  4. node bootstrap.mjs --non-interactive --name "…" --owner "…" --context "…" --lang "…"
     → le SCRIPT fait tout : git init, génère fichiers, installe RAG, smoke-test (déterministe)
  5. relaie le résultat + dit les 2 étapes finales :
       a. « colle ta clé Gemini dans .env » (jamais dans le chat)
       b. « veux-tu un dépôt git DISTANT (backup + multi-machine) ? » → cf. §Décisions
       c. « ferme/rouvre Claude Code dans 'mon-cerveau' » (active le serveur MCP RAG)
```

---

## 1. Déterminisme — qui fait quoi (PRINCIPE DIRECTEUR, à ne pas trahir)

Claude n'est **pas** fiable pour exécuter une longue séquence mécanique. Donc :

- **Tout ce qui est mécanique + critique + répétable → `bootstrap.mjs`** (déterministe,
  idempotent, auto-vérifiant : il finit par le smoke-test MCP et `process.exit(1)` si ça casse).
- **Claude = emballage conversationnel minimal** : (a) récolter les réponses en langage naturel,
  (b) appeler **UNE commande exacte**, (c) relayer le verdict du script + 2 consignes finales,
  (d) gérer la conversation « dépôt distant » (cas par cas, non mécanisable).
- Garde-fous anti-dérive inscrits dans l'amorce : **commande exacte à copier** (pas à
  interpréter), `--non-interactive` **obligatoire**, idempotence, **clé jamais en argument**.

> On NE confie PAS les étapes d'install à Claude. Les ~9 étapes restent dans le script.

---

## 2. État actuel du code (faits vérifiés — pour ne pas re-explorer)

- **`bootstrap.mjs`** (racine, ~290 l.) : 9 étapes numérotées `X/9`. `interactive = stdin.isTTY`.
  - Helper `ask(prompt, def)` → renvoie `def` si `!rl` (non-TTY).
  - **Non-interactif aujourd'hui = valeurs par défaut brutes** (ownerName=""), connecteurs
    sautés, notes d'exemple gardées. ⇒ PAS de moyen d'injecter les réponses. **À AJOUTER.**
  - Génération via `gen(tpl, out, canOverwrite)` ; `gen(CLAUDE.md.template → CLAUDE.md,
    isBootstrapStub)` ⇒ remplace l'amorce par la vraie constitution.
  - `.env` : copié depuis `.env.example` (clé `GOOGLE_GEMINI_API_KEY=` **vide**) ; clé écrite
    seulement si fournie. Différer la clé = laisser vide → étape 8/9 « indexation reportée ».
  - **❗ Le bootstrap NE fait PAS `git init`.** Il suppose un `.git` déjà présent (clone / Use
    this template). Dans le flux « copie détachée » (on supprime `.git`), il faut l'ajouter.
- **`scripts/auto-commit.mjs`** : hook PostToolUse. **Gère DÉJÀ l'absence de remote** :
  `const hasRemote = git(["remote"]).out.trim().length > 0; if (hasRemote && !push) …`.
  ⇒ « non au dépôt distant » = commit local, **aucun push tenté, aucune erreur**. ✅ (À
  verrouiller par un test de non-régression.)
- **`scripts/lib/claude-md.mjs`** : `BOOTSTRAP_STUB_MARKER = "<!-- second-brain-starter:bootstrap-stub -->"`
  ; `isBootstrapStub(content)` = contient le marqueur. **La réécriture de l'amorce DOIT garder
  ce marqueur exact** (sinon le bootstrap ne la remplace plus → casse DEVELOPING #3).
- **`CLAUDE.md`** (racine) = l'amorce actuelle (marqueur présent) : dit « l'installateur est
  interactif, tu ne peux pas le piloter, dis à l'user de le lancer lui-même ». **À INVERSER.**
- **`.claude/settings.json.template`** : hook auto-commit (`{{PROJECT_ROOT}}/scripts/auto-commit.mjs`)
  + permissions (git add/commit/push/init? → **vérifier `git init` est permis**, sinon l'ajouter
  à la whitelist : actuellement pas de `Bash(git init:*)`).
- **Tests harnais** : `node --test scripts/lib/*.test.mjs` (27 verts). Moteur : `cd rag && npm test`.
- **`tmp/` est gitignoré** (ce plan y vit). `PLAN-*.md` à la racine ne le serait PAS.

---

## 3. Décisions déjà prises avec Thomas (verrouillées)

1. **Copie, pas clone lié** : récupérer les fichiers puis **détacher** (`rm -rf .git`) ; dossier
   au **bon nom dès le départ**.
2. **Clé Gemini différée vers `.env`** : Claude installe tout sauf la clé ; la clé ne transite
   **jamais** par le chat ni par la ligne de commande. Index construit au 1er démarrage du MCP.
3. **`git init` local = automatique et indispensable** (socle de l'auto-commit). Ce n'est PAS la
   question posée à l'utilisateur.
4. **Question « dépôt distant » à la toute fin, avec les ENJEUX explicites** :
   formuler ≈ *« Veux-tu un dépôt git **distant** pour que ton second cerveau ait un **backup**,
   voire soit **utilisable depuis plusieurs machines** ? »*
   - **Si NON** : ne rien faire. Tout reste versionné en local, rien ne se perd ; le hook
     auto-commit **ne tente pas de push** (déjà géré) → aucune erreur. Possibilité d'en ajouter
     un plus tard. **Vérifier/garantir par test** que « pas de remote » ne casse rien.
   - **Si OUI** : demander **plateforme** (GitHub / GitLab / Azure DevOps…) + **nom**. Créer/brancher
     le remote (`gh repo create` si dispo, sinon `git remote add` + `git push -u`, sinon guider).
     GitHub = cas simple ; autres plateformes = best-effort + guidage si CLI/auth absente.
5. **Déterminisme** : cf. §1. Mécanique dans le script ; Claude = emballage minimal.

---

## 4. Contraintes incompressibles (à assumer/documenter, pas à « résoudre »)

- **Redémarrage final** : le moteur RAG est un serveur MCP chargé au **démarrage** de Claude
  Code → rouvrir Claude Code dans le dossier après install. Inévitable.
- **Accès au repo privé** : tant que le repo est privé, cloner/télécharger exige un **accès**
  (compte GitHub avec droits). Inévitable jusqu'à passage public.
- **Création de dépôt distant** : dépend de la plateforme + de l'auth locale → partie la plus
  fragile, traitée en best-effort par Claude (pas par le script).

---

## 5. Travaux (ordonnés, chacun en TDD)

### A. Mode non-interactif PILOTÉ par flags — `bootstrap.mjs` [TDD]
**Nouveau** `scripts/lib/bootstrap-args.mjs` : fonction **pure** `parseAnswers(argv, env, defaults)`.
- Reconnaît : `--name`, `--owner`, `--context`, `--lang` (formes `--x v` ET `--x=v`) ; flag
  `--non-interactive` (alias `--yes`/`--no-input`) → `nonInteractive: true`.
- Précédence : **flags > env** (`SB_PROJECT_NAME`, `SB_OWNER_NAME`, `SB_OWNER_CONTEXT`,
  `SB_LANGUAGE`) **> defaults** fournis.
- **N'accepte JAMAIS la clé Gemini** (sécurité : pas de secret en argv).
- Renvoie `{ projectName, ownerName, ownerContext, language, nonInteractive }`.

**Test** `scripts/lib/bootstrap-args.test.mjs` (red d'abord) :
- `--name=mon-cerveau --owner "Jane Doe"` → parse correct des deux formes.
- précédence flag > env > default ; absents → defaults.
- `--non-interactive` → `nonInteractive:true`.
- aucune clé/secret reconnu même si `--gemini-key xxx` passé (ignoré).

**Câblage dans `bootstrap.mjs` (§2 Personnalisation)** :
- En tête : `const cli = parseAnswers(process.argv.slice(2), process.env, { projectName:
  defaultProject, ownerName: gitUser, ownerContext: "usage professionnel", language: "français" })`.
- `const interactive = stdin.isTTY && !cli.nonInteractive;`
- Branche **non-interactive** : utiliser `cli.*` (au lieu des défauts bruts actuels). Branche
  interactive : prompts pré-remplis avec `cli.*` comme défauts.
- **Clé** : en non-interactive, toujours différer (`geminiKey=""`). Jamais lue depuis argv.
- Connecteurs + notes d'exemple : **rester sautés** en non-interactive (comportement actuel OK).

### B. `git init` si pas de dépôt — `bootstrap.mjs` [TDD-léger]
- Helper pur (dans `bootstrap-args.mjs` ou un petit `git-init.mjs`) `shouldInitGit(root)` =
  `!existsSync(join(root, ".git"))`. Test trivial.
- Dans `bootstrap.mjs`, **juste après la génération des fichiers (§4)** : si `shouldInitGit`,
  `git init` + `git add -A` + `git commit -m "chore: initialisation du second cerveau"`.
  Idempotent (skip si `.git` présent). Message `ok("dépôt git local initialisé")`.
- **Ne PAS renuméroter** les `X/9` (éviter la dérive doc) : intégrer ce sous-pas dans l'étape de
  génération existante, sans nouvel en-tête numéroté.
- Ajouter `Bash(git init:*)` à la whitelist de `.claude/settings.json.template`.
- Le side-effect git est de l'intégration → couvert par l'e2e (§7), pas un test unitaire artificiel.

### C. Réécrire l'amorce `CLAUDE.md` → NOTICE D'AUTO-INSTALL [garder le marqueur]
Fichier `CLAUDE.md` (racine). **Conserver `<!-- second-brain-starter:bootstrap-stub -->`** en tête.
Contenu = runbook **adressé à Claude**, impératif et court :
- **Préambule** : « Ce repo n'est pas encore installé. Si l'utilisateur demande de créer/installer
  son second cerveau, suis EXACTEMENT ces étapes. »
- **Étape 1 — (si on part d'une URL, repo pas encore local)** : `git clone --depth 1 <URL> <nom>`
  puis **`rm -rf <nom>/.git`** (copie détachée), `cd <nom>`. *(Souvent déjà fait si Claude lit ce
  fichier depuis l'intérieur du repo.)*
- **Étape 2 — Poser les questions EN CHAT, groupées** : nom du projet/dossier, nom de l'utilisateur,
  contexte, langue. **NE PAS demander la clé Gemini.**
- **Étape 3 — Lancer la commande EXACTE** (copier, ne pas paraphraser) :
  `node bootstrap.mjs --non-interactive --name "<nom>" --owner "<nom user>" --context "<contexte>" --lang "<langue>"`
  ⚠️ `--non-interactive` obligatoire (sinon blocage clavier). Idempotent. Le script fait TOUT
  (git init, fichiers, install RAG, smoke-test) et **juge lui-même** la réussite (sortie non-zéro
  = échec → relaie l'erreur, ne « fais pas semblant »).
- **Étape 4 — Relayer + 2 (3) consignes finales** :
  a. « Colle ta clé Gemini dans `.env` (ligne `GOOGLE_GEMINI_API_KEY=`). » — jamais dans le chat.
  b. **Question dépôt distant** (formulation §3.4, avec enjeux backup/multi-machine). Si oui →
     plateforme + nom → créer/brancher (gh/glab/az ou `git remote add` + guidage). Si non → ne
     rien faire (le hook ne pushera pas, c'est sûr).
  c. « Ferme et rouvre Claude Code dans `<nom>` » → active le serveur MCP RAG (indexe au démarrage).
- **Garde-fous** rappelés : commande exacte, clé jamais en argument, idempotence, ne pas inventer.

> ⚠️ Le `CLAUDE.md.template` (la VRAIE constitution générée) est un fichier **distinct** — ne pas
> le confondre. On ne touche ici qu'à l'**amorce** `CLAUDE.md`.

### D. Docs — README + SETUP + DEVELOPING
- **README** (section « Prêt à essayer ? ») : ajouter **« Option A — Démarrage assisté par Claude
  (le plus simple) »** = le prompt copier-coller (cf. §0), + les 2 étapes finales + « non au
  distant = sûr ». Garder **« Option B — Manuel (`node bootstrap.mjs`) »**. Garder la section
  Connecteurs (déjà livrée).
- **SETUP** : documenter les flags `--non-interactive --name/--owner/--context/--lang` ; le
  `git init` auto ; la décision dépôt distant (+ « pas de remote = pas de push = sûr ») ; la clé
  différée. Aligner les numéros d'étapes si besoin.
- **DEVELOPING** : backlog → marquer « option `--non-interactive` » **livrée** ; ajouter une note
  de design « onboarding piloté par Claude (déterminisme : script fait tout, Claude = emballage) ».

### E. Tests & e2e
- `scripts/lib/bootstrap-args.test.mjs` (cf. A).
- **Non-régression « pas de remote »** : `scripts/auto-commit.test.mjs` — créer un dépôt temp
  (`git init` dans tmpdir), modifier un fichier, exécuter `auto-commit.mjs`, asserter : 1 commit
  créé, **aucun remote**, aucune erreur/aucun push. (Complexité moyenne : spawn git + node.)
- Suite complète verte : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` + `cd rag &&
  npm test` + `node --check bootstrap.mjs`.
- **E2E à la cible** (copie jetable, voir §6) : clone → `rm -rf .git` → `node bootstrap.mjs
  --non-interactive --name test-brain --owner "Hossam" --context "DevOps" --lang français`.
  Asserter : `CLAUDE.md` n'est plus l'amorce (marqueur absent), `.mcp.json` + `.claude/settings.json`
  générés, `.git` présent (git-inité), `.env` présent (clé vide), deps RAG installées, smoke-test
  MCP OK. Puis écrire une note vault + lancer `auto-commit.mjs` → commit local, pas d'erreur push.

---

## 6. Procédure e2e (copie jetable, SANS rm -rf destructeur sur le template)
```bash
# Dossier neuf, horodaté par l'appelant si besoin (pas de Date.now en script de workflow).
SBS=/tmp/sbs-e2e-claude-driven
rsync -a --exclude node_modules --exclude .git --exclude rag/.cache \
  ~/Dev/second-brain-starter/ "$SBS"/
cd "$SBS"
# Simuler la "copie détachée" : pas de .git (rsync l'a exclu) → bootstrap doit git-init.
node bootstrap.mjs --non-interactive --name test-brain --owner "Hossam" --context "agent DevOps" --lang français
# Vérifs : voir §5.E.
```
*(Le test interactif réel du wizard connecteurs/questions reste à faire par Thomas en vrai
terminal — Claude ne peut pas piloter un prompt clavier.)*

---

## 7. Ordre d'exécution recommandé
1. **A** (parseAnswers + test → red→green) puis câbler dans bootstrap.
2. **B** (git init + permission whitelist).
3. `node --check bootstrap.mjs` + suite tests verte.
4. **C** (réécriture amorce CLAUDE.md, marqueur conservé) — vérifier `isBootstrapStub` toujours vrai.
5. **D** (docs).
6. **E** (tests non-régression + e2e §6).
7. **Commit manuel + push** (message conventionnel, co-author Claude). Pas avant que tout soit vert.

---

## 8. Pour REPRENDRE après un /clear
- Dire à Claude : **« Reprends le plan dans `tmp/PLAN-claude-driven-install.md` »**.
- Claude : lire ce fichier en entier, puis `DEVELOPING.md` (auto-chargé), charger la skill
  **`tdd-discipline`**, et exécuter §5 dans l'ordre §7. TDD strict, commits manuels, neutralité.
- Garder le **principe §1** sacré : déterminisme dans le script, Claude minimal.
- **Suivi vivant** : la section §9 (cases à cocher) est la source de vérité du progrès — Claude
  la met à jour à chaque pas franchi.
- **État au moment d'écrire ce plan** : rien de A–E n'est commencé. Le commit précédent
  (`feat(connectors)…`) est déjà poussé et indépendant.

---

## 9. SUIVI — cases à cocher (tableau de bord, source de vérité unique)

> Mis à jour par Claude à chaque baby-step / pas franchi. Détail des items : §5 + §7.

### A. Mode non-interactif piloté par flags (`parseAnswers` + câblage) ✅ TERMINÉ
- [x] Test 1 — forme `--x=v` (red→green)
- [x] Test 2 — forme `--x v` (espace) (red→green)
- [x] Test 3 — précédence flags > env > defaults ; absents → defaults (red→green)
- [x] Test 4 — `--non-interactive` (+ alias `--yes`/`--no-input`) → `nonInteractive:true` (red→green)
- [x] Test 5 — clé/secret JAMAIS reconnu (`--gemini-key xxx` ignoré) — test de garde (déjà vert : liste blanche `VALUE_FLAGS`, signalé)
- [x] `parseAnswers` retourne `{ projectName, ownerName, ownerContext, language, nonInteractive }`
- [x] Câblage `bootstrap.mjs` : `const cli = parseAnswers(...)` + `interactive = isTTY && !cli.nonInteractive`
- [x] Branche non-interactive utilise `cli.*` ; branche interactive pré-remplie avec `cli.*`
- [x] Clé toujours différée en non-interactive (`geminiKey=""`), jamais lue depuis argv (via `ask()`→"" quand `rl=null` ; `parseAnswers` ne lit aucune clé)
- [x] Suite verte : 32 tests (27 + 5), `node --check bootstrap.mjs` OK

### B. `git init` si pas de dépôt ✅ TERMINÉ
- [x] Helper pur `shouldInitGit(root)` + test (`scripts/lib/git-init.mjs` + `.test.mjs`, red→green, 2 tests)
- [x] Câblage `bootstrap.mjs` (après §4 génération, sans nouvel en-tête numéroté) : `git init -q` + `add -A` + `commit`, idempotent (skip si `.git`), commit non-fatal si pas d'identité git
- [x] `Bash(git init:*)` ajouté à la whitelist `.claude/settings.json.template`
- [x] Suite verte : 34 tests, JSON template + `node --check bootstrap.mjs` OK
- [~] Side-effect git réel = intégration → couvert par l'e2e §E (pas de test unitaire artificiel)

### C. Réécriture amorce `CLAUDE.md` → NOTICE D'AUTO-INSTALL ✅ TERMINÉ
- [x] Marqueur `<!-- second-brain-starter:bootstrap-stub -->` conservé en tête
- [x] Runbook adressé à Claude (étapes 1→4 : copie détachée, questions en chat sans clé, commande exacte `--non-interactive`, 3 consignes finales dont dépôt distant) + garde-fous
- [x] `isBootstrapStub(CLAUDE.md)` toujours vrai après réécriture (vérifié) → le bootstrap remplacera bien l'amorce
- [x] Neutralité : aucun nom perso / chemin absolu (placeholders `<nom>`, `<URL_DU_REPO>`)

### D. Docs ✅ TERMINÉ
- [x] README — « Option A : démarrage assisté par Claude » (prompt copier-coller + 3 gestes finals + « non au distant = sûr ») + « Option B : manuel » (ex-3 étapes)
- [x] SETUP §2 — sous-section flags `--non-interactive --name/--owner/--context/--lang` (+ env `SB_*`, précédence), git init auto, clé différée, décision dépôt distant ; mention git init dans la liste numérotée
- [x] DEVELOPING — backlog `--non-interactive` marqué livré + note de design « onboarding piloté par Claude » (déterminisme : script fait tout, Claude = emballage)

### E. Tests & e2e ✅ TERMINÉ
- [x] `bootstrap-args.test.mjs` complet (cf. A) — 5 tests verts (formes `--x=v`/`--x v`, précédence, alias `--non-interactive`, garde anti-secret)
- [x] Non-régression « pas de remote » : `scripts/auto-commit.test.mjs` (2 tests) — commit local sans remote = aucun push/aucune erreur ; arbre propre = aucun commit superflu. Test de caractérisation (vert d'emblée, signalé)
- [x] Suite complète verte : 36 harnais (`scripts/lib/*.test.mjs` + `scripts/*.test.mjs`) + 76 moteur RAG (`cd rag && npm test`) + `node --check bootstrap.mjs` OK
- [x] E2E copie jetable (§6) vert — `--owner "Hossam" --context "agent DevOps"` : amorce remplacée (marqueur absent), `.mcp.json` + `.claude/settings.json` générés, `.git` git-inité (1 commit), `.env` clé vide, deps RAG installées, smoke-test MCP OK (5 outils), Hossam injecté ; puis note vault + `auto-commit.mjs` → commit local, pas de push, pas d'erreur

### Final ✅ TERMINÉ
- [x] Commit manuel + push (conventionnel, co-author Claude) — `af406b8` poussé sur `main` (entraîne aussi les commits A–D non encore poussés). Tout vert avant push.

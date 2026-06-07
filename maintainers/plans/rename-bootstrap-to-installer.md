# Plan — Renommer `bootstrap` → `installer` (clarté pour les gens)

> **État : ✅ LIVRÉ** (2026-06-07, commit `24f1240`). Renommage complet appliqué
> (D1 `installer.mjs` · D2 complet · D3 marqueur `installer-stub` · D4 pas de shim).
> Filet vérifié : suite **74/74 verte**, **E2E install exit 0** + connexion MCP OK,
> et le `CLAUDE.md` généré ne porte **aucun marqueur** (preuve bout-en-bout
> qu'`isInstallerStub` reconnaît la nouvelle valeur et écrase l'amorce). Seule
> mention « bootstrap » restante : un usage générique dans le vault d'exemple
> (volontaire). Archive — plus rien à reprendre.

## Motivation (Thomas, 2026-06-07)

« bootstrap » n'est pas limpide pour le grand public. **« installer / installeur »**
est plus fidèle à ce que fait le script et **plus lisible pour les gens**. Le moteur
du renommage est donc la **lisibilité côté utilisateur** → priorité absolue au
**nom de fichier + commande + docs**. Le reste (identifiants internes, commentaires)
suit pour la cohérence.

> **Revu après le plan run-node (2026-06-07).** Les **compteurs d'occurrences
> ci-dessous restent exacts** : la livraison `harden-run-node-smoke-and-coverage`
> n'a introduit **aucune** nouvelle référence « bootstrap ». Seuls des **numéros de
> ligne ont dérivé** (lignes ajoutées dans `SETUP.md` ≈ +5, `DEVELOPING.md` ≈ +12) —
> les pivots ont été recalés dans les étapes 3-5. L'exécuteur reste invité à
> **grepper** (étape 8) plutôt qu'à se fier aux numéros, qui restent un snapshot.

## Inventaire des références (relevé 2026-06-07, `git ls-files`, hors `maintainers/`)

**Fichiers à renommer :**
- `bootstrap.mjs` → `installer.mjs` (le script lui-même, 13 occurrences internes)
- `scripts/lib/bootstrap-args.mjs` → `scripts/lib/installer-args.mjs`
- `scripts/lib/bootstrap-args.test.mjs` → `scripts/lib/installer-args.test.mjs`

**Référence CRITIQUE (pivot du flux assisté) :**
- `CLAUDE.md` (amorce, l.47) : la **commande exacte** `node bootstrap.mjs
  --non-interactive --name … --dest … --owner … --lang …` que Claude **copie
  telle quelle**. Toute coquille casse l'install pilotée par Claude.

**Docs user-facing (à balayer) :** `README.md` (9), `SETUP.md` (19, dont la commande
non-interactive l.105 et le tableau de dépannage l.277-278 — recalés post run-node),
`CONNECTORS.md` (2), `.env.example` (1, « fait par node bootstrap.mjs »).

**Docs dev :** `DEVELOPING.md` (18, dont le snippet de test l.106 — recalé post
run-node — `… && node bootstrap.mjs < /dev/null`), `.gitignore` (2, commentaires l.43/47).

**Code (commentaires + 1 identifiant) :** `scripts/lib/rag-launcher.mjs` (5,
commentaires « écrit par le bootstrap »), `scripts/lib/claude-md.mjs` (4, dont le
**marqueur** — voir D3), `scripts/lib/demo.mjs`, `example-notes.mjs`,
`gemini-key.mjs`, `mcp-smoke.mjs`, `connectors-catalog.mjs` (commentaires),
`scripts/verify-rag.mjs` (2), `scripts/lib/claude-md.test.mjs` (6, noms de tests +
marqueur), `bootstrap-args.test.mjs` (1).

**Mentions « tangentes » (à corriger si pertinent, sinon laisser) :**
`vault/backlog/harnais.md` (1), `.claude/skills/tdd-discipline/SKILL.md` (1).

> Le **marqueur** vit dans `scripts/lib/claude-md.mjs` :
> `BOOTSTRAP_STUB_MARKER = "<!-- second-brain-generator:bootstrap-stub -->"`,
> testé par `isBootstrapStub()`. Voir **D3**.

## Décisions à valider (avant d'exécuter)

- **D1 — Nom du fichier/commande.** Recommandé : **`installer.mjs`** (le « substantif
  outil », cohérent avec le filename anglais existant) → `node installer.mjs …`.
  Alternative : `install.mjs` (lecture « verbe/action »). *À trancher.*
- **D2 — Portée.** Recommandé : **renommage complet** (fichier + commande + docs +
  commentaires + identifiants de lib) → cohérence totale, plus de « bootstrap »
  résiduel qui sèmerait la confusion pour un futur dev. Alternative « minimale »
  (fichier + commande + docs seulement) = plus rapide mais laisse le code
  incohérent. *Reco : complet.*
- **D3 — Marqueur `bootstrap-stub` / `isBootstrapStub`.** Recommandé (si D2 complet) :
  renommer en `installer-stub` / `isInstallerStub` /
  `INSTALLER_STUB_MARKER = "<!-- second-brain-generator:installer-stub -->"`.
  ⚠️ Wrinkle bénin : un CLAUDE.md déjà généré portant l'ANCIEN marqueur ne serait
  plus reconnu comme « amorce écrasable » — sans gravité (template + checker sont
  renommés ensemble dans le même clone ; pas de cerveau « à moitié migré » réaliste).
  Alternative : **garder** le marqueur tel quel (invisible pour l'utilisateur, zéro
  churn). *À trancher — léger penchant pour renommer, par cohérence.*
- **D4 — Shim de rétrocompat.** Garder un mince `bootstrap.mjs` qui ré-exécute
  `installer.mjs` en affichant « renommé en installer.mjs » ? Recommandé : **non**
  (projet jeune, pas de base installée à ménager → rename propre). *Reco : non.*

## Ordonnancement avec l'autre plan

Si le plan **`harden-run-node-smoke-and-coverage.md`** est aussi joué : exécuter ce
renommage **EN DERNIER**. Il balaie tout le code, **y compris** les nouveaux
commentaires/refs introduits par le plan run-node (sinon il faudrait re-balayer).

## Étapes

### 1. Renommer les fichiers (préserver l'historique)
- `git mv bootstrap.mjs installer.mjs`
- (si D2 complet) `git mv scripts/lib/bootstrap-args.mjs scripts/lib/installer-args.mjs`
  et le `.test.mjs` correspondant.

### 2. Réparer les imports cassés par le renommage
- `installer.mjs` importe `./scripts/lib/installer-args.mjs` (ex `bootstrap-args`).
- Tout autre fichier qui importe `bootstrap-args` → pointer vers `installer-args`.
- Lancer la suite : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (les
  imports cassés ressortent immédiatement = filet).

### 3. ⚠️ Commande d'amorce — `CLAUDE.md` l.47 (LE point critique)
- Remplacer `node bootstrap.mjs --non-interactive …` par
  `node installer.mjs --non-interactive …`. **Mot pour mot** : c'est la commande que
  Claude copie pour piloter l'install. La tester en E2E (étape 8).
- `CLAUDE.md.template` : **vérifié 2026-06-07 — la commande n'y figure PAS** (zéro
  « bootstrap » dans le template) → rien à corriger ici, l'amorce-commande ne vit que
  dans `CLAUDE.md`. (Re-grepper avant exécution au cas où ça aurait changé.)

### 4. Docs user-facing
- `README.md`, `SETUP.md` (dont l.63/105/211/277-278 — recalés post run-node ;
  ex-l.58/100/208/272-273), `CONNECTORS.md`,
  `.env.example` : remplacer `node bootstrap.mjs` → `node installer.mjs`, et les
  formulations « le bootstrap » → « l'installeur ».
- Garder le **français naturel** : le script = « l'installeur » (déjà « installateur
  interactif » dans l'ancien en-tête) ; en code/commande = `installer.mjs`.

### 5. Docs dev
- `DEVELOPING.md` (18 occurrences, dont le snippet de test l.106 — recalé post
  run-node, ex-l.94 :
  `cp -R . /tmp/sbg-test && cd /tmp/sbg-test && node installer.mjs < /dev/null`).
- `.gitignore` (commentaires l.43/47).

### 6. Commentaires de code
- `rag-launcher.mjs`, `claude-md.mjs`, `demo.mjs`, `example-notes.mjs`,
  `gemini-key.mjs`, `mcp-smoke.mjs`, `connectors-catalog.mjs`, `verify-rag.mjs` :
  « le bootstrap » → « l'installeur ». L'en-tête de `installer.mjs` lui-même
  (« installateur interactif du Second Brain Generator ») reste juste — vérifier la
  cohérence du wording.

### 7. (Si D2 complet / D3) Identifiants & marqueur
- `isBootstrapStub` → `isInstallerStub`, `BOOTSTRAP_STUB_MARKER` →
  `INSTALLER_STUB_MARKER` (+ valeur `…:installer-stub`), dans `claude-md.mjs`,
  ses imports (`installer.mjs`), et `claude-md.test.mjs` (noms de tests + assertions
  sur la valeur du marqueur).
- ⚠️ Si on change la **valeur** du marqueur, mettre à jour l'amorce (le CLAUDE.md /
  template qui PORTE le commentaire-marqueur) pour qu'`isInstallerStub` la
  reconnaisse. Tester que `gen()` écrase toujours l'amorce (cf. `claude-md.test`).

### 8. Vérifications (le filet)
- **Suite complète verte** : `node --test scripts/lib/*.test.mjs scripts/*.test.mjs`.
- **Grep résiduel** (hors `maintainers/` = archives, et hors `.git`) :
  `grep -rni bootstrap . --exclude-dir=maintainers --exclude-dir=.git
  --exclude-dir=node_modules` → ne doit renvoyer **que** ce qu'on a sciemment gardé
  (idéalement rien, hors choix D3/D4 documentés).
- **E2E install (preuve de la commande d'amorce)** : `rm -rf /tmp/brain-rename-test
  && node installer.mjs --non-interactive --name brain-rename-test --dest /tmp
  --owner Test --lang fr` → sortie 0, smoke MCP OK. Puis vérifier que l'amorce
  **générée** dans le cerveau de test ne référence plus `bootstrap.mjs` (au cas où
  une doc copiée la mentionnerait) et que tout pointe `installer.mjs`. Nettoyer.

### 9. Mentions tangentes
- `vault/backlog/harnais.md`, `.claude/skills/tdd-discipline/SKILL.md` : corriger
  si la mention parle de NOTRE script ; laisser si c'est un usage générique du mot.

## Garde-fous (à ne pas enfreindre)
- **`git mv`** (pas delete+create) → l'historique des fichiers est préservé.
- **La commande d'amorce est sacrée** : la prouver en E2E après renommage (étape 8).
- **Renommage pur** : aucun changement de comportement, d'argument CLI, de chemin
  généré. Si un test métier change de résultat → c'est un bug du renommage, pas une
  évolution voulue.
- **Ne pas réécrire l'historique** ni les archives `maintainers/plans/` (le présent
  plan et le précédent parlent de « bootstrap » → normal, c'est daté).
- **Neutralité / pas de fuite** : inchangé (`grep` de noms tiers reste vide).

## Hors périmètre
- Tout changement fonctionnel (étapes d'install, smoke-tests, RAG…) : non, autre lot.
- Renommer « bootstrap » là où il désignerait un concept générique non lié à notre
  script (peu probable ici).
- Rétrocompat élaborée (shim, alias) au-delà de D4.

## Commits suggérés (séparés)
1. `refactor: renommer bootstrap.mjs → installer.mjs (+ lib args) via git mv`
2. `refactor: commande d'amorce + docs (bootstrap → installeur)`
3. `refactor: commentaires de code (bootstrap → installeur)`
4. (si D3) `refactor: marqueur installer-stub (ex bootstrap-stub)`

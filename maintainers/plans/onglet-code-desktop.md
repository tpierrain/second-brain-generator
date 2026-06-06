<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🔭 À FAIRE (créé 2026-06-06) — PRIORITÉ N°1 du backlog.            -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — rendre le second cerveau fiable depuis l'app desktop Claude (onglet Code), cible managers non-devs

> **STATUT : 🔭 À FAIRE** (créé le 2026-06-06). **Priorité n°1** du backlog du générateur. La
> traduction EN (`translate-to-english.md`) est explicitement repoussée **tout à la fin** : tant
> que l'install n'est pas fiable sur une machine « Claude desktop seul », rien d'autre ne compte.
>
> **Décisions d'archi associées :** [`../decisions/0005-support-onglet-code-desktop.md`](../decisions/0005-support-onglet-code-desktop.md)
> (cible desktop officielle) et [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)
> (contrat MCP stable).
>
> Plan auto-porteur : une session Claude vierge doit pouvoir l'exécuter en ne lisant QUE ce fichier
> + les fichiers cités. Discipline **TDD** (skill `tdd-discipline`), baby-steps, fail-first,
> refactor. Commits **manuels** en conventionnel + co-author Claude. **Vérifier les chemins/API
> exacts en lisant le repo avant d'éditer** (ne pas se fier aveuglément aux noms cités ici).

---

## 0. Objectif & périmètre

Permettre à des **managers non-devs** (engineering managers, product managers, responsables) d'**installer
et d'utiliser** un second cerveau depuis l'**onglet « Code » de l'app desktop Claude**, de façon
**fiable** — pas seulement depuis le terminal (Claude Code CLI).

**Hors périmètre :** le cross-IA (autre client que Claude) — cf. ADR 0004. L'onglet Code **est**
Claude Code sur une autre surface : ce plan n'est donc PAS le chantier cross-IA, juste Claude Code
fiabilisé en desktop.

## 1. Anecdote fondatrice (le « pourquoi », détaillée dans ADR 0005)

Poste de **Richard** (non-dev), 2026-06-05, depuis l'onglet Code : machine **nue** (ni git, ni npm,
ni node). Pendant l'install, **Claude a improvisé des installs** → état à moitié cassé ; le **RAG
n'a pas démarré** → la 1re question de démo (Star Wars) a répondu **depuis Internet** au lieu du
vault (bypass silencieux). Repli sur le CLI. Test ultérieur sur la machine de Thomas (toolchain
présente) → OK. **La défaillance était 100 % en amont (toolchain), jamais au runtime.**

## 2. Décisions d'archi prises avec Thomas (2026-06-06)

Ces décisions **réorientent** le plan initial (qui partait sur du *baking* de chemins absolus). À
respecter :

- **D1 — Install MAXIMALEMENT déterministe ; Claude = relais.** On ne confie **aucune logique de
  décision** à Claude pendant l'install (trop peu fiable). Claude lance **deux commandes fixes**
  (pré-vol, puis bootstrap) et **relaie les verdicts**. Toute la logique vit dans des **artefacts
  déterministes** (scripts), pas dans des règles en prose.
- **D2 — Le bootstrap est le superviseur AUTO-VÉRIFIANT de sa propre réussite** (cf. §5). Sandwich :
  `PRE-FLIGHT → cœur → POST-FLIGHT`. Le bootstrap **prouve que le cerveau marche** (pas juste que
  les fichiers sont écrits), **desktop ET CLI**, avant de déclarer le succès.
- **D3 — Route PATH = INSTALLATION au bon endroit, PAS de baking.** On rend la toolchain
  GUI-visible via les **installeurs officiels** (Node `.pkg`, git via Xcode CLT) → `node`/`npm`/
  `npx`/`git` résolus par leur nom, **sans baker de chemin absolu** dans les artefacts générés.
  Seul reliquat toléré : un **self-heal runtime non baké** en tête des scripts hook. **Jamais**
  d'édition active du PATH GUI système (symlink/launchctl/`/etc/paths.d`) — « salit la machine ».
- **D4 — Interdiction à Claude d'improviser des installs** (`brew install`, `curl | sh`…). Le
  pré-vol détecte et **STOP** ; l'humain installe via les installeurs officiels.
- **D5 — Fail-loud quand le RAG est down.** Ni le cerveau ni le bootstrap ne doivent laisser passer
  un bypass silencieux. La constitution générée refuse de fabriquer une réponse hors-vault quand
  `vault-rag` est indisponible ; le **statut de démarrage** (CHANGE 4) passe de « cosmétique » à
  **diagnostic** (c'est l'alerte précoce qui aurait sauvé Richard).
- **D6 — Multi-machine résolu « gratuitement ».** Ne pas baker de chemins ⇒ `.mcp.json`/
  `settings.json` restent **portables** ⇒ le risque §4 du plan initial (chemins absolus commités,
  besoin d'un `--rehydrate`) **disparaît**. C'est l'élégance recherchée : on **supprime** le
  couplage machine au lieu de l'aggraver.

## 3. Invariants à préserver (ne rien casser)

- **Launcher/cerveau** (ADR 0001) : launcher lecture seule ; bootstrap crée un dossier neuf et
  **refuse une cible existante**.
- **Push opt-in** : auto-commit ne pousse que si `secondbrain.autopush=true`.
- **Secrets** : clé Gemini **jamais** en argument CLI ; vit dans `.env` (gitignoré).
- **Multi-OS** : Node pur (pas de bash/jq/sqlite3-CLI dans le cœur) ; `.cmd` sur Windows ; chemins
  JSON normalisés `/` (`toPosix`). **Exception assumée : le pré-vol est un `sh`** (œuf-et-poule,
  cf. §5.1) — prévoir l'équivalent Windows (`.ps1`/`.cmd`) plus tard, macOS d'abord (la cible).
- **Idempotence** du bootstrap.
- **Contrat MCP stable** (ADR 0006) : ne pas faire fuiter de provider-specific dans les outils MCP.

---

## 4. Les changements, par priorité

### 🔴 CHANGE 1 (P0 — bloqueur avéré) — Toolchain fiable + bootstrap auto-vérifiant

Le détail mécanique est en **§5** (c'est le cœur du chantier). En résumé, par sous-lots :

- **1a — Pré-vol déterministe (gate dur).** `scripts/preflight.sh` : vérifie `{node,npm,npx,git}`
  présents **et GUI-visibles** (rejette nvm/asdf/PATH shell-only) ; exit ≠ 0 + liste d'install
  exacte sinon. Amorce `CLAUDE.md` : Claude lance le pré-vol, **STOP si rouge**, **n'improvise
  aucun install** (D4).
- **1b — Post-flight auto-vérifiant.** Étendre `smokeTestMcp` : démarrage du serveur RAG **sous
  PATH GUI-minimal simulé** (preuve desktop), **requête de démo sourcée** (asserte une source du
  vault), hook auto-commit câblé. Verdict PASS/FAIL + exit code (§5.3).
- **1c — Route « installation au bon endroit », pas de baking (D3).** Garder `npx`/`node` par leur
  nom dans `.mcp.json`/`settings.json`. Seul ajout : **self-heal runtime non baké** en tête de
  `scripts/auto-commit.mjs` et `scripts/session-status.mjs` :
  ```js
  process.env.PATH = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter);
  ```
  **Ne durcir (baker un chemin) QUE si** une machine type Richard prouve que le runtime ne résout
  pas node *alors même que le bootstrap a tourné* — non observé à ce jour.

### 🟠 CHANGE 2 (P1) — Pré-approuver le serveur MCP (zéro prompt pour le manager)

Au 1er open, Claude demande d'autoriser `vault-rag` — déroutant pour un non-tech. Le bootstrap
**génère** `.claude/settings.local.json` (déjà gitignoré → per-machine) :
```json
{ "enableAllProjectMcpServers": false, "enabledMcpjsonServers": ["vault-rag"] }
```
- Ajouter tout serveur MCP branché par le wizard connecteurs (`applyConnectorFiles`, `kind:"mcp"`).
- **Idempotent** : si le fichier existe, **fusionner** (union des ids) — réutiliser le style de
  `connectors-merge.mjs`. Ne **rien** mettre pour les connecteurs **natifs** claude.ai.
- ⚠️ Dans CE repo, `.claude/settings.local.json` sert au DEV — le bootstrap génère celui de la
  **cible**, ne touche pas celui du launcher.
- **Test** : unitaire sur la construction/fusion (union idempotente, natifs ignorés).

### 🟠 CHANGE 3 (P1) — Onboarding desktop (sortir du tout-terminal)

- **3a — `--here` (install in place).** Le plus gros cliff UX desktop = le cerveau créé **ailleurs**
  (`~/<nom>`) → le manager doit rouvrir l'onglet Code dessus. Flag `--here` (ou `--dest .`) dans
  `bootstrap-args.mjs` : `TARGET = process.cwd()`, **garde-fou « refuse si non vide »** conservé
  (n'autoriser que vide, ou ne contenant que le clone du launcher). ⚠️ Tradeoff : entaille le modèle
  « cerveau ≠ launcher » → n'autoriser que sur dossier vide, documenter. Si trop risqué : 3b seul.
- **3b — README/SETUP : piste desktop explicite** (gestes « Open folder », **pas** `cd`/`claude`).
- **3c — Message final** du bootstrap : variante desktop (« ouvre l'onglet Code sur `<TARGET>` »)
  à côté de la variante terminal.
- **Test** : `bootstrap-args.test.mjs` (parsing `--here`/`--dest .`, refus si non vide).

### 🟡 CHANGE 4 (P1 — re-priorisé, DIAGNOSTIC) — Statut `SessionStart` visible en desktop

**Re-classé P1 (était P2/cosmétique).** `session-status.mjs` émet repo + RAG + clé Gemini via
`systemMessage` du hook `SessionStart` — **pensé terminal**. **En desktop, ça ne s'affiche pas**
(Thomas n'a pas trouvé comment). Or c'est **l'alerte précoce** qui aurait dit « RAG: down » à
Richard avant la question Star Wars (cf. D5). À traiter sérieusement :
- chercher le canal d'affichage équivalent côté onglet Code (autre champ de hook, sortie visible…) ;
- à défaut, **garantir au moins un signal déterministe** que le manager voit (p. ex. le post-flight
  du bootstrap qui imprime le verdict, et/ou une note dans la constitution). Ne pas se contenter de
  « c'est cosmétique » : le silence est précisément le piège.

### 🟡 CHANGE 5 (P2, doc) — Noms de serveur MCP opaques en desktop

En desktop, un connecteur **natif** claude.ai peut apparaître sous un **UUID**
(`mcp__d0a886b6-…__search_files`) au lieu d'un nom convivial. `sync-sources` utilise déjà des
**placeholders** `mcp__<drive>__…` → pas un bug, juste une **note** à ajouter dans `CONNECTORS.md`
+ section Routage du `CLAUDE.md.template` : « prends le nom exact affiché par la liste d'outils,
lisible ou UUID ».

### 🟢 CHANGE 6 (P2) — Fail-loud RAG dans la constitution générée (D5)

`CLAUDE.md.template` : si les outils `vault-rag` sont indisponibles, **le dire fort** et **ne pas
fabriquer** de réponse depuis Internet/connaissances générales — surtout pour la question de démo.
(Le backbone déterministe reste le statut de démarrage + le post-flight ; ceci est la couche UX.)

---

## 5. Le bootstrap auto-vérifiant, en détail (cœur de CHANGE 1)

Sandwich déterministe ; Claude ne fait que **lancer 2 commandes et relayer** (D1/D2).

### 5.1 PRE-FLIGHT — `scripts/preflight.sh` (avant toute création)
Œuf-et-poule : `bootstrap.mjs` est en node → ne peut pas vérifier l'absence de node. Le 1er gate
doit tourner **sans node** → **POSIX `sh`** (toujours présent sur macOS).
- Vérifie `{node, npm, npx, git}` **présents** ET **GUI-visibles** : binaire résolu hors `~/.nvm`,
  `~/.asdf`, et hors chemins shell-only (heuristique : dans `/usr/local/bin`, `/opt/homebrew/bin`,
  `/usr/bin`…).
- **Exit ≠ 0** + message non-tech exact (« Installe Node depuis https://nodejs.org — installeur
  officiel, **pas** nvm — et git via `xcode-select --install`, puis relance »). **Exit 0** sinon.
- **Amorce `CLAUDE.md`** : « lance `sh scripts/preflight.sh` ; si exit ≠ 0, **colle la sortie et
  STOP** ; **n'installe rien toi-même** ». (D4)
- **Test** : exécuter le script avec un `PATH` trafiqué (node sous un faux `~/.nvm`) → asserte exit
  ≠ 0 ; avec node en emplacement visible → exit 0.

### 5.2 CŒUR — `bootstrap.mjs` (inchangé sur le fond)
Re-vérifie la toolchain par programme (`process.execPath`, `which/where` pour git), puis copie +
génère + `git init` + `npm install`. Toute étape qui rate → exit ≠ 0.

### 5.3 POST-FLIGHT — auto-vérification que ça MARCHE (desktop ET CLI)
Avant de déclarer le succès. **Rapide** (vault de démo minuscule). Étendre `mcp-smoke.mjs` :

- **(structurel, sans clé)** — aucun `{{…}}` résiduel dans les fichiers générés ; le **process**
  du serveur RAG spawn ; `settings.json`/hook résolvent node ; un write simulé déclenche un commit.
- **(runtime desktop)** — démarrer le serveur RAG **avec un PATH GUI-minimal simulé**
  (`env: { PATH: "<minimal>" }`) et confirmer que les outils MCP répondent → **preuve que ça
  marche dans l'environnement desktop**, pas seulement dans le PATH riche du terminal. *C'est la
  vérif unique qui couvre « desktop ET outil ».*
- **(fonctionnel, si clé présente)** — indexer les notes-graine, passer la **question de démo dans
  le RAG**, asserter que la réponse **cite une source du vault** (encode le « tell » de Richard).
  **Si clé absente** : check **reporté explicitement** (« colle ta clé dans `.env` puis pose la
  question de démo ») — **pas** de faux « tout vert ».
- **Verdict** : checklist **PASS/FAIL** imprimée + **exit code** (≠ 0 si check critique rouge).
  Claude relaie tel quel.
- **Frontière clé Gemini** : déterminer en lisant `rag/` jusqu'où le serveur boote sans clé ;
  placer la frontière structurel/fonctionnel en conséquence (honnêteté déterministe).

---

## 6. Validation (le vrai juge de paix)

1. **Repro disponible** : machine **sans Claude Code CLI préinstallé**, type poste de Richard
   (idéalement deux variantes : node via installeur officiel **et** node via nvm pour valider le
   pré-vol 1a).
2. **TDD** chaque change : rouge → vert → refactor. Cibles prioritaires : **pré-vol** (5.1),
   **post-flight smoke sous PATH GUI-minimal** (5.3), **génération `settings.local.json`** (CHANGE 2).
3. **Test d'acceptation end-to-end DESKTOP** (le seul qui compte vraiment) : depuis l'onglet Code,
   coller l'instruction d'install → (a) pré-vol passe ou guide proprement, (b) bootstrap tourne,
   (c) **verdict post-flight vert**, (d) la question de démo répond **sourcée du vault** (pas web),
   (e) un write déclenche le commit auto. Le test CLI ne suffit pas.
4. Ne marquer le DoD que si ça **passe sur une machine sans CLI préinstallé**.

## 7. Definition of Done

- [ ] **(1a)** `scripts/preflight.sh` : détecte `{node,npm,npx,git}` manquants ou non GUI-visibles,
      **STOP** + guide vers les installeurs officiels (piège nvm explicité). Amorce `CLAUDE.md`
      câblée ; **interdiction d'improviser des installs** écrite.
- [ ] **(1b)** Post-flight : serveur RAG démarre **sous PATH GUI-minimal** (smoke vert) ; requête
      de démo **sourcée** asserte une source du vault ; hook auto-commit OK ; **verdict + exit code**.
- [ ] **(1c)** Pas de baking de chemins ; self-heal runtime dans les scripts hook ; artefacts
      générés **portables** (multi-machine sain — D6).
- [ ] **Validé sur une machine type Richard** (sans CLI préinstallé), **depuis l'onglet Code**.
- [ ] `.claude/settings.local.json` généré (`enabledMcpjsonServers` : vault-rag + connecteurs MCP),
      idempotent.
- [ ] `--here` (si retenu) testé ; garde-fous « refuse si non vide » OK.
- [ ] README/SETUP : piste install **desktop** (Open folder, pas `cd`/`claude`).
- [ ] **Statut de démarrage** visible en desktop **ou** signal déterministe de substitution (D5/CHANGE 4).
- [ ] Constitution générée : **fail-loud RAG down** (CHANGE 6).
- [ ] CONNECTORS.md / CLAUDE.md.template : note « noms de serveur opaques en desktop ».
- [ ] Tous les `scripts/lib/*.test.mjs` au vert + nouveaux tests. Aucun `{{…}}` résiduel.

## 8. Fichiers à toucher (récap)

| Fichier | Change |
|---|---|
| `scripts/preflight.sh` (**nouveau**, `sh`) | pré-vol déterministe `{node,npm,npx,git}` GUI-visibles (1a) |
| `CLAUDE.md` (amorce launcher) | câbler le pré-vol comme gate dur ; **interdire l'improvisation d'installs** (D4) |
| `bootstrap.mjs` | re-check toolchain ; orchestration post-flight + **verdict/exit code** ; `settings.local.json` ; `--here` ; message final desktop |
| `scripts/lib/mcp-smoke.mjs` (+ test) | post-flight : **PATH GUI-minimal**, **requête de démo sourcée**, frontière clé (5.3) |
| `scripts/auto-commit.mjs`, `scripts/session-status.mjs` | **self-heal runtime** `process.env.PATH` (1c) ; statut desktop (CHANGE 4) |
| `.claude/settings.json.template` | hooks via `node`/`npx` **par leur nom** (PAS de chemin baké) |
| `.mcp.json.template` | `npx tsx …` par leur nom (PAS de baking) |
| `scripts/lib/connectors-apply.mjs` ou nouveau `settings-local.mjs` (+ test) | construire/fusionner `enabledMcpjsonServers` |
| `scripts/lib/bootstrap-args.mjs` (+ test) | `--here` / `--dest .` |
| `CLAUDE.md.template` | **fail-loud RAG down** (CHANGE 6) ; note noms de serveur opaques |
| `README.md`, `SETUP.md` | piste install desktop |
| `CONNECTORS.md` | note noms de serveur opaques |

---

## 9. Idées différées (ne pas implémenter sans feu vert de Thomas)

- **Composant RAG partagé/upgradable** (ADR 0006, idée sœur) — frotte avec ADR 0003. Le contrat MCP
  stable en est le préalable, mais un composant *partagé upgradable* réintroduit un canal de
  propagation écarté par 0003. **Décision de principe à trancher avec Thomas** (chaque cerveau garde
  sa copie figée vs addendum 0003).
- **`vault_stats` provider-agnostique** (ADR 0006) — sortir le vocabulaire « quota Gemini » au profit
  de « budget d'embeddings / requêtes restantes ». Item backlog propre, lié au contrat MCP stable.
- **Variante Windows du pré-vol** (`.ps1`/`.cmd`) — macOS d'abord (la cible immédiate).

### Rappels de posture (CLAUDE.md de Thomas)
- **Challenger** chaque change : « est-ce que ça vaut la complexité ? ». CHANGE 1/2 = oui. `--here`
  (3a) = à valider (tradeoff modèle launcher). 4/5/6 = légers.
- **Déterminisme** : la logique d'install vit dans des **scripts**, pas dans des règles confiées à
  Claude (D1). Claude = relais de 2 commandes.
- **Pas d'usine à gaz** : rester dans la couche de pilotage ; **ne pas baker** ce que l'installation
  au bon endroit règle déjà (D3/D6).

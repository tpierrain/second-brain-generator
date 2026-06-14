# 🔧 Fix — l'install force un hand-off « NOUVELLE conversation rootée dans le cerveau » (findings A + B)

> **STATUS : ✅ LIVRÉ (2026-06-15, en TDD).** Bandeau déterministe `buildHandoff` câblé dans
> l'installeur, amorce durcie (A + B), `install-handoff` exclu du brain. PROUVÉ end-to-end : install
> fraîche `~/qa-handoff` → la sortie se termine par le gros bandeau « installer ≠ cerveau, NOUVELLE
> conversation rootée, Desktop d'abord », purge citée = `node scripts/clear-example-notes.mjs`, et
> `install-handoff.mjs` n'est PAS copié dans le brain. Suites vertes : harness 225/225, rag 141/141, tsc clean.
> **Scope : Installer + amorce (CLAUDE.md du launcher).** Pas de moteur (`rag/`) touché.
> **Branche : `main`** (docs + installeur ; petit fix ciblé, pas de PicΦ feature). Travail **en TDD**.

---

## 🎯 Pourquoi (origine : QA install « classique » de la PR #10, 2026-06-15)

QA d'une **install classique** (réponses en chat → `installer.mjs --non-interactive`, brain `~/brainy`,
in-process, locale fr). **Tout le cœur est VERT et prouvé sur le terrain dans la vraie app Desktop :**

- [x] RAG répond **depuis le vault** (Pélagie de Mollecuisse / TRF 98,7 % / 4 sources) — introuvable ailleurs.
- [x] **« quelle version ? » → « moteur en v3.0.0 »** (lu `vault_stats.source.ref`, distinct du `rag 1.1.0`).
- [x] **« y a-t-il une nouvelle version ? » → « à jour, v3.0.0 »** (lecture seule : manifest + `ls-remote` +
  release latest ; ignore `V1`/`V2`). → la chaîne version + check-update marche end-to-end.
- [x] Post-flight + `verify-rag` exit 0 ; `git init` sans remote ; fichiers sacrés générés.

**MAIS 2 findings sur le HAND-OFF** (le texte de fin que la session d'install produit) :

- **Finding A (critique démo) — le hand-off est CLI-only.** Il n'affiche que `cd ~/brainy && claude`,
  sans dire **« sors de cette conversation et ouvre-en une NOUVELLE, rootée dans le dossier du cerveau »**,
  et sans **Desktop d'abord**. Pour un non-dev, c'est *le* point qui casse tout (pas d'auto-commit,
  permissions qui re-demandent — cf. amorce `CLAUDE.md` §4 step 3, [[session-rooted-in-tmp-not-brain]],
  [[install-handoff-feedback-gemini]] P2/P3, déjà parké). **Thomas (technique) a su ouvrir une conv
  neuve ; un non-dev, non.**
- **Finding B — commandes post-install fausses.** La session dit que purger les notes d'exemple **et**
  brancher des connecteurs « se relancent via `node installer.mjs` (vers un nouveau brain) ». **Faux** :
  `installer.mjs:236` **refuse un dossier existant** → ne touchera jamais `~/brainy`. La vraie purge =
  **`node scripts/clear-example-notes.mjs`** *depuis le brain* ; les connecteurs ne sont **pas**
  rejouables en standalone (logique interactive dans `installer.mjs` → post-install = édition manuelle
  de `.mcp.json` / `.claude/settings.json`).

---

## 💡 Décision de design (validée par Thomas)

**L'installeur FORCE, à la toute fin, un GROS bandeau déterministe** (ADR 0009 — préférer le
déterministe au « j'espère que le modèle obéira ») :

> ⚠️ **CECI EST L'INSTALLEUR (le launcher), PAS votre second cerveau.** Pour l'utiliser, ouvrez une
> **NOUVELLE** conversation/fenêtre **rootée dans `<dossier du cerveau>`** — **Desktop d'abord**, terminal ensuite.

Avantage : (1) en install manuelle, c'est la dernière chose à l'écran ; (2) en install pilotée par une
session Claude, le modèle **lit ce bandeau** dans la sortie outil et le **relaie** — surtout si l'amorce
lui dit de le **reproduire verbatim** au lieu de composer le sien (couplage anti-hallucination).

> ⚠️ **Cause racine** = `installer.mjs:763-768` imprime un « Next steps » CLI-only (`cd … && claude` en
> tête) que le modèle recopie. On remplace ce bloc par le bandeau.

---

## 📋 Tracking

- [x] **1. Builder pur `buildHandoff` (TDD) — le bandeau de fin** _(2026-06-15)_
  - [x] 1a. **RED déjà écrit** : `scripts/lib/install-handoff.test.mjs` (5 invariants). Vérifié RED
    (ERR_MODULE_NOT_FOUND) en premier.
  - [x] 1b. **GREEN** : `scripts/lib/install-handoff.mjs` → `buildHandoff({ target, name, demo })` renvoie
    les **lignes** du bandeau (cadre `═`, ⚠️ « THIS WINDOW IS THE INSTALLER — NOT your second brain »,
    chemin, **Desktop d'abord** puce dossier + nom, **puis** terminal `cd <target> && claude`, question
    démo, bloc « optionnel, DEPUIS le brain » avec `node scripts/clear-example-notes.mjs` + « never re-run
    the installer for it »). **Sans ANSI** — la couleur s'applique au câblage. 5/5 verts.
  - [x] 1c. **Refactor** : doc de signature alignée sur les params réellement utilisés ; 5/5 verts.
- [x] **2. Câbler dans `installer.mjs`** _(2026-06-15)_
  - [x] 2a. Bloc `Next steps` remplacé par une boucle sur `buildHandoff({ target: toPosix(TARGET),
    name: basename(TARGET), platform, demo: DEMO })` (lignes ⚠️ colorées en `c.B/c.Y`).
  - [x] 2b. Bloc clé Gemini CASE B conservé **au-dessus** du bandeau (inchangé).
  - [x] 2c. `import { buildHandoff }` ajouté ; `basename` ajouté à l'import `node:path` ; `node --check` OK.
- [x] **3. Durcir l'amorce `CLAUDE.md` (launcher) — A + B** _(2026-06-15)_
  - [x] 3a. **A** : step 4.3 — nouveau garde-fou « ANCHOR ON THE INSTALLER'S BANNER, DON'T FREE-COMPOSE »
    → reproduire le bandeau **VERBATIM**, jamais une simple ligne `cd … && claude`, jamais sans Desktop.
  - [x] 3b. **B** : nouveau garde-fou « Post-install tweaks are brain-side, NOT a re-run of the installer »
    → purge = `node scripts/clear-example-notes.mjs` **depuis le brain** ; connecteurs = édition manuelle
    `.mcp.json`/`.claude/settings.json` ; `installer.mjs` refuse un dossier existant → jamais le relancer.
- [x] **4. Self-carry — EXCLU du brain** _(2026-06-15)_
  - [x] 4a. **Décision : EXCLURE** (purement launcher-side, comme `installer.mjs`). Ajout de
    `scripts/lib/install-handoff` à `DEV_ONLY_PREFIXES` (couvre `.mjs` + `.test.mjs`) + test
    `tracked-files`. Test self-carry update-engine intact (install-handoff n'est PAS une lib moteur).
    Le câblage `installer.mjs` n'est pas affecté (l'installeur lit le launcher, pas le brain).
- [x] **5. Suites vertes** _(2026-06-15)_ — harness **225/225**, rag **141/141**, `tsc --noEmit` clean.
- [x] **6. Preuve empirique — install FRAÎCHE** _(2026-06-15)_
  - [x] 6a. `node installer.mjs --non-interactive --name qa-handoff --dest "$HOME" --owner Thomas --lang fr --embedder in-process` → exit 0, post-flight canari OK.
  - [x] 6b. Sortie terminée par le **gros bandeau** « installer ≠ cerveau, NOUVELLE conversation rootée
    dans `/Users/tpierrain/qa-handoff`, Desktop d'abord » ; purge citée = `node scripts/clear-example-notes.mjs`.
  - [x] 6b-bis. Exclusion vérifiée : `~/qa-handoff/scripts/lib/install-handoff*` ABSENT ; `clear-example-notes.mjs` PRÉSENT dans le brain.
  - [ ] 6c. (Optionnel, fort) Install pilotée par une session Claude — non rejouée (cœur déterministe prouvé ; la consigne verbatim couvre le relais).
  - [x] 6d. Nettoyé : `rm -rf ~/qa-handoff`.
- [x] **7. Commit `main`** _(2026-06-15)_ — docs+installeur, plan coché + **archivé** dans
  `maintainers/plans/archived/` ([[plan-done-equals-archived]]).

> Cocher `- [x]` _(date · commit)_ à chaque étape terminée.

---

## 🧭 État pour reprise (après `/clear`)

- **Repo** : `~/Dev/second-brain-generator`, branche **`main`** (à jour : v3.0.0 mergée + taggée, badges
  README posés). Arbre **propre** sauf le test RED déjà écrit (`scripts/lib/install-handoff.test.mjs`,
  **non commité**) — c'est l'étape 1a faite.
- **Fichiers à créer/toucher** : `scripts/lib/install-handoff.mjs` (nouveau) ; `installer.mjs`
  (bloc L763-768 + import) ; `CLAUDE.md` (amorce, steps 4.3 & post-install) ; éventuellement
  `scripts/lib/tracked-files.mjs` + son test (étape 4a si on exclut le fichier du brain).
- **Invariants du bandeau** : déjà figés dans le test (installer≠brain · NOUVELLE conv + chemin ·
  Desktop-AVANT-CLI · nom du brain · `clear-example-notes.mjs` jamais `installer.mjs`).
- **Démo** : viser que la nouvelle install (post-fix) montre le bandeau **avant** la démo client.
- **Ne PAS** ré-ouvrir le débat Linux/badges (déjà tranché : badge `runs on macOS · Windows`).
- **Mémoires liées** : [[install-handoff-feedback-gemini]] (le finding parké qu'on dé-parke ici),
  [[session-rooted-in-tmp-not-brain]], [[desktop-folder-chip-is-the-switcher]],
  [[prefer-deterministic-adr-0009]], [[qa-pr10-and-update-engine-fix]] (cohérence DEV_ONLY_PREFIXES).

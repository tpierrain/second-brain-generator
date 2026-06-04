# ADR 0001 — Launcher réutilisable vs cerveau créé ailleurs

- **STATUT :** ACTÉ (2026-06-03) — supersède l'approche « transform in-place ».
- **Plan d'implémentation associé :** [`../plans/launcher-vs-brain.md`](../plans/launcher-vs-brain.md) (LIVRÉ).

## Contexte

La cause racine de tous les corner-cases git (strip-remote, garde-fou mainteneur, gating
`wasStub`) était de **recycler le clone du starter comme cerveau** de l'utilisateur. On dissocie
les deux rôles.

## Décision

- **Launcher** = le repo générateur cloné. **Source en lecture seule, RÉUTILISABLE** : un même
  launcher sur un poste peut bootstrapper plusieurs cerveaux différents. Le bootstrap n'écrit
  **jamais** dedans (son `CLAUDE.md` reste l'amorce, son `rag/` reste sans `node_modules`).
- **Cerveau** = un dossier **neuf que le bootstrap CRÉE lui-même** (nom + emplacement donnés par
  l'utilisateur). Comme c'est nous qui le créons et y déposons les fichiers, puis `git init`
  dedans → **aucun lien vers le launcher, par construction**. Plus de chirurgie git.

### Renommage `starter` → `generator`

`second-brain-starter` → **`second-brain-generator`** (« Second Brain Generator »).
« starter »/« template » portaient le mauvais modèle (graine in-place / copier-modifier) ;
« générateur » = outil qui PRODUIT des cerveaux, réutilisable, non modifié → colle à l'archi
launcher↔cerveau. Métaphore « graine » gardée (= le cerveau qu'on fait pousser, ≠ le générateur).

## Règles qui en découlent

- On **refuse** un dossier cible **existant** (garantit que c'est bien le bootstrap qui le crée).
- On ne supprime **rien** : le launcher reste, l'utilisateur le jette s'il veut.
- Copie = fichiers **suivis** du launcher (`git ls-files`, en Node pur) → exclut auto `.git`,
  `node_modules`, `.env`, et les fichiers de dev (`DEVELOPING.md`, `maintainers/` — cf.
  `filterCopyable`).
- `{{PROJECT_ROOT}}` (hook auto-commit) et toutes les opérations (génération, `git init`,
  `npm install`, smoke-test) pointent sur la **cible**, pas le launcher.
- **Push opt-in (`secondbrain.autopush`) GARDÉ** ; **strip-remote + garde-fou `CLAUDE.local.md`
  RETIRÉS** (devenus inutiles).
- « Use this template » (GitHub) = juste une façon d'obtenir le launcher, plus « ton repo dès le
  jour 1 ».

## Conséquences multi-OS (Windows inclus)

- Emplacement par défaut calculé en Node : `path.join(os.homedir(), name)` — JAMAIS un `~/…`
  littéral. `--dest <dir>` pour surcharger. Tous les chemins via `path.join`/`path.resolve`.
- Copie des fichiers suivis en **Node pur** (`git ls-files -z` + copie `fs`), PAS `git archive | tar`
  (pipe shell + tar = fragile sous Windows).
- `{{PROJECT_ROOT}}` dans `settings.json` (JSON) : un chemin Windows `C:\…` casse l'échappement →
  écrire des `/` (Node les accepte sous Windows) ou JSON-échapper.
- Refus-si-existe via `existsSync` ; `git`/`npm` avec `cwd` sur la cible.

## Rôle de Claude (amorce)

Cloner le launcher, poser les questions (nom, emplacement, langue), lancer **UNE** commande
bootstrap `--non-interactive`. Le bootstrap décide et fait tout (déterminisme dans le script,
Claude = emballage conversationnel minimal).

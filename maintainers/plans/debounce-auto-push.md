# Plan — Debouncer l'auto-push (commit par-édition, push 1× par tour via le hook `Stop`)

> **À exécuter après un `/clear`.** Branche : `feat/debounce-auto-push`.
> Objectif Thomas : les **commits permanents** lui vont, mais le **push à chaque édition** doit être
> debouncé (sinon micro-pushs → risque de rate-limit GitHub/GitLab + « temps fou »). Solution la plus
> **déterministe** possible. TDD (discipline `tdd-discipline`). Valider **empiriquement**.

---

## Tracking

- [x] **Part 0 — Pré-requis / vérif rapide** _(2026-06-13)_
  - [x] Confirmer que `Stop` est bien l'event Claude Code voulu (≠ `SubagentStop`) et qu'un hook `Stop` qui sort `exit 0` ne force pas de continuation _(confirmé : seul exit 2 / decision:block rebloque ; exit 0 = stop normal)_
  - [x] Relire `.claude/settings.json.template` (hooks) + `scripts/auto-commit.mjs` + `scripts/auto-commit.test.mjs` _(push par-édition = auto-commit.mjs:46-55 ; template rendu par installer.mjs:440, pas de hook hardcodé ailleurs)_
- [x] **Part 1 — Extraire un seam de push testable (`scripts/lib/git-push.mjs`, TDD)** _(2026-06-13)_
  - [x] `shouldPush({ hasRemote, autopush, hasUpstream, unpushedCount })` → `boolean` (matrice : no-remote→false, autopush≠true→false, pas d'upstream→false*, 0 commit en attente→false, sinon true)
  - [x] `git-push.test.mjs` vert (matrice complète) _(5/5)_
  - [x] (*) décidé : « remote + autopush mais pas d'upstream » → **skip best-effort** (pas de `-u` automatique ici — câblé à l'install)
- [x] **Part 2 — `scripts/auto-push.mjs` (nouveau hook `Stop`, best-effort)** _(2026-06-13)_
  - [x] dérive REPO depuis la position du script (comme auto-commit) ; runner git injectable pour le test _(cœur `attemptPush({git, sleep})` + entrée CLI guardée `import.meta`)_
  - [x] lit `git remote`, `git config secondbrain.autopush`, upstream, `git rev-list @{u}..HEAD --count`
  - [x] si `shouldPush` → `git push` ; échec → 1 retry après pause courte → si encore KO, message `⚠️ PUSH FAILED…`, **exit 0**
  - [x] **TOUJOURS `exit 0`** (jamais bloquant) ; ignore le stdin du hook
  - [x] `auto-push.test.mjs` : push only when remote+autopush+unpushed ; skip sinon ; throw du runner avalé → exit 0 ; rien à pousser → pas d'appel réseau _(5/5)_
- [x] **Part 3 — `scripts/auto-commit.mjs` devient commit-only** _(2026-06-13)_
  - [x] retirer le bloc push (`hasRemote && autopush && git push` + `sleepSync`) _(sleepSync mort retiré aussi)_
  - [x] garder add + commit + le early-exit « rien de sale »
  - [x] MAJ `auto-commit.test.mjs` : « commit-only, ne pousse JAMAIS » (même avec remote+autopush) _(4/4)_
- [ ] **Part 4 — Câbler le hook `Stop` dans `.claude/settings.json.template`**
  - [ ] ajouter un bloc `"Stop"` → `{{NODE}} "{{PROJECT_ROOT}}/scripts/auto-push.mjs"` (timeout 30000)
  - [ ] PostToolUse `Write|Edit` reste → `auto-commit.mjs` (inchangé côté câblage)
  - [ ] vérifier que l'installer rend bien le template tel quel (substitution `{{NODE}}`/`{{PROJECT_ROOT}}`) — pas de hooks hardcodés ailleurs
- [ ] **Part 5 — Doc**
  - [ ] MAJ `SETUP.md` (section auto-commit/push) : commits locaux par édition, push 1×/tour, rattrapage au Stop suivant, multi-machine = skill `sync`
  - [ ] MAJ `CLAUDE.md.template` si la mécanique y est décrite (auto-commit/push)
  - [ ] note de suivi : backport manuel possible sur les cerveaux déjà générés (Inqom Rain)
- [ ] **Validation**
  - [ ] suite complète verte (incl. `git-push.test.mjs` + `auto-push.test.mjs` + `auto-commit.test.mjs` MAJ)
  - [ ] install jetable + remote bidon : N éditions dans un tour → N commits, **1 seul push** (observer `git log`/reflog du remote, ou tracer les invocations)
  - [ ] push KO simulé (mauvaise URL) → commits locaux intacts, exit 0, message d'avertissement, **pas de blocage**
  - [ ] no-remote / autopush=false → ni commit-push ni erreur (parité avec aujourd'hui)
  - [ ] cleanup des dossiers de test
- [ ] **Commits (séparés, sur la branche)** + plan archivé per [[plan-done-equals-archived]]

---

## Diagnostic (état des lieux, vérifié 2026-06-13)

- **Indexation** = ✅ déjà debouncée + incrémentale, **rien à faire** :
  - `vault-watcher.ts` (chokidar) **dans le process du serveur MCP** (long-lived) → `ReindexScheduler`
    (`reindex-scheduler.ts`) : debounce 5 s, coalescing pendant un run (1 rerun max), exécution sérialisée.
  - `reindex(false)` incrémental (sha256/fichier, skip si hash identique) → seuls les fichiers modifiés
    sont ré-embeddés (la partie chère). Index `rag/.cache/vault.db` **gitignored** → 0 pollution commit/push.
  - → « debouncer par fichier » est inutile : scan global cheap + ré-embedding ciblé = déjà optimal.
- **auto-commit** = sur **chaque** `Write|Edit` (`PostToolUse`), local & rapide → **gardé** (Thomas OK).
- **auto-push** = ❌ **le problème** : poussé **dans le même hook par-édition** (`auto-commit.mjs:48`),
  donc 1 push réseau **par édition** dès `secondbrain.autopush=true`, + `sleepSync(3000)` bloquant en
  cas d'échec. C'est ce qui faisait « temps fou ».

## Design (Option B — push sur `Stop`)

```
PostToolUse "Write|Edit"  →  scripts/auto-commit.mjs   (git add + commit, PAR ÉDITION)   ← commit-only
Stop                       →  scripts/auto-push.mjs     (git push si conditions, 1× / TOUR) ← NOUVEAU
```

- **Pourquoi déterministe** : `Stop` se déclenche **une fois par tour** de l'agent principal, quel que
  soit le nombre d'éditions. 30 éditions = 30 commits locaux + **1 push**. Aucun timer en mémoire (le
  hook est un process éphémère), aucun fichier d'état → c'est l'event lui-même qui fait le « debounce ».
- **Rattrapage** : push pousse **tous** les commits en attente (`@{u}..HEAD`). Échec → commits gardés
  localement, repoussés au `Stop` suivant. Rien perdu, rien figé.
- **Garde-fous conservés** : opt-in `secondbrain.autopush=true` ; jamais de push vers un remote hérité
  du launcher (la condition reste la présence d'un remote **+** l'opt-in explicite).

## Points d'attention (corner cases)

1. Cibler `Stop`, **pas** `SubagentStop`.
2. `auto-push.mjs` **toujours `exit 0`** (best-effort, jamais bloquant ; ignore le stdin du hook).
3. Pousser **tout** `@{u}..HEAD` (auto-rattrapage), pas « le dernier commit ».
4. Multi-fenêtres / multi-machines → races `git push` (non-fast-forward) : best-effort, le perdant
   repart au `Stop` suivant. **Pas** de `git pull --rebase` ici (= skill `sync`). Limite documentée.
5. Pas d'upstream → skip propre + message (jamais throw ; `-u` reste câblé à l'install).
6. Tours sans édition → `@{u}..HEAD` vide → sortie rapide, **pas d'appel réseau**.
7. `timeout` du hook `Stop` confortable (30 s) ; le retry/sleep ne ralentit plus chaque save.
8. Cerveaux déjà générés (Inqom Rain) = settings figés → backport manuel (note de suivi).
9. Tests : `auto-commit` devient « ne pousse jamais » ; le push part dans `auto-push.test.mjs`.

## Commits suggérés (séparés, sur la branche)
1. `feat(brain): tested git-push decision seam (shouldPush matrix)`
2. `feat(brain): auto-push.mjs — push pending commits once per turn (Stop hook), best-effort`
3. `refactor(brain): auto-commit.mjs becomes commit-only (push moves to the Stop hook)`
4. `feat(brain): wire the Stop→auto-push hook in settings.json.template`
5. `docs: auto-commit per edit + auto-push once per turn (SETUP/CLAUDE templates)`

## Rappels transverses
- **Le plus déterministe possible** : B seul, **sans** fichier d'état ni timer (throttle 60 s écarté —
  ajout trivial plus tard si un cas réel le justifie).
- **Best-effort, non-fatal** : un push raté ne casse jamais le tour ni n'affiche d'erreur bloquante ;
  les commits locaux sont la sécurité, le `Stop` suivant rattrape.
- **On ne change que *le quand* du push** (par-édition → fin-de-tour), pas la sync multi-machine.
- Indexation : **hors-scope** (déjà debouncée + incrémentale).

<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ SHIPPED in v3.0.0 (fix 8221a56 · tag v3.0.0 · 2026-06-15). Archived. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# 🔧 Fix — `update-engine` copie plus large que l'installeur (2 findings QA PR #10)

> **Origine.** QA manuelle de la PR #10 (branche `engine-packaging`), 2026-06-14/15. Le Test 2 a
> prouvé que le **noyau de sûreté tient** (fichiers sacrés byte-identiques, opt-in respecté, version
> déterministe, montée de version OK) **mais** que `update-engine` copie dans le cerveau **plus que
> ce qui lui appartient**. Détail complet : [`qa-pr10-engine-packaging-campaign.md`](qa-pr10-engine-packaging-campaign.md) §Findings.
>
> **Branche de travail : `engine-packaging`** (la PR #10, pas encore mergée). Fix **en TDD**, à
> faire **avant le merge `main` / tag `v3.0.0`** (post-démos).

---

## 📋 Tracking

- [x] **1. Reproduire les 2 findings en test (RED first)** — un test d'unité qui échoue d'abord _(2026-06-15)_
  - [x] 1a. Test F1 : un source portant `scripts/lib/eval-*.mjs` + `mcp-search.*` → après update, le cerveau ne les contient PAS _(gate `F1/F2`, RED vu d'abord)_
  - [x] 1b. Test F2 : cerveau installé `--lang fr` (`demo-locale.mjs` = `"fr"`) + source dont la racine est `"en"` → après update, `demo-locale.mjs` reste `"fr"` _(même gate)_
- [x] **2. Implémenter le fix (helper pur + câblage)** — GREEN _(2026-06-15)_
  - [x] 2a. Helper pur `selectEngineFilesToCopy(...)` (exclusions dev-only + locale-owned), unit-testé _(`scripts/lib/engine-copy-select.mjs` + `.test.mjs`, 3 tests)_
  - [x] 2b. Câbler dans `scripts/update-engine.mjs` (la boucle de copie L116-123) _(remplace `matchesAny` par le helper)_
- [x] **3. Durcir les garde-fous** — étendre `update-engine.test.mjs` (Gate) avec les 2 assertions anti-régression _(test `gate — F1/F2`, fail-first prouvé)_
- [x] **4. Suites vertes** — harness `node --test`, RAG `npm test`, `tsc --noEmit` _(harness 219/0, RAG 141/0, tsc clean)_
- [x] **5. Preuve empirique sur cerveau FRAIS** — install `--lang fr` → `update-engine` → `git status` propre (aucun `eval-*`/`mcp-search`), `demo-locale.mjs` inchangé (toujours `fr`), verify-rag FR _(2026-06-15 : `~/qa-fix`, 109 copiés / 0 dev-only / 0 demo-locale ; `BRAIN_LOCALE="fr"` ; verify-rag exit 0 canari FR)_
- [x] **6. Findings #1/#2 cochés dans la campagne** + mettre à jour le scorecard (Test 2 → ✅) _(2026-06-15)_
- [x] **7. Nettoyage** des cerveaux/launcher de test (Test 5 de la campagne) _(2026-06-15)_

> Cocher `- [x]` _(date · commit)_ à chaque étape terminée.

---

## 🎯 Cause racine (commune aux 2 findings)

La boucle de copie de **`scripts/update-engine.mjs`** (≈ L116-123) décide « ce qui atterrit dans le
cerveau » **uniquement** depuis les globs du manifest (`computeApplyPlan` → `overwrite` ←
`regimes.replace`, qui contient **`scripts/lib/**`**) :

```js
const copyGlobs = [...plan.overwrite, ...plan.replaceScripts];
for (const rel of listFilesRelPosix(sourceDir)) {
  if (matchesAny(copyGlobs, rel)) { copyInto(sourceDir, brainDir, rel); copied.push(rel); }
}
```

Or l'**installeur** applique DEUX raffinements par-dessus les fichiers trackés, que `update-engine`
**court-circuite** :
1. **`filterCopyable`** (`scripts/lib/tracked-files.mjs`) — exclut le **dev-only**
   (`scripts/lib/eval-`, `scripts/lib/mcp-search`, `maintainers/`, `templates/`, …).
2. **overlay de locale** (`scripts/lib/locale-overlay.mjs`) — remplace certains fichiers par leur
   version `templates/<locale>/` (dont `scripts/lib/demo-locale.mjs`, marqueur `BRAIN_LOCALE`).

→ **Finding #1** : `scripts/lib/**` ramène `eval-{judge,run,set}.{mjs,test.mjs}` + `mcp-search.*`
(8 fichiers dev-only que l'install exclut). **Finding #2** : la racine `scripts/lib/demo-locale.mjs`
(`"en"`) écrase la version FR posée à l'install → un cerveau FR repasse `"en"` côté démo/canari.

**Périmètre confirmé (grounded) :** le **seul** fichier locale-overlayé qui tombe sous un glob
`replace` est `scripts/lib/demo-locale.mjs`. Les skills FR (`.claude/skills/**`) sont en régime
`merge` → **non copiés** par `update-engine` (seuls `merge ∩ scripts/*.mjs` le sont) → déjà saufs.

---

## 🛠️ Design du fix (faire réutiliser à `update-engine` les raffinements de l'install)

Unifier la divergence : la liste « à copier » de `update-engine` doit passer par les **mêmes
exclusions** que l'install.

- **F1 — exclure le dev-only.** Filtrer les candidats à la copie via **`filterCopyable`** (réutilisé
  de `tracked-files.mjs`). `eval-*`/`mcp-search` ne sont plus jamais copiés.
- **F2 — préserver les fichiers locale-owned.** Calculer, depuis l'arbre **`templates/<*>/`** du
  source fetché, l'ensemble des **rel paths possédés par la locale** (= `templates/<locale>/<rel>` →
  `<rel>`), et **les exclure de la copie**. Le cerveau **garde** son `demo-locale.mjs` d'install
  (quelle que soit sa locale) — `update-engine` ne l'écrase plus. Locale-agnostique, future-proof.

> ⚠️ **NE PAS réutiliser `overlayLocale` dans `update-engine`** : `WHOLESALE_DIRS=["vault"]` **wipe
> le `vault/`** et il recopie `CLAUDE.md.template`/skills → en update ça **violerait le noyau de
> sûreté** (notes/constitution sacrées). Le fix F2 est une **EXCLUSION de la copie**, **jamais** un
> re-overlay. On n'a même pas besoin de lire la locale du cerveau : on ne touche simplement pas aux
> fichiers que la locale possède.

**Forme proposée — un helper PUR, testable isolément**, puis câblé dans la boucle :

```js
// scripts/lib/engine-copy-select.mjs (nouveau, pur)
// Donne les rel paths à RÉELLEMENT copier : ceux qui matchent les globs moteur,
// MOINS le dev-only (filterCopyable) MOINS les fichiers possédés par la locale.
export function selectEngineFilesToCopy({ sourceFiles, copyGlobs, localeOwnedRel }) { … }
// + un helper pour dériver localeOwnedRel depuis les chemins `templates/<locale>/…` du source.
```

Câblage : remplacer le `if (matchesAny(copyGlobs, rel))` par une itération sur le retour du helper.

---

## 🧪 TDD (baby-steps, discipline `tdd-discipline`)

1. **RED F1** : monter un faux source (fixtures) avec `scripts/lib/eval-set.mjs` + `mcp-search.mjs` ;
   après `updateEngine`, asserter leur **absence** dans le brain. Voir le test échouer d'abord.
2. **GREEN F1** : helper + filterCopyable. Re-vert.
3. **RED F2** : brain dont `scripts/lib/demo-locale.mjs` = `BRAIN_LOCALE="fr"`, source racine `"en"`
   + `templates/fr/scripts/lib/demo-locale.mjs` = `"fr"` ; après `updateEngine`, asserter que le
   brain garde **`"fr"`**. Échec d'abord.
4. **GREEN F2** : exclusion locale-owned. Re-vert.
5. **Refactor** obligatoire (DRY : `update-engine` et l'install partagent l'intention d'exclusion).
6. **Gate** : ajouter les 2 assertions dans `scripts/lib/update-engine.test.mjs` (anti-régression),
   fail-first par perturbation.

## ✅ Vérification empirique (cerveau FRAIS — valider le livré, pas le test)

```bash
# depuis le launcher (repo de travail OU un clone temp à jour)
rm -rf ~/qa-brain-pr10 ~/qa-brain-gemini
node installer.mjs --non-interactive --name qa-fix --dest "$HOME" --owner Thomas --lang fr --embedder in-process
cd ~/qa-fix && node scripts/update-engine.mjs
git status -s                 # AUCUN eval-*/mcp-search ; demo-locale.mjs NON modifié
grep BRAIN_LOCALE scripts/lib/demo-locale.mjs   # doit rester "fr"
node scripts/verify-rag.mjs   # exit 0, phrase canari FR
```

---

## 🧭 État pour reprise (après `/clear`)

- **Branche** : `engine-packaging` (PR #10). Arbre propre au départ ; HEAD `eb94157` à l'ouverture.
- **Cerveaux de test existants** (à supprimer / réinstaller frais pour la vérif) :
  `~/qa-brain-pr10` (in-process FR, pollué par les runs update-engine), `~/qa-brain-gemini`
  (Gemini sans clé). **Clone temp** : `/tmp/sbg-qa-launcher` (engine-packaging).
- **Tag temporaire `v2.9.0`** : déjà **supprimé** du remote (Test 3 nettoyé).
- **Fichiers candidats au changement** : `scripts/update-engine.mjs`, nouveau
  `scripts/lib/engine-copy-select.mjs` (+ `.test.mjs`), réutilise `tracked-files.filterCopyable` ;
  `scripts/lib/update-engine.test.mjs` (Gate, +2 guards). `demo-locale.mjs` reste sous `replace`
  mais protégé par l'exclusion locale (pas de changement de manifest nécessaire).
- **Findings #3** (mineur) : 1 vuln npm high severity dans les deps RAG — **hors périmètre** de ce
  fix (bump de dep séparé), non bloquant.

# 🧪 Campagne de QA manuelle — PR #10 (engine-packaging → v3.0.0)

> **But.** Valider **sur ton poste**, à la main, la version à venir portée par la **PR #10**
> (branche `engine-packaging`), **avant** le merge sur `main` et le tag `v3.0.0` (post-démos
> 15–16 juin). On teste : (1) que l'**install reste sain** (non-régression), (2) les **nouveautés
> observables** d'un cerveau fraîchement généré (version moteur affichée, autocompact, manifest,
> skill `update-engine`, pas de faux « clé Gemini manquante »), et (3) le **flux `update-engine`**
> lui-même (le swap opt-in non destructif).
>
> **Périmètre = le LIVRÉ, pas l'instance de test.** Les cerveaux créés ici sont **jetables** :
> on les `rm -rf` à la fin. Si un bug apparaît, on corrige **la source** (le launcher), pas le
> cerveau de test.
>
> 🧪 **Isolation totale du repo de travail.** La QA **n'utilise PAS** ton répertoire de travail
> `/Users/tpierrain/Dev/second-brain-generator` (ni son `.git`). On **clone la branche de la PR
> dans un launcher temporaire** et on lance tout depuis là. Ton repo actif reste intouché.

---

## 📋 Tracking

- [x] **0. Pré-requis : launcher temporaire cloné + baseline verte** _(2026-06-15 · harness 228/0/0, RAG 141/0/0, tsc clean)_
- [x] **1. Install in-process (défaut) + nouveautés observables** _(2026-06-15 · 1.1→1.7 verts : install exit 0, verify-rag, manifest+provenance, autocompact 350k, skill, status-line offline, réponse version = TAG sur Desktop)_
- [x] **2. `update-engine` — mécanique** _(2026-06-15 · sûreté OK + 2.4 UX skill verte ; 2 findings CORRIGÉS en TDD → voir §Findings)_
- [x] **3. `update-engine` — montée de version réelle via tag semver temporaire** _(2026-06-15 · Version engine-packaging→v2.9.0, tag nettoyé)_
- [x] **4. Embedder Gemini — l'avertissement de clé apparaît bien quand requis+absent** _(2026-06-15 · status-line avertit, verify-rag exit 1)_
- [ ] **5. Nettoyage** (suppression cerveaux de test + tag temporaire) — en attente

> Coche `- [x]` **et** note _(date · ce que tu as observé)_ à chaque étape : c'est la mémoire qui
> survit au `/clear`.

---

## Où on en est (rappel)

- Branche de la PR : **`engine-packaging`** (PR #10, draft — **ne pas merger** avant les démos).
- Remote : `git@github.com:tpierrain/second-brain-generator.git` — tags existants : **`V1`, `V2`**
  (⚠️ **non semver** → ignorés par `resolveLatestTag`, qui n'accepte que `vX.Y.Z`).
- Le launcher **reste read-only** : l'installeur **crée un dossier cerveau ailleurs**.
- **Cette QA tourne sur un clone temporaire** (`$LAUNCHER`), **pas** sur ton repo de travail.

---

## 0. Pré-requis : launcher temporaire cloné + baseline verte

**Objectif :** cloner la version de la PR dans un **launcher temporaire isolé** (jamais ton repo de
travail), et partir d'une suite de tests **verte** avant de tester à la main.

- [ ] Outils présents : `node -v`, `git --version`, `npm -v` (le cerveau en a besoin pour
  `update-engine`).
- [ ] Machine apte à l'**in-process** (≥ 12 Go RAM, **pas un Mac Intel**) :
  ```bash
  node -e "const o=require('os');console.log(Math.round(o.totalmem()/1024**3)+'GB', o.platform, o.arch)"
  ```
- [ ] **Cloner la branche de la PR dans un launcher temporaire** (`origin` = GitHub, donc identique
  au vrai remote — `resolveLatestTag` et `update-engine` interrogeront le bon dépôt) :
  ```bash
  export LAUNCHER="${TMPDIR:-/tmp}/sbg-qa-launcher"
  rm -rf "$LAUNCHER"
  git clone --depth 1 --branch engine-packaging \
    git@github.com:tpierrain/second-brain-generator.git "$LAUNCHER"
  cd "$LAUNCHER" && git rev-parse HEAD     # doit afficher eb94157… (le HEAD de la PR)
  ```
  > 💡 Garde ce terminal ouvert : `$LAUNCHER` est réutilisé à toutes les étapes. (Si tu changes de
  > terminal, refais juste le `export LAUNCHER=…`.)
- [ ] **Suites automatisées vertes** (le filet sous la QA manuelle), **depuis le launcher temp** :
  ```bash
  cd "$LAUNCHER"
  node --test scripts/*.test.mjs scripts/lib/*.test.mjs            # harness (instant, pur Node)
  ( cd rag && npm install && npm test && npx tsc --noEmit )         # RAG + types (npm install requis)
  ```
  → attendu : **exit 0** des deux côtés (harness ~215+, RAG ~141+). Si rouge ici, **stop** : on
  corrige **la source** avant la QA manuelle.

---

## Comment installer le cerveau depuis la version de la PR

L'installeur **copie les fichiers *trackés* de la branche courante** (`git ls-files`). Le launcher
temporaire étant un clone de `engine-packaging`, **le cerveau généré embarque exactement le code de
la PR**. On lance l'installeur normal **depuis `$LAUNCHER`**.

> 🚫 Le **cerveau** ne se crée **jamais** dans le launcher / le cwd / un dossier temp. Défaut = la
> home (`~/<nom>`). (Seul le *launcher* est en temp ici — c'est permis ; le cerveau, non.)

**LA commande (in-process, non-interactif) :**

```bash
cd "$LAUNCHER"
node installer.mjs --non-interactive \
  --name "qa-brain-pr10" \
  --dest "$HOME" \
  --owner "Thomas" \
  --lang "fr" \
  --embedder "in-process"
```

- Le script **crée** `~/qa-brain-pr10`, copie les fichiers, `git init` dedans, installe le RAG,
  fait le smoke-test MCP, et **juge lui-même** : **exit ≠ 0 = échec** → relayer l'erreur, ne pas
  prétendre que ça marche.
- Il **refuse si le dossier existe déjà** (rejoue propre). Pour recommencer : autre `--name`, ou
  supprimer le dossier.

---

## 1. Install in-process (défaut) + nouveautés observables

**Objectif :** un cerveau frais s'installe sans clé, **répond depuis le vault**, et expose toutes
les nouveautés de la PR.

- [ ] **1.1 — Install exit 0.** Lancer la commande ci-dessus → terminer sur **exit 0** + chemin
  affiché `~/qa-brain-pr10`. *(1re indexation in-process : téléchargement des poids ~28 s, puis
  offline.)*
- [ ] **1.2 — RAG opérationnel (canari).** Depuis le cerveau :
  ```bash
  cd ~/qa-brain-pr10 && node scripts/verify-rag.mjs
  ```
  → **exit 0** = répond FROM the vault (canari « Mollecuisse », introuvable hors vault). `exit 1`
  = relayer l'erreur.
- [ ] **1.3 — Manifest moteur présent & renseigné** (Phase 0/1) :
  ```bash
  cat ~/qa-brain-pr10/engine-manifest.json
  ```
  → vérifier : `source.repo` = `…tpierrain/second-brain-generator.git`, `source.ref` =
  **`engine-packaging`** (la branche), un bloc `provenance` (sha256 par fichier *merge*),
  `engineVersion` + `indexSchemaVersion`.
- [ ] **1.4 — Autocompact baké** (ADR 0018) :
  ```bash
  grep CLAUDE_CODE_AUTO_COMPACT_WINDOW ~/qa-brain-pr10/.claude/settings.json
  ```
  → attendu : `"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000"`.
- [ ] **1.5 — Skill `update-engine` livrée dans le cerveau** :
  ```bash
  ls ~/qa-brain-pr10/.claude/skills/update-engine/SKILL.md
  ```
  → présent (+ overlay FR si `--lang fr`).
- [ ] **1.6 — Status-line : version moteur affichée, PAS de faux « clé Gemini manquante »**
  (A1 + Item 2). Depuis le cerveau :
  ```bash
  cd ~/qa-brain-pr10 && echo '{}' | node scripts/status-line.mjs
  ```
  → attendu : un segment **`engine …`** (ici `engine engine-packaging`, le `source.ref` verbatim,
  **offline**) et **AUCUN** `⚠️ Gemini key missing` (in-process = sans clé).
- [ ] **1.7 — Réponse « version » déterministe (Desktop **et** CLI).** Ouvrir une **NOUVELLE
  conversation rootée dans le cerveau** (voir encadré ci-dessous), puis :
  - demander « **quelle version es-tu ?** » → la réponse cite **le tag/ref** (`engine-packaging`),
    **pas** `rag 1.1.0` ; **même réponse** sur Desktop et en CLI (Item 1, single source of truth).
  - vérifier que l'outil `vault_stats` titre une ligne **`Version: engine-packaging`** et **rétro-
    grade** `rag X.Y.Z` + schéma en ligne « internal build ».

> ### 🔑 Ouvrir le cerveau dans une conversation NEUVE (sinon rien n'est actif)
> - **🖱️ Claude Desktop (onglet Code)** : *New session* → cliquer la **puce dossier** (rangée
>   `💻 Local · 📁… · ➕`, au-dessus du champ) → menu « Recent » → choisir **`qa-brain-pr10`**
>   (ou « Open folder… » → `~/qa-brain-pr10`) **AVANT** le 1er message. ⚠️ **Pas** le `➕`.
> - **⌨️ CLI** : `cd ~/qa-brain-pr10 && claude`.
> - **Contrôle** : `pwd` en 1er message doit afficher `~/qa-brain-pr10`.

---

## 2. `update-engine` — mécanique (self-pull idempotent depuis la branche)

**Objectif :** prouver que le cœur déterministe tourne **vert end-to-end sur ton vrai poste**, et
que **rien de l'utilisateur n'est touché**. Comme le cerveau a été installé depuis la branche et
qu'aucun tag semver n'existe, `update-engine` **retombe sur `source.ref` (`engine-packaging`)** et
re-pull le **même** moteur → swap **idempotent**, **pas** de reindex (schéma inchangé).

- [ ] **2.0 — Témoin « fichiers à moi ».** Créer une note de test + noter l'état git du cerveau :
  ```bash
  cd ~/qa-brain-pr10
  echo "# Note QA $(date)" > vault/note-qa.md
  git add -A && git commit -q -m "qa: note témoin" && git rev-parse HEAD
  shasum CLAUDE.md .env vault/note-qa.md
  ```
- [ ] **2.1 — Lancer le cœur** (réseau + git + npm requis) :
  ```bash
  node scripts/update-engine.mjs
  ```
  → **exit 0** + rapport `formatReport` : `✅ Engine updated to engine-packaging (rag …)`,
  `• N engine file(s) swapped (+ launchers regenerated)`, `• index format unchanged — no reindex`.
- [ ] **2.2 — Pas de reindex injustifié.** Le rapport dit **« no reindex needed »** (schéma
  d'index identique). Le vault n'a pas été ré-encodé.
- [ ] **2.3 — Fichiers utilisateur INTACTS.** Re-hasher : `CLAUDE.md`, `.env`, `vault/note-qa.md`
  **inchangés** (mêmes sommes qu'en 2.0).
  ```bash
  shasum CLAUDE.md .env vault/note-qa.md      # identiques à 2.0
  git status -s                                # seuls des fichiers MOTEUR éventuellement modifiés
  ```
  → attendu : seuls `rag/**`, launchers, scripts moteur et `engine-manifest.json` peuvent bouger ;
  **jamais** `CLAUDE.md`, `.env`, `.claude/settings.json`, `vault/**`, `.claude/skills/**` perso.
- [ ] **2.4 — Le flux *conversationnel* (skill, opt-in).** Dans la conversation rootée dans le
  cerveau, demander « **mets à jour ton moteur** » → Claude **confirme d'abord** (jamais
  automatique), lance `node scripts/update-engine.mjs`, puis **rapporte** en clair (« moteur à
  jour, rien d'autre touché »). Vérifier qu'il **ne se lance pas sans ton OK**.
- [ ] **2.5 — `verify-rag` toujours vert** après le swap : `node scripts/verify-rag.mjs` → exit 0.

---

## 3. `update-engine` — montée de version réelle via tag semver temporaire *(optionnel)*

**Objectif :** tester pour de vrai **`resolveLatestTag` + « la Version avance vers le dernier tag
semver »** (ADR 0017, fix `eb94157`). Comme aucun `vX.Y.Z` n'existe encore, on **pousse un tag
semver jetable** sur le remote, on met à jour, on vérifie la montée, puis **on supprime le tag**.

> ⚠️ Choisir un tag **stable** `vX.Y.Z` (les pré-releases `-rcN` sont **ignorées**) et **< v3.0.0**
> pour ne pas usurper le futur tag de release. Ex : **`v2.9.0`**. Le supprimer juste après.

- [ ] **3.1 — Pousser un tag semver temporaire** au HEAD de la branche (depuis le launcher temp ;
  son `origin` = GitHub) :
  ```bash
  cd "$LAUNCHER"
  git tag v2.9.0 && git push origin v2.9.0
  ```
- [ ] **3.2 — Mettre à jour le cerveau** → il doit viser **v2.9.0** :
  ```bash
  cd ~/qa-brain-pr10 && node scripts/update-engine.mjs
  ```
  → rapport `✅ Engine updated to v2.9.0`. Vérifier le manifest et l'affichage :
  ```bash
  grep -A2 '"source"' ~/qa-brain-pr10/engine-manifest.json     # ref = v2.9.0
  echo '{}' | node scripts/status-line.mjs                      # segment "engine v2.9.0"
  ```
  → la **Version a avancé** de `engine-packaging` à **`v2.9.0`** (status-line + `vault_stats`).
- [ ] **3.3 — Nettoyer le tag temporaire** (ne pas le laisser traîner sur le remote) :
  ```bash
  cd "$LAUNCHER"
  git push origin :refs/tags/v2.9.0 && git tag -d v2.9.0
  ```

---

## 4. Embedder Gemini — l'avertissement de clé apparaît bien quand requis+absent *(optionnel)*

**Objectif :** valider l'**autre côté** du fix Item 2 — sur un embedder qui **exige** une clé, le
status-line **doit** avertir tant que la clé manque (et `verify-rag` échoue bruyamment).

- [ ] **4.1 — Générer un 2e cerveau de test en Gemini, sans clé** (depuis le launcher temp) :
  ```bash
  cd "$LAUNCHER"
  node installer.mjs --non-interactive --name "qa-brain-gemini" --dest "$HOME" \
    --owner "Thomas" --lang "fr" --embedder "gemini"
  ```
- [ ] **4.2 — Status-line AVERTIT** (clé requise + absente) :
  ```bash
  cd ~/qa-brain-gemini && echo '{}' | node scripts/status-line.mjs
  ```
  → attendu : un segment **`⚠️ Gemini key missing`** (contraire de l'in-process en 1.6).
- [ ] **4.3 — `verify-rag` échoue bruyamment** sans clé : `node scripts/verify-rag.mjs` → **exit 1**
  (et non un faux succès). *(Inutile d'aller plus loin / de coller une vraie clé pour cette QA.)*

---

## 5. Nettoyage

- [ ] **5.1 — Supprimer les cerveaux de test ET le launcher temporaire** :
  ```bash
  rm -rf ~/qa-brain-pr10 ~/qa-brain-gemini "$LAUNCHER"
  ```
- [ ] **5.2 — Vérifier qu'aucun tag temporaire ne subsiste** (si Test 3 fait) :
  ```bash
  git ls-remote --tags git@github.com:tpierrain/second-brain-generator.git | grep v2.9.0   # rien
  ```
- [ ] **5.3 — Repo de travail jamais touché** : dans
  `/Users/tpierrain/Dev/second-brain-generator`, `git status -s` et `git tag` sont **inchangés**
  (toute la QA a tourné dans `$LAUNCHER` + la home).

---

## 🐞 Findings (QA 2026-06-14)

> Le noyau de sûreté **tient** (fichiers sacrés byte-identiques, rapport « no reindex » correct).
> Mais le Test 2 a révélé que **le copieur de `update-engine` est plus large que l'installeur**.

> **✅ Findings #1 & #2 CORRIGÉS en TDD (2026-06-15, branche `engine-packaging`).** Helper pur
> `scripts/lib/engine-copy-select.mjs` (`selectEngineFilesToCopy` : F1 réutilise `filterCopyable`
> pour exclure le dev-only ; F2 exclut les rel paths possédés par une locale, dérivés de
> `templates/<*>/`), câblé dans `scripts/update-engine.mjs` à la place du `matchesAny` brut. Garde-fou
> anti-régression ajouté au Gate (`gate — F1/F2`). Suites vertes (harness 219, RAG 141, tsc).
> **Preuve empirique** sur cerveau frais `~/qa-fix` (`--lang fr`) : update moteur → 0 dev-only,
> `demo-locale.mjs` reste `fr`, verify-rag exit 0 canari FR.

- [x] **Finding #1 — `update-engine` fait fuiter des fichiers dev-only dans le cerveau.** _(CORRIGÉ)_
  - Constat (`git status` du cerveau après un `update-engine`) : apparition de
    `scripts/lib/eval-{judge,run,set}.{mjs,test.mjs}` + `scripts/lib/mcp-search.{mjs,test.mjs}` —
    soit **8 fichiers** que l'install **n'avait jamais copiés**.
  - Cause : `regimes.replace` contient `scripts/lib/**` (auto-portage Step 4) → `computeApplyPlan`
    → `overwrite` ramène **tout** `scripts/lib/**` de la source. L'installeur, lui, exclut ces
    chemins via `tracked-files.DEV_ONLY_PREFIXES` (`scripts/lib/eval-`, `scripts/lib/mcp-search`).
    Les deux chemins de copie ont **divergé** : `update-engine` n'a **pas** l'exclusion dev-only.
  - Impact : un cerveau accumule l'outillage de dev du launcher (+ fichiers `*.test.mjs`) à chaque
    update. Pas de perte de notes, mais viole le contrat « le cerveau ne porte que ce qu'il lui
    faut » et embarque des outils (eval-set) qui visent un vault local confidentiel.
  - Piste de fix (source, TDD) : faire passer la copie de `update-engine` par la **même** liste
    d'exclusion que `filterCopyable` (dev-only), ou restreindre le glob `scripts/lib/**` du manifest.

- [x] **Finding #2 — `update-engine` écrase l'overlay de langue (FR → EN).** _(CORRIGÉ)_
  - Constat : `scripts/lib/demo-locale.mjs` passe de `BRAIN_LOCALE="fr"` (posé par l'install
    `--lang fr` depuis `templates/fr/`) à `BRAIN_LOCALE="en"` (version racine) ; verify-rag affiche
    désormais la phrase canari **en anglais**.
  - Cause : `demo-locale.mjs` matche `scripts/lib/**` et est recopié depuis la racine de la source
    **sans ré-appliquer l'overlay de locale** que l'installeur avait posé.
  - Impact : un cerveau FR devient **incohérent** côté démo/canari après un simple update moteur
    (les notes du `vault/` restent FR, elles, car non matchées). Régression visible.
  - Piste de fix (source, TDD) : exclure les fichiers locale-overlayés du blind-replace **ou**
    ré-appliquer l'overlay de locale en fin d'`update-engine`.

> **Même cause racine** pour les deux : l'allowlist de copie de `update-engine` (`scripts/lib/**`)
> est plus large que ce qui appartient à un cerveau, et **ni dev-only-aware, ni locale-aware**,
> contrairement à l'installeur (`filterCopyable` + overlay de locale).

- [x] **Finding #3 (mineur, pré-existant) — `npm audit` : 1 vulnérabilité high severity** dans les
  deps du moteur RAG. _(CORRIGÉ 2026-06-15)_ : `esbuild` (transitif via `tsx`, utilisé au runtime par
  `reindex`/`index`) bumpé `0.28.0 → 0.28.1` (hors plage vulnérable `0.17.0–0.28.0`, advisories
  GHSA-gv7w-rqvm-qjhr + GHSA-g7r4-m6w7-qqqr). `tsx ~0.28.0` autorisait déjà 0.28.1 → **seul
  `rag/package-lock.json` change** (régime `replace` → voyage vers les cerveaux à l'update ; un
  `npm install` frais installe 0.28.1). `npm audit` = **0 vulnérabilité** ; RAG 141/141 ; tsc clean.

---

## Critères de sortie (go / no-go merge)

- [ ] Tests **0, 1, 2** verts → la version est **bonne à merger** (après les démos, tag `v3.0.0`).
- [ ] Tests **3, 4** verts (si joués) → `update-engine` + le gate de clé validés bout-en-bout.
- [ ] Tout bug trouvé → corrigé **dans la source** (TDD), suites re-vertes, **avant** merge.

> Rappel ADR 0012/0014 : **pas de merge `main` avant les démos client** ; le merge coupe le tag
> **`v3.0.0`** (1re release semver propre, `V1`/`V2` étant legacy).

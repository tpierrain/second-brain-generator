<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🔭 À FAIRE — plan RÉÉVALUÉ & RAFRAÎCHI le 2026-06-10.              -->
<!-- (créé 2026-06-04 ; inventaire d'origine périmé — voir §0bis.)              -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — Traduire le générateur en anglais (FR → EN)

> **STATUT : 🔭 À FAIRE** (créé le 2026-06-04 après le tag `V1` sur `200f035` ; **réévalué et
> rafraîchi le 2026-06-10** car beaucoup de code a été livré entre-temps — cf. §0bis).
> Plan autoporteur : une session Claude vierge doit pouvoir l'exécuter en ne lisant QUE ce
> fichier + les fichiers cités. Discipline **TDD** (skill `tdd-discipline`), commits **manuels**
> en conventionnel + co-author Claude.

---

## 0. Décisions prises (le « quoi » et le « pourquoi »)

Validé avec Thomas le 2026-06-04, **complété le 2026-06-10** :

1. **Le GÉNÉRATEUR passe en anglais — obligatoire.** Tout ce qui décrit/fait tourner le générateur
   est en anglais **unique** : README, SETUP, CONNECTORS, DEVELOPING, `EN-QUOI-C-EST-DIFFERENT`,
   `maintainers/`, commentaires & messages de code, ADRs, **la description GitHub (« About »)**,
   **et les nouveaux commits**. But : **publier publiquement** le repo pour un public international.
   Le FR de ces fichiers-là disparaît (récupérable via l'historique git + le tag `V1`).

2. **La GÉNÉRATION devient localisée (`--lang`) — le cœur du chantier.** À l'usage, un utilisateur
   FR **comme** EN doit obtenir son second cerveau **dans SA langue préférée**. Donc tout ce que le
   générateur **produit dans le cerveau** est **paramétrable par langue**, pas figé en anglais :
   - la **constitution** `CLAUDE.md.template` ;
   - les **skills** déposés (`.claude/skills/**/SKILL.md` + `EXAMPLES.md`) ;
   - le **vault de démo** (les fichiers `vault/**` livrés — cf. §0bis pour la correction de source).

   ➜ **Conséquence architecturale** : le FR existant **ne disparaît pas**, il devient la **locale
   `fr`** des artefacts générés ; on **ajoute** une locale `en`. Le `--lang` (qui pilote
   aujourd'hui la langue des notes) sélectionne désormais aussi la langue des artefacts générés.
   Langues au lancement : **`en` (défaut) + `fr`**, mécanisme extensible. Défaut `en` si `--lang`
   absent/inconnu.

3. **Périmètre de TRADUCTION : COMPLET.** Méta-générateur (→ EN unique) **et** artefacts générés
   (→ EN + FR via locales). Rien ne reste « accidentellement » FR.

4. **Principe central — les TESTS restent AGNOSTIQUES DE LA LANGUE.** C'est l'utilisateur du
   **générateur** qui choisira la langue de SON cerveau (flag `--lang`). Le générateur ne doit pas
   « coder en dur » une langue dans ses assertions : un test ne doit jamais casser parce qu'on a
   traduit une prose FR↔EN.
   - ✅ Asserter : **structure** (clés de frontmatter, noms de fichiers, codes de sortie, nombre
     d'éléments, présence d'un marqueur stable, JSON valide, idempotence).
   - ❌ Ne plus asserter : une **phrase** FR ou EN exacte, un message console mot-à-mot, un
     fragment de prose.
   - Quand un test DOIT vérifier qu'un texte est présent, le faire via un **identifiant stable**
     (constante/clé) ou un **invariant** (« contient le nom du owner », « contient le chemin du
     vault »), pas via la traduction elle-même.
   - Mémoire de référence : `feedback-no-string-fragile-asserts`.

5. **🆕 (2026-06-10) Localisation de l'INSTALLER lui-même : ARTEFACTS SEULEMENT.** Décidé avec
   Thomas :
   - **Pas de « sélecteur de langue » comme concept séparé.** `--lang` reste la **source unique de
     vérité** de la langue (notes + locale des artefacts générés). Ajouter un second endroit où la
     langue se décide créerait un risque de divergence.
   - **Chemin d'install dominant = piloté par Claude via l'amorce** (`CLAUDE.md`) : Claude récolte
     les réponses **en chat** puis lance `installer.mjs --non-interactive --lang "<langue>"`. Comme
     **Claude parle déjà la langue de l'utilisateur**, « l'installation se passe dans la langue de
     la personne » est **déjà vrai gratuitement** — aucun sélecteur à construire. L'amorce demande
     déjà la « langue par défaut des notes » : c'est ce signal qui devient `--lang`.
   - **Les `console.log` de l'installer restent EN unique** (pas de catalogue i18n). Raison : la
     surface réellement vue par l'utilisateur est le **chat de Claude**, pas la sortie console
     brute. La valeur de localiser les logs est faible face à son coût → **hors périmètre**.
   - Ce qui est localisé (haute valeur, vécu au quotidien) : **constitution + skills + vault de
     démo**. C'est ce que couvre le §0.2.

---

## 0bis. 🆕 Ce qui a CHANGÉ depuis le gel du 2026-06-04 (à intégrer impérativement)

Le repo a beaucoup bougé (chantier **RAG à la carte / D1** livré). L'inventaire d'origine est
périmé sur ces points :

| Plan d'origine (04-06) | Réalité au 10-06 |
|---|---|
| `bootstrap.mjs` | **`installer.mjs`** (renommé ; ~205 lignes FR) |
| `scripts/lib/bootstrap-args.mjs` | **`scripts/lib/installer-args.mjs`** |
| marqueur `second-brain-starter:bootstrap-stub` | **`installer-stub`** (lu par `isBootstrapStub`/équiv. dans `claude-md.mjs`) |
| vault démo « Star Wars » (luke-skywalker, la-force, death-star) | **univers « Flemmr »** : `vault/topics/flemmr.md`, `vault/people/jean-kevin-de-la-glandee.md`, `vault/decisions/2025-11-20-trophee-de-l-inertie.md` |
| démo générée par `example-notes.mjs` | **FAUX** : `example-notes.mjs` ne fait que **détecter/supprimer** les notes taguées `exemple`. **Source de vérité du contenu démo = les fichiers `vault/**` versionnés** + `demo.mjs` (question canari + assertion « Mollecuisse ») |
| ADRs maintainer = 1 (`launcher-vs-brain`) | **`maintainers/decisions/0001→0008`** (8 décisions) |
| — | **Nouveaux libs FR** : `installer-args`, `embedder-choice`, `demo`, `eval-set`, `eval-run`, `eval-judge`, `rag-launcher`, `repo-status`, `mcp-search` (+ `run-node`) |
| — | **Nouveaux modules RAG** : `in-process-embedder`, `openai-compatible-embedder`, `fake-embedder`, `index-freshness`, `chunker`, `document-scanner`, `frontmatter-parser` (+ tests) |
| — | **Nouveaux docs publics FR** : `EN-QUOI-C-EST-DIFFERENT.md` (≈258 l.), `DEVELOPING.md` |
| — | **Nouveau contenu maintainer FR** : `maintainers/eval-set.md`, `retrospectives/*` (2), `benchmarks/*` (1), `plans/` actifs (2) + `plans/archived/` (7) |

---

## 1. Inventaire à traduire (rafraîchi le 2026-06-10)

> Hors `node_modules`, `.git`, `dist`, `.cache`.
>
> **Deux régimes (cf. §0.1 vs §0.2)** :
> - 🇬🇧 **EN unique** (méta-générateur) : docs publics *hors* artefacts générés, code, ADRs,
>   interne mainteneur. Le FR disparaît (filet = tag `V1`).
> - 🌍 **Localisé `en`+`fr`** (artefacts produits dans le cerveau) : `CLAUDE.md.template`, les
>   **skills** (§B), le **vault de démo** (§E-démo). Le FR devient la **locale `fr`**.

### A. Docs publics (face utilisateur) — 🇬🇧 EN unique (sauf `.template`)
- [ ] `README.md` (≈37 ko, le plus gros)
- [ ] `SETUP.md` (≈22 ko)
- [ ] `EN-QUOI-C-EST-DIFFERENT.md` (≈258 l.) 🆕
- [ ] `DEVELOPING.md` 🆕
- [ ] `CONNECTORS.md`
- [ ] `CLAUDE.md` (l'**amorce**/installer-stub — **garder le marqueur `installer-stub`**, cf.
      `scripts/lib/claude-md.mjs`)
- [ ] `CLAUDE.md.template` (constitution **générée** → 🌍 localisée `en`+`fr`, placeholders `{{…}}` intacts)
- [ ] `.env.example` (commentaires)
- [ ] `docs/img/README.md`
- [ ] **Description GitHub « About »** (`gh repo edit --description …`) → version EN 🆕

### B. Skills générés (déposés dans chaque cerveau) — 🌍 localisés `en`+`fr` — `.claude/skills/`
- [ ] `coach/SKILL.md`
- [ ] `improve/SKILL.md`
- [ ] `prepare-1-1/SKILL.md`  *(garder le nom de dossier `prepare-1-1` — pas un renommage)*
- [ ] `sync/SKILL.md`
- [ ] `sync-sources/SKILL.md`
- [ ] `tdd-discipline/SKILL.md`
- [ ] `EXAMPLES.md`
- ⚠️ Le champ `description:` du frontmatter des skills est lu/affiché : le traduire AUSSI, mais
  vérifier qu'aucun test ne fige sa valeur exacte (sinon → assert structurel).

### C. Code — 🇬🇧 EN unique (commentaires FR + messages console)
- [ ] `installer.mjs` (orchestration : **~205 lignes FR**, le gros morceau code) 🆕 *(ex `bootstrap.mjs`)*
- [ ] `scripts/auto-commit.mjs`
- [ ] `scripts/run-node.mjs` 🆕
- [ ] `scripts/lib/installer-args.mjs` 🆕 *(ex `bootstrap-args.mjs`)*
- [ ] `scripts/lib/claude-md.mjs`
- [ ] `scripts/lib/connectors-apply.mjs`
- [ ] `scripts/lib/connectors-catalog.mjs`
- [ ] `scripts/lib/connectors-merge.mjs`
- [ ] `scripts/lib/demo.mjs` 🆕 *(canari : voir §2 — proper nouns à NE PAS traduire)*
- [ ] `scripts/lib/embedder-choice.mjs` 🆕 *(pédagogie 3 embedders — surface utilisateur sensible)*
- [ ] `scripts/lib/eval-set.mjs`, `eval-run.mjs`, `eval-judge.mjs` 🆕
- [ ] `scripts/lib/example-notes.mjs` *(détecteur de notes `exemple` — cf. §2 sur le tag)*
- [ ] `scripts/lib/gemini-key.mjs`
- [ ] `scripts/lib/mcp-search.mjs` 🆕
- [ ] `scripts/lib/mcp-smoke.mjs`
- [ ] `scripts/lib/rag-launcher.mjs` 🆕 *(~44 lignes FR)*
- [ ] `scripts/lib/repo-status.mjs` 🆕 *(statusLine ; ex « session-status »)*
- [ ] `scripts/lib/tracked-files.mjs`
- [ ] `scripts/lib/__fixtures__/stub-mcp-server.mjs`
- [ ] `rag/src/index.ts`
- [ ] `rag/src/lib/*.ts` : `chunker`, `config`, `document-scanner`, `embedder`, `fake-embedder`,
      `frontmatter-parser`, `in-process-embedder`, `index-freshness`, `index-manager`, `indexer`,
      `openai-compatible-embedder`, `progress-report`, `reindex-lock`, `reindex-reporter`,
      `reindex-scheduler`, `search-degradation`, `status-report`, `usage-tracker`, `vault-watcher`,
      `vector-store`
- [ ] `rag/src/tools/*.ts` : `get-document`, `list-documents`, `reindex`, `search-vault`, `vault-stats`
- [ ] `rag/docs/adr/*.md` : `_template`, `0001`, `0002`, `0003`, `README` — **renommer aussi les
      slugs FR** (`0001-atomicite-document-hash-chunks` → `0001-atomicity-…`, `0002-demarrage-mcp-non-bloquant`
      → `0002-non-blocking-mcp-startup`, `0003-pas-de-daemon-session-declencheur` → `0003-…`) + liens croisés.

### D. Tests à RENDRE AGNOSTIQUES (pas juste « traduire ») — cf. §0.4
> Liste rafraîchie (inclut les tests des nouveaux modules). Par fichier : casser l'assert FR figé
> → réécrire structurel → vert.

Harnais (`scripts/`) :
- [ ] `scripts/auto-commit.test.mjs`
- [ ] `scripts/run-node.test.mjs` 🆕
- [ ] `scripts/lib/installer-args.test.mjs` 🆕
- [ ] `scripts/lib/claude-md.test.mjs`
- [ ] `scripts/lib/connectors-apply.test.mjs`, `connectors-catalog.test.mjs`, `connectors-merge.test.mjs`
- [ ] `scripts/lib/demo.test.mjs` 🆕 *(verrouille l'invariant canari grep-proof — garder l'invariant, agnostique de prose)*
- [ ] `scripts/lib/embedder-choice.test.mjs` 🆕
- [ ] `scripts/lib/eval-set.test.mjs`, `eval-run.test.mjs`, `eval-judge.test.mjs` 🆕
- [ ] `scripts/lib/example-notes.test.mjs`
- [ ] `scripts/lib/gemini-key.test.mjs`
- [ ] `scripts/lib/mcp-search.test.mjs` 🆕
- [ ] `scripts/lib/mcp-smoke.test.mjs`
- [ ] `scripts/lib/rag-launcher.test.mjs` 🆕
- [ ] `scripts/lib/repo-status.test.mjs` 🆕
- [ ] `scripts/lib/tracked-files.test.mjs`

RAG (`rag/src/`) :
- [ ] `config`, `embedder`, `fake-embedder` 🆕, `in-process-embedder` 🆕, `index-freshness` 🆕,
      `index-manager`, `indexer`, `openai-compatible-embedder` 🆕, `progress-report`, `reindex-lock`,
      `reindex-reporter`, `reindex-scheduler`, `search-degradation`, `status-report`, `usage-tracker`,
      `vector-store` (`.test.ts`)
- ⚠️ **Clés structurelles qui ressemblent à du FR mais n'en sont pas** : le tag `exemple` (lu par
  `isExampleNote`), `type: backlog`, le dossier `vault/backlog/`, `harnais.md`. Ce sont des
  **identifiants consommés par le code** — décider au cas par cas (cf. §2.2).

### E. Interne mainteneur + démo
- [ ] `maintainers/README.md`
- [ ] `maintainers/decisions/0001→0008` (8 fichiers) 🆕
- [ ] `maintainers/eval-set.md` 🆕
- [ ] `maintainers/retrospectives/*` (2) 🆕
- [ ] `maintainers/benchmarks/*` (1) 🆕
- [ ] `maintainers/plans/etude-rag-local-criteres-et-veille.md`, `rag-embedder-plan-action.md` 🆕
- [ ] `maintainers/plans/archived/*` (7 fichiers) 🆕
- [ ] **ce plan lui-même** (`maintainers/plans/translate-to-english.md`) → à traduire en dernier
- **Vault de démo (univers « Flemmr », 🌍 localisé `en`+`fr`)** — source de vérité = fichiers `vault/**`
  versionnés (tag `exemple`) + `demo.mjs` (canari) :
  - [ ] `vault/README.md`
  - [ ] `vault/backlog/harnais.md`
  - [ ] `vault/backlog/perso.md`
  - [ ] `vault/daily/2026-01-15.md`
  - [ ] `vault/decisions/2025-11-20-trophee-de-l-inertie.md`
  - [ ] `vault/people/jean-kevin-de-la-glandee.md`
  - [ ] `vault/topics/flemmr.md`
  - [ ] `vault/coaching/.gitkeep` *(dossier vide — rien à traduire, juste préserver la structure)*
  - ⚠️ **Renommer les slugs FR par locale** : `jean-kevin-de-la-glandee` → équivalent EN,
    `trophee-de-l-inertie` → `inertia-trophy`, `harnais` → `harness`, `perso` → `personal`.
    `flemmr` est un **nom propre inventé** → **inchangé** dans les deux locales (cf. §2.3).

---

## 2. Points d'attention (corner-cases à ne pas rater)

1. **Placeholders & marqueurs à NE PAS traduire** : `{{…}}` dans les `*.template` ; le marqueur
   **`installer-stub`** (sinon le détecteur dans `claude-md.mjs` casse et l'installeur ne remplace
   plus l'amorce) ; les noms de dossiers de skills (`prepare-1-1`, `sync-sources`…).
2. **Frontmatter structurel vs prose** : `type:`, `tags:`, `name:` (slugs) sont des **contrats**
   lus par le code → ne traduire que si on traduit le lecteur en face, **ensemble**. Cas concret :
   le tag **`exemple`** lu par `isExampleNote()` (`example-notes.mjs`). **TRANCHÉ (2026-06-10,
   Thomas) : option A — on GARDE `exemple` tel quel**, identifiant stable interne, **non traduit**
   (jamais affiché ; éviter de coupler une trad de prose à un contrat de code).
3. **🆕 Canari de démo (`demo.mjs` + vault Flemmr) — invariant à préserver à travers les langues.**
   Le canari à 3 étages repose sur des **noms propres inventés, language-neutral** : « Flemmr »,
   « Pélagie de Mollecuisse », « Trophée de l'Inertie », « TRF 98,7 % ». **L'assertion porte sur le
   token `Mollecuisse`.** ➜ En localisant le vault, **traduire seulement la prose autour** ; garder
   les noms propres **identiques dans les deux locales** pour que `Mollecuisse` survive et que
   l'invariant grep-proof (la question ne partage aucun mot de contenu avec les notes) tienne **par
   locale**. `demo.test.mjs` verrouille cet invariant : le garder, agnostique de prose.
4. **Messages console = surface utilisateur, mais EN unique (cf. §0.5)** : `installer.mjs` parle à
   l'utilisateur pendant l'install. Les passer en EN, ne JAMAIS asserter le texte exact (§0.4).
   **Pas** de catalogue i18n console (hors périmètre).
5. **Conventional commits** : l'historique reste FR (V1 fige le FR) ; les **nouveaux** commits de ce
   chantier en anglais.
6. **`--lang` pilote la langue des ARTEFACTS GÉNÉRÉS** (TRANCHÉ, §0.2) : `CLAUDE.md.template`,
   skills, vault de démo deviennent `en` (défaut) + `fr`. Le FR actuel **devient la locale `fr`**.
   Forme du mécanisme à concevoir au **Lot 0**. Défaut `en` si `--lang` absent/inconnu.
7. **Tag `V1` = filet** : `git checkout V1` retrouve le FR.

---

## 2bis. Prérequis — branche dédiée (NON négociable)

Tout le chantier sur une **branche dédiée**, jamais en direct sur `main` (périmètre large, risque
de casse pendant la transition FR→EN). **Après validation de CE plan rafraîchi par Thomas** :

```bash
git switch -c chore/translate-to-english   # depuis main, propre et synchro
```

- Un **commit par lot** (§3), suite verte à chaque commit.
- **PR** en fin de chantier (`gh pr create`) pour relire le diff en bloc avant merge sur `main`.

## 3. Découpage proposé (lots committables, suite verte à chaque lot)

> Ordre = du moins risqué (prose pure) au plus risqué (mécanisme de locales + tests agnostiques).
> Un lot = un commit. **Suite verte obligatoire avant chaque commit.**

- [ ] **Prérequis** — branche `chore/translate-to-english` créée depuis `main` (§2bis).
- [ ] **Lot 0 — Mécanisme de locales (TDD, le cœur technique)** : sélection de langue des artefacts.
  - [ ] (a) choisir la forme (`templates/<lang>/` recommandé pour la prose longue : constitution +
        skills + démo) ;
  - [ ] (b) câbler `--lang` → locale (défaut `en`, fallback `en`) dans `installer.mjs` via un helper
        pur **testé** (ex. `resolveLocale`) ;
  - [ ] (c) tests **structurels** (la locale choisie pointe le bon dossier, fallback OK). Tant que
        `en` n'est pas peuplée, `fr` reste seule : ne pas casser l'existant.
- [ ] **Lot 1 — Docs publics statiques méta (A, EN unique)** : README, SETUP, `EN-QUOI-C-EST-DIFFERENT`,
      DEVELOPING, CONNECTORS, `.env.example`, `docs/img/README.md`, **+ description GitHub**. Prose
      pure, zéro impact test. *Commit : `docs: translate generator docs to English`.*
- [ ] **Lot 2 — Amorce + constitution (A)** : `CLAUDE.md` (amorce → **EN unique**, garder marqueur
      `installer-stub`) ; `CLAUDE.md.template` → **locale `en`** + actuel FR en **locale `fr`** ;
      `{{…}}` préservés ; `claude-md.test.mjs` rendu agnostique.
- [ ] **Lot 3 — Skills (B, localisés)** : locale `en` des 6 SKILL.md + EXAMPLES.md (+ descriptions
      frontmatter) ; actuel FR → locale `fr` ; aucun test ne fige la prose.
- [ ] **Lot 4 — ADRs RAG (C, EN unique)** : `rag/docs/adr/*` + renommage slugs + liens croisés.
- [ ] **Lot 5 — Code scripts + tests agnostiques (C+D, EN unique)** : `installer.mjs`, `scripts/**`
      (dont les nouveaux libs `installer-args`, `embedder-choice`, `demo`, `eval-*`, `rag-launcher`,
      `repo-status`, `mcp-search`, `run-node`). Par fichier : traduire commentaires/strings EN, puis
      **rendre le test agnostique** (red→green). Sous-lots par dossier si trop gros.
- [ ] **Lot 6 — Moteur RAG + tests agnostiques (C+D, EN unique)** : `rag/src/**` (dont
      `in-process-embedder`, `openai-compatible-embedder`, `fake-embedder`, `index-freshness`,
      `chunker`, `document-scanner`, `frontmatter-parser`), par groupe de modules. `cd rag && npm test` verte.
- [ ] **Lot 7 — Vault de démo (E, localisé)** : locale `en` des fichiers `vault/**` (Flemmr) + actuel
      FR → locale `fr` ; **garder les noms propres** (Flemmr, Mollecuisse, Trophée de l'Inertie)
      identiques (§2.3) ; renommer les slugs de prose (`jean-kevin-de-la-glandee`, `harnais`, `perso`,
      `trophee-de-l-inertie`) **par locale** ; **garder le tag `exemple` tel quel** (§2.2, option A) ;
      `demo.test.mjs` / `example-notes.test.mjs` agnostiques (structure, pas prose).
- [ ] **Lot 8 — Interne mainteneur (E, EN unique)** : `maintainers/**` (decisions 0001-0008,
      eval-set, retrospectives, benchmarks, plans actifs + archived), `DEVELOPING.md`, **et ce plan**.
      En dernier (méta).
- [ ] **Lot 9 — Final** : suite complète verte (`node --test scripts/**/*.test.mjs scripts/*.test.mjs`
      + `cd rag && npm test` + `node --check installer.mjs` + JSON templates valides) ; **E2E par
      langue** (`--lang en` ET `--lang fr`) ; `grep` final des accents FR résiduels **hors locale
      `fr`** ; commit de clôture ; `STATUT` → ✅ LIVRÉ ; PR ; envisager un tag `V2` (premier repo EN
      publiable).

---

## 4. Definition of Done

- [ ] **Méta-générateur 100 % EN** : plus aucune prose FR hors la locale `fr` (`grep -rE
      "é|è|à|ê|ç"` ne renvoie que la locale `fr/` + faux positifs documentés). Description GitHub EN.
- [ ] **Génération localisée OK** : `--lang en` ET `--lang fr` produisent chacun un cerveau
      **cohérent et complet** (constitution + skills + démo dans la bonne langue). Défaut `en`,
      fallback `en`.
- [ ] **Canari préservé par locale** : `Mollecuisse` remonte et l'invariant grep-proof tient en
      `en` comme en `fr` (`demo.test.mjs` vert dans les deux).
- [ ] Suite **complète verte** : harnais + RAG (`cd rag && npm test`) + `node --check installer.mjs`
      + templates JSON valides.
- [ ] **Aucun test ne fige une prose FR ou EN** : tous les asserts structurels (§0.4).
- [ ] **E2E par langue** (copie jetable) : un run `--lang en` et un `--lang fr`, amorce remplacée,
      constitution dans la bonne langue, smoke-test MCP OK.
- [ ] Marqueur `installer-stub` et placeholders `{{…}}` intacts.
- [ ] `STATUT` → ✅ LIVRÉ ; entrée `maintainers/README.md` à jour ; PR mergée.

---

## 5. Pour reprendre vite (note à la prochaine session)

> **Ce plan a été rafraîchi le 2026-06-10** (inventaire à jour, renommages installer/installer-args/
> installer-stub, ADRs 0001-0008, vault démo « Flemmr », nouveaux libs/modules RAG, décision
> « artefacts seulement / pas de sélecteur »). Il est prêt à exécuter.
>
> **D'ABORD créer la branche** `chore/translate-to-english` (§2bis), JAMAIS sur `main`.
> Puis : **Lot 1** (docs, prose pure = échauffement sans risque) peut démarrer tout de suite, mais
> le **cœur technique = Lot 0** (mécanisme de locales `--lang` → `en`/`fr`) doit être fait AVANT les
> lots localisés (2, 3, 7). Charger la skill `tdd-discipline`.
> Filet FR = **tag `V1`** (`git checkout V1`).
> Les principes non négociables :
> 1. **générateur en EN** (publiable) mais **génération localisée** (`--lang` → cerveau dans la
>    langue de l'utilisateur, `en`+`fr` au lancement) ;
> 2. **tests agnostiques de la langue** ;
> 3. **`--lang` = source unique** de la langue, **pas de sélecteur** séparé, **logs installer en EN**
>    (la localisation porte sur les artefacts, pas la console — §0.5).

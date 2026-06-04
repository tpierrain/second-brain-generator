<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🔭 À FAIRE (créé 2026-06-04) — pas encore démarré.                 -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — Traduire le générateur en anglais (FR → EN)

> **STATUT : 🔭 À FAIRE** (créé le 2026-06-04, après le tag `V1` posé sur `200f035`).
> Plan autoporteur : une session Claude vierge doit pouvoir l'exécuter en ne lisant QUE ce
> fichier + les fichiers cités. Discipline **TDD** (skill `tdd-discipline`), commits **manuels**
> en conventionnel + co-author Claude.

---

## 0. Décisions prises (le « quoi » et le « pourquoi »)

Validé avec Thomas le 2026-06-04 :

1. **Le GÉNÉRATEUR passe en anglais — obligatoire.** Tout ce qui décrit/fait tourner le générateur
   est en anglais **unique** : README, SETUP, CONNECTORS, DEVELOPING, `maintainers/`, commentaires
   & messages de code, ADRs, **et les nouveaux commits**. But : **publier publiquement** le repo
   pour un public international. Le FR de ces fichiers-là disparaît (récupérable via l'historique
   git + le tag `V1`).

2. **La GÉNÉRATION devient localisée (`--lang`) — le cœur du chantier.** À l'usage, un utilisateur
   FR **comme** EN doit obtenir son second cerveau **dans SA langue préférée**. Donc tout ce que le
   générateur **produit dans le cerveau** est **paramétrable par langue**, pas figé en anglais :
   - la **constitution** `CLAUDE.md.template` ;
   - les **skills** déposés (`.claude/skills/**/SKILL.md` + `EXAMPLES.md`) ;
   - le **vault de démo** (notes générées par `scripts/lib/example-notes.mjs`) ;
   - idéalement les **messages console** de l'install (`bootstrap.mjs`) — nice-to-have.

   ➜ **Conséquence architecturale** : le FR existant **ne disparaît pas**, il devient la **locale
   `fr`** des artefacts générés ; on **ajoute** une locale `en`. Le `--lang` (qui pilote
   aujourd'hui la langue des notes) sélectionne désormais aussi la langue des artefacts générés.
   Langues au lancement : **`en` (défaut) + `fr`**, mécanisme extensible.
   - Reste à concevoir pendant l'exécution (TDD) : **forme du mécanisme de locales**. Pistes :
     dossiers `templates/<lang>/` (un jeu de templates par langue) **ou** catalogues i18n pour les
     strings + templates par langue pour la prose longue. Choisir le plus simple qui tienne le
     multi-OS et reste testable structurellement. Défaut `en` si `--lang` absent/inconnu.
   - Contrat : `--lang en` et `--lang fr` doivent tous deux produire un cerveau **cohérent et
     complet** (constitution + skills + démo dans la bonne langue). Un E2E par langue (cf. §4).

3. **Périmètre de TRADUCTION : COMPLET.** Méta-générateur (→ EN unique) **et** artefacts générés
   (→ EN + FR via locales). Rien ne reste « accidentellement » FR.

4. **Principe central — les TESTS restent AGNOSTIQUES DE LA LANGUE.** C'est l'utilisateur du
   **générateur** qui choisira la langue de SON cerveau (cf. flag `--lang`, et la constitution
   qu'il adaptera). Donc le générateur ne doit pas « coder en dur » une langue dans ses
   assertions : un test ne doit jamais casser parce qu'on a traduit une prose FR↔EN.
   - ✅ Asserter : **structure** (clés de frontmatter, noms de fichiers, codes de sortie, nombre
     d'éléments, présence d'un marqueur stable, JSON valide, idempotence).
   - ❌ Ne plus asserter : une **phrase** FR ou EN exacte, un message console mot-à-mot, un
     fragment de prose.
   - Quand un test DOIT vérifier qu'un texte est présent, le faire via un **identifiant stable**
     injecté dans le code (constante/clé), pas via la traduction elle-même — ou tester
     l'invariant (« contient le nom du owner », « contient le chemin du vault ») sans figer la
     langue de la phrase porteuse.
   - Mémoire de référence liée : `feedback-no-string-fragile-asserts` (asserts non fragiles) — ce
     plan en est l'application directe.

---

## 1. Inventaire à traduire (gelé au 2026-06-04)

> Hors `node_modules`, `.git`. Listes obtenues par `find … -name "*.md"` et `grep -rl` accents/FR.
>
> **Deux régimes (cf. §0.1 vs §0.2)** :
> - 🇬🇧 **EN unique** (méta-générateur) : §A-docs-publics *hors* artefacts générés, §C-code,
>   §E-interne-mainteneur. Le FR disparaît (filet = tag `V1`).
> - 🌍 **Localisé `en`+`fr`** (artefacts produits dans le cerveau) : `CLAUDE.md.template`, les
>   **skills** (§B), le **vault de démo** (§E-démo). Le FR devient la **locale `fr`**.

### A. Docs publics (face utilisateur) — prose FR
- [ ] `README.md` (≈28 ko, le plus gros)
- [ ] `SETUP.md`
- [ ] `CONNECTORS.md`
- [ ] `CLAUDE.md` (l'**amorce**/bootstrap-stub — garder le marqueur `second-brain-starter:bootstrap-stub`,
      cf. `scripts/lib/claude-md.mjs` `isBootstrapStub`)
- [ ] `CLAUDE.md.template` (constitution **générée** → localisée `en`+`fr`, placeholders `{{…}}` intacts)
- [ ] `.env.example` (commentaires)

### B. Skills générés (déposés dans chaque cerveau) — `.claude/skills/`
- [ ] `coach/SKILL.md`
- [ ] `improve/SKILL.md`
- [ ] `prepare-1-1/SKILL.md`  *(garder le nom de dossier `prepare-1-1` tel quel — pas un renommage)*
- [ ] `sync/SKILL.md`
- [ ] `sync-sources/SKILL.md`
- [ ] `tdd-discipline/SKILL.md`
- [ ] `EXAMPLES.md`
- ⚠️ Le champ `description:` du frontmatter des skills est lu/affiché : le traduire AUSSI, mais
  vérifier qu'aucun test ne fige sa valeur exacte (sinon → assert structurel).

### C. Code — commentaires FR + messages console (strings utilisateur)
- [ ] `bootstrap.mjs` (orchestration : beaucoup de `console.log` FR)
- [ ] `scripts/auto-commit.mjs`
- [ ] `scripts/session-status.mjs`
- [ ] `scripts/lib/bootstrap-args.mjs`
- [ ] `scripts/lib/claude-md.mjs`
- [ ] `scripts/lib/connectors-apply.mjs`
- [ ] `scripts/lib/connectors-catalog.mjs`
- [ ] `scripts/lib/connectors-merge.mjs`
- [ ] `scripts/lib/example-notes.mjs`
- [ ] `scripts/lib/gemini-key.mjs`
- [ ] `scripts/lib/mcp-smoke.mjs`
- [ ] `scripts/lib/tracked-files.mjs`
- [ ] `scripts/lib/__fixtures__/stub-mcp-server.mjs`
- [ ] `rag/src/index.ts`
- [ ] `rag/src/lib/*.ts` (config, embedder, indexer, index-manager, progress-report, reindex-*,
      search-degradation, status-report, usage-tracker, vault-watcher, vector-store)
- [ ] `rag/src/tools/*.ts` (get-document, list-documents, reindex, search-vault, vault-stats)
- [ ] `rag/docs/adr/*.md` (ADRs RAG : `_template`, `0001`, `0002`, `0003`, `README`) — **renommer
      aussi les slugs FR** (`0001-atomicite-document-hash-chunks` → `0001-atomicity-…`, etc.) + liens croisés.

### D. Tests à RENDRE AGNOSTIQUES (pas juste « traduire ») — cf. §0.4
Triés par densité de strings FR assertées (du plus chargé au moins) :
- [ ] `scripts/auto-commit.test.mjs` (22)
- [ ] `rag/src/lib/reindex-scheduler.test.ts` (18)
- [ ] `rag/src/lib/usage-tracker.test.ts` (15)
- [ ] `rag/src/lib/status-report.test.ts` (15)
- [ ] `rag/src/lib/reindex-lock.test.ts` (15)
- [ ] `rag/src/lib/indexer.test.ts` (12)
- [ ] `rag/src/lib/index-manager.test.ts` (12)
- [ ] `scripts/lib/bootstrap-args.test.mjs` (10)
- [ ] `rag/src/lib/progress-report.test.ts` (10)
- [ ] `scripts/lib/connectors-merge.test.mjs` (9)
- [ ] `rag/src/lib/reindex-reporter.test.ts` (8)
- [ ] `rag/src/lib/config.test.ts` (8)
- [ ] `scripts/lib/example-notes.test.mjs` (7)
- [ ] `scripts/lib/mcp-smoke.test.mjs` (6)
- [ ] `scripts/lib/connectors-catalog.test.mjs` (6)
- [ ] `scripts/lib/connectors-apply.test.mjs` (4)
- [ ] `scripts/lib/tracked-files.test.mjs` (3)
- [ ] `scripts/lib/gemini-key.test.mjs` (3)
- [ ] `scripts/lib/claude-md.test.mjs` (3)
- [ ] `rag/src/lib/search-degradation.test.ts` (2)
- [ ] `rag/src/lib/embedder.test.ts` (2)
- ⚠️ Attention aux **clés structurelles** qui ressemblent à du FR mais n'en sont pas : ex.
  `type: backlog` dans le frontmatter, le dossier `vault/backlog/`, `harnais.md`. Ce sont des
  **identifiants consommés par le code** — décider au cas par cas s'ils restent (identifiant
  stable) ou deviennent EN **en même temps que le code qui les lit** (sinon on casse le contrat).

### E. Interne mainteneur + démo
- [ ] `maintainers/README.md`
- [ ] `maintainers/decisions/0001-launcher-vs-brain.md`
- [ ] `maintainers/plans/launcher-vs-brain.md`
- [ ] `maintainers/plans/claude-driven-install.md`
- [ ] **ce plan lui-même** (`maintainers/plans/translate-to-english.md`) → à traduire en dernier
- [ ] `DEVELOPING.md`
- Vault de démo (univers Star Wars, exclu de la copie bootstrap mais versionné) :
  - [ ] `vault/README.md`
  - [ ] `vault/backlog/harnais.md`
  - [ ] `vault/backlog/perso.md`
  - [ ] `vault/daily/2026-01-15.md`
  - [ ] `vault/decisions/2026-01-10-attaque-etoile-de-la-mort.md`
  - [ ] `vault/people/luke-skywalker.md`
  - [ ] `vault/topics/la-force.md`
  - ⚠️ Le vault de démo est aussi **généré** par `scripts/lib/example-notes.mjs` : traduire le
    contenu **dans le générateur** (la source de vérité), pas seulement les fichiers déposés.
    Renommer les slugs FR (`la-force` → `the-force`, `attaque-etoile-de-la-mort` →
    `death-star-attack`) côté générateur ET fichiers.

---

## 2. Points d'attention (corner-cases à ne pas rater)

1. **Placeholders & marqueurs à NE PAS traduire** : `{{…}}` dans les `*.template`, le marqueur
   `<!-- second-brain-starter:bootstrap-stub -->` (sinon `isBootstrapStub` casse et le bootstrap
   ne remplace plus l'amorce), les noms de dossiers de skills (`prepare-1-1`, `sync-sources`…).
2. **Frontmatter structurel vs prose** : `type:`, `tags:`, `name:` (slugs) sont des **contrats**
   lus par le code → ne traduire que si on traduit le lecteur en face, et le faire ensemble.
3. **Messages console = surface utilisateur** : `bootstrap.mjs` parle à l'utilisateur pendant
   l'install. Les passer en EN, mais ne JAMAIS asserter le texte exact dans un test (cf. §0.4).
4. **Conventional commits** : les messages de commit du repo sont en FR. Choix à acter : on
   **n'édite pas l'historique** (V1 fige le FR), mais les **nouveaux** commits de ce chantier en
   anglais.
5. **`--lang` pilote la langue des ARTEFACTS GÉNÉRÉS — TRANCHÉ (cf. §0.2).** Décision prise :
   le `CLAUDE.md.template`, les skills et le vault de démo deviennent **paramétrables par langue**
   (`en` défaut + `fr`), pas mono-langue EN. `--lang` (qui pilotait la langue des notes) sélectionne
   désormais aussi la langue de ces artefacts. Le FR actuel **devient la locale `fr`** (il ne se
   perd pas). Reste à concevoir : la **forme du mécanisme** (dossiers `templates/<lang>/` vs
   catalogues i18n) — cf. **Lot 0** ci-dessous. Défaut `en` si `--lang` absent/inconnu.
6. **Tag `V1` = filet de sécurité** : toute version FR reste accessible via `git checkout V1`.

---

## 2bis. Prérequis — branche dédiée (NON négociable)

Tout le chantier se fait sur une **branche dédiée**, jamais en direct sur `main` (périmètre large,
nombreux lots, risque de casse pendant la transition FR→EN). Avant le Lot 1 :

```bash
git switch -c chore/translate-to-english   # depuis main, propre et synchro
```

- Un **commit par lot** (§3), suite verte à chaque commit, sur la branche.
- Ouverture d'une **PR** en fin de chantier (`gh pr create`) pour relire le diff en bloc avant
  merge sur `main`. Le tag `V1` reste le filet FR si on veut comparer.

## 3. Découpage proposé (lots committables, suite verte à chaque lot)

> Ordre = du moins risqué (prose pure, aucun test) au plus risqué (mécanisme de locales + tests à
> rendre agnostiques). Un lot = un commit. **Suite verte obligatoire avant chaque commit.**

- [ ] **Prérequis — branche dédiée** `chore/translate-to-english` créée depuis `main` (cf. §2bis).
- [ ] **Lot 0 — Mécanisme de locales (TDD, le cœur technique)** : sélection de langue des artefacts
      générés.
  - [ ] (a) choisir la forme (`templates/<lang>/` recommandé pour la prose longue : constitution +
        skills + démo) ;
  - [ ] (b) câbler `--lang` → locale (défaut `en`, fallback `en` si inconnu) dans `bootstrap.mjs`
        via un helper pur **testé** (ex. `resolveLocale`) ;
  - [ ] (c) tests **structurels** (la locale choisie pointe le bon dossier, fallback OK) — pas de
        prose assertée. Tant que `en` n'est pas peuplée, `fr` reste seule : ne pas casser l'existant.
- [ ] **Lot 1 — Docs publics statiques méta (A, EN unique)** : README, SETUP, CONNECTORS,
      `.env.example`. Prose pure, zéro impact test. Gros morceau (README).
      *Commit : `docs: translate generator docs to English`.*
- [ ] **Lot 2 — Amorce + constitution (A)** : `CLAUDE.md` (amorce → **EN unique**, garder marqueur) ;
      `CLAUDE.md.template` → **locale `en`** (trad EN) + l'actuel FR déplacé en **locale `fr`** ;
      placeholders `{{…}}` préservés ; `claude-md.test.mjs` rendu agnostique.
- [ ] **Lot 3 — Skills (B, localisés)** : locale `en` des 7 SKILL.md + EXAMPLES.md (+ descriptions
      frontmatter) ; l'actuel FR → locale `fr` ; aucun test ne fige la prose.
- [ ] **Lot 4 — ADRs RAG (C, EN unique)** : `rag/docs/adr/*` + renommage slugs + liens croisés.
- [ ] **Lot 5 — Code scripts + tests agnostiques (C+D, EN unique)** : `bootstrap.mjs`, `scripts/**`.
      Par fichier : traduire commentaires/strings EN, puis **rendre le test agnostique** (red→green :
      casser l'assert FR figé → réécrire structurel → vert). Sous-lots par dossier si trop gros.
- [ ] **Lot 6 — Moteur RAG + tests agnostiques (C+D, EN unique)** : `rag/src/**`, par groupe de
      modules. Suite `cd rag && npm test` verte.
- [ ] **Lot 7 — Vault de démo (E, localisé)** : locale `en` du contenu généré par
      `scripts/lib/example-notes.mjs` (source de vérité) ; l'actuel FR → locale `fr` ; renommer les
      slugs **dans chaque locale** (`la-force`→`the-force`, etc.) ; `example-notes.test.mjs`
      agnostique (asserte la structure, pas la prose).
- [ ] **Lot 8 — Interne mainteneur (E, EN unique)** : `maintainers/**`, `DEVELOPING.md`, **et ce
      plan**. En dernier (méta).
- [ ] **Lot 9 — Final** : suite complète verte (harnais `node --test scripts/lib/*.test.mjs
      scripts/*.test.mjs` + `cd rag && npm test` + `node --check bootstrap.mjs` + JSON templates
      valides) ; **E2E par langue** (`--lang en` ET `--lang fr`) ; `grep` final des accents FR
      résiduels **hors locale `fr`** ; commit de clôture ; `STATUT` → ✅ LIVRÉ ; PR ; envisager un
      tag `V2` (premier repo EN publiable).

---

## 4. Definition of Done

- [ ] **Méta-générateur 100 % EN** : plus aucune prose FR hors la locale `fr` (`grep -rE
      "é|è|à|ê|ç"` ne renvoie que la locale `fr/` + faux positifs documentés).
- [ ] **Génération localisée OK** : `--lang en` ET `--lang fr` produisent chacun un cerveau
      **cohérent et complet** (constitution + skills + démo dans la bonne langue). Défaut `en`,
      fallback `en` si langue inconnue.
- [ ] Suite **complète verte** : harnais (`scripts/**/*.test.mjs`) + RAG (`cd rag && npm test`) +
      `node --check bootstrap.mjs` + templates JSON valides.
- [ ] **Aucun test ne fige une prose FR ou EN** : tous les asserts sont structurels (cf. §0.4).
- [ ] **E2E par langue** (copie jetable, cf. §6 des plans précédents) : un run `--lang en` et un
      `--lang fr`, amorce remplacée, constitution dans la bonne langue, smoke-test MCP OK.
- [ ] Marqueur `bootstrap-stub` et placeholders `{{…}}` intacts.
- [ ] `STATUT` de ce fichier → ✅ LIVRÉ ; entrée `maintainers/README.md` à jour ; PR mergée.

---

## 5. Pour reprendre vite (note à la prochaine session)

> **D'ABORD créer la branche** `chore/translate-to-english` (cf. §2bis), JAMAIS sur `main`.
> Puis : **Lot 1** (README, prose pure = échauffement sans risque) peut démarrer tout de suite,
> mais le **cœur technique = Lot 0** (mécanisme de locales `--lang` → `en`/`fr`) doit être fait
> AVANT les lots localisés (2, 3, 7). Charger la skill `tdd-discipline`.
> Le filet de sécurité FR est le **tag `V1`** (`git checkout V1` pour retrouver le français).
> Les deux principes non négociables :
> 1. **générateur en EN** (publiable) mais **génération localisée** (`--lang` → cerveau dans la
>    langue de l'utilisateur, `en`+`fr` au lancement) ;
> 2. **tests agnostiques de la langue** — c'est l'utilisateur du générateur qui choisit la langue,
>    pas nous.

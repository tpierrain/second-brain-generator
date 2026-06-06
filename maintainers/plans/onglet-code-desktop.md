<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : ✅ FAIT (révisé 2026-06-06) — stratégie renversée : échec bruyant.  -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — fiabiliser le second cerveau depuis l'app desktop Claude (onglet Code), cible managers non-devs

> **STATUT : ✅ FAIT** (révisé le 2026-06-06). Ce plan a été **renversé** par rapport à sa première
> version (gate d'install déterministe). La nouvelle stratégie — **confiance à Claude pour installer,
> échec BRUYANT pour attraper tout état cassé** — a été exécutée (CHANGE 6 + post-flight sourcé).
> La traduction EN (`translate-to-english.md`) reste repoussée tout à la fin.
>
> **Décisions d'archi associées :** [`../decisions/0005-support-onglet-code-desktop.md`](../decisions/0005-support-onglet-code-desktop.md)
> (révisée 2026-06-06 — renversement D1/D4) et
> [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)
> (contrat MCP stable, inchangé).

---

## 0. Objectif & périmètre

Permettre à des **managers non-devs** (engineering managers, product managers, responsables)
d'**installer et d'utiliser** un second cerveau depuis l'**onglet « Code » de l'app desktop Claude**,
de façon **fiable** — pas seulement depuis le terminal (Claude Code CLI).

**Hors périmètre :** le cross-IA (autre client que Claude) — cf. ADR 0004. L'onglet Code **est**
Claude Code sur une autre surface.

## 1. Les deux pannes observées (le « pourquoi »)

- **Panne A — toolchain absente → Claude improvise des installs → état « Frankenstein ».**
  Poste de **Richard** (non-dev), puis tentative sur le Mac nu d'**Achille** : machine sans node/npm/npx.
  **Hypothèse NON PROUVÉE** : sur Achille, on a **coupé avant le verdict** — on ne sait pas si Claude
  aurait su installer proprement la toolchain depuis l'onglet Code. On a longtemps supposé que non ;
  ce n'est pas démontré.
- **Panne B — RAG down → réponse depuis Internet, silencieusement.** Chez Richard, le RAG n'a pas
  démarré → la 1re question de démo (Star Wars) a répondu **depuis Internet** au lieu du vault
  (bypass silencieux). **Panne B est PROUVÉE et c'est le danger réel** : un cerveau inutile **mais qui
  semble marcher** est pire qu'un cerveau franchement en panne.

### Findings terrain — Mac nu d'Achille (onglet Code)
- `git` présent en `/usr/bin/git` (Xcode CLT) ; **node / npm / npx absents**.
- PATH de l'onglet Code mesuré = **`/usr/local/bin`** (+ chemins système), **mais ni `/opt/homebrew/bin`
  ni les shims nvm/asdf**. → un Node installé via Homebrew Apple Silicon ou via nvm **ne serait pas vu**.
- **Agency de Claude non prouvée** : session coupée avant de voir s'il savait s'en sortir seul.

## 2. Décision (Thomas, 2026-06-06) — renversement

> Détail et raisonnement complet : **ADR 0005, section « Révision 2026-06-06 »**.

- **Confiance à Claude pour installer** (UX de l'ère Claude). **Pas de gate d'install.** On abandonne
  l'idée d'un pré-vol déterministe qui *prévient* (panne A non prouvée — on ne durcit pas contre un
  risque non démontré).
- **Seul filet : rendre tout état cassé BRUYANT** (panne B, prouvée). On **attrape** l'install cassée
  au lieu de la *prévenir*, sur deux faces :
  - **Runtime** — la constitution générée refuse de répondre hors-vault quand `vault-rag` est indispo.
  - **Install-time** — le post-flight du bootstrap prouve que la démo répond **depuis le vault**
    (source citée), sinon FAIL bruyant + `exit 1`.
- Ceci **renverse D1 (install maximalement déterministe) et D4 (interdiction d'improviser des
  installs)** de la première version de ce plan / de l'ADR 0005.

## 3. Invariants préservés (inchangés)

- **Launcher/cerveau** (ADR 0001) : launcher lecture seule ; bootstrap crée un dossier neuf et
  **refuse une cible existante**.
- **Push opt-in** : auto-commit ne pousse que si `secondbrain.autopush=true`.
- **Secrets** : clé Gemini **jamais** en argument CLI ; vit dans `.env` (gitignoré).
- **Multi-OS** : Node pur dans le cœur ; `.cmd` sur Windows ; chemins JSON normalisés `/` (`toPosix`).
- **Idempotence** du bootstrap.
- **Contrat MCP stable** (ADR 0006).

---

## 4. Ce qui a été FAIT (les deux faces du filet)

### ✅ CHANGE 6 — Fail-loud RAG dans la constitution (runtime)
`CLAUDE.md.template`, section « Vault — RAG sémantique » : règle en gras — si les outils
`mcp__vault-rag__*` sont **indisponibles ou en erreur**, le DIRE FORT (« ⚠️ RAG indisponible ») et
**REFUSER** de fabriquer une réponse depuis Internet/connaissances générales — **surtout pour la
question de démo** (premier contact de l'utilisateur). C'est la couche qui aurait évité le bypass
silencieux de Richard.

### ✅ Post-flight sourcé (install-time)
- `scripts/lib/mcp-smoke.mjs` : param optionnel `probe:{ tool, args, expectText }`. Après le smoke
  structurel (`tools/list`), il **appelle réellement** `search_vault` (`tools/call`) et vérifie que
  la réponse **cite une source du vault** (`/vault\//`). Sans `probe` → comportement inchangé.
- `bootstrap.mjs` étape 9/9 :
  - **avec clé Gemini** (`keyReady`) → probe avec la question de démo. PASS = bannière succès `exit 0` ;
    **FAIL = `err()` bruyant + `process.exit(1)` AVANT la bannière** (pas de faux vert).
  - **sans clé** → smoke structurel seul + message honnête « check démo **reporté** — colle ta clé
    dans `.env` puis pose la démo » → `exit 0`.
- Question de démo extraite en **constante `DEMO`** (réutilisée par le probe et le message final).

### ✅ Nettoyage
`scripts/preflight.sh` + `scripts/preflight.test.mjs` (pré-vol exploratoire du gate abandonné) **retirés**.

---

## 5. Items GELÉS (et pourquoi)

Tout ce qui suit appartenait à la stratégie « gate déterministe » et est **abandonné** avec le
renversement — pas perdu, juste consciemment écarté :

- **Pré-vol déterministe 1a** (`preflight.sh` GUI-visible, rejet nvm/asdf) — *prévenait* la panne A
  non prouvée. Gate abandonné → retiré.
- **Amorce `CLAUDE.md` « STOP si rouge » + interdiction d'improviser des installs (D4)** — on fait
  désormais **confiance** à Claude pour installer.
- **Heuristiques PATH « GUI-visible » / « PATH GUI-minimal simulé »** (CHANGE 1b/5.3) — servaient à
  prouver le desktop en amont. Le post-flight réel suffit à attraper l'échec.
- **Self-heal runtime 1c** (`process.env.PATH = …` en tête des scripts hook) — à ne **durcir que si**
  une machine réelle prouve que le runtime ne résout pas node *après* un bootstrap réussi. Non observé.
- **`--here` (install in place, 3a)** — entaillait le modèle « cerveau ≠ launcher ». Pas nécessaire au
  filet ; différé.
- **Handoff manuel desktop / statut SessionStart visible en desktop (CHANGE 4)** — l'alerte précoce
  est désormais portée par le post-flight (install-time) + la constitution fail-loud (runtime).

> Les CHANGE 2 (pré-approuver le serveur MCP), CHANGE 3 (onboarding desktop README/SETUP) et CHANGE 5
> (noms de serveur MCP opaques) restent des **améliorations UX possibles**, non bloquantes, hors du
> filet de fiabilité. À reprendre seulement si le terrain le justifie.

---

## 6. Validation (juge de paix)

- `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` au vert (dont nouveaux cas mcp-smoke :
  probe sourcé, probe non sourcé, régression sans probe).
- **Mac nu d'Achille, onglet Code** : (1) laisser Claude installer **en entier sans couper** →
  observer s'il marche/casse et comment (clôt enfin l'hypothèse panne A) ; (2) si marche : avec clé,
  post-flight **PASS** + démo **sourcée du vault** + un write → commit auto ; (3) si casse : **panne B
  bruyante** (post-flight FAIL `exit 1` et/ou constitution qui refuse de répondre hors-vault).
- **Sans clé** : bootstrap `exit 0` + message « check démo reporté » (pas de faux vert).

## 7. Idées différées (feu vert de Thomas requis)

- **`doctor` non bloquant** — une commande de diagnostic (toolchain, clé, index, connexion MCP) que
  l'utilisateur lance s'il a un doute, **sans gate**. À considérer si le terrain montre que le
  post-flight ne suffit pas à orienter le dépannage.
- **Composant RAG partagé/upgradable** (ADR 0006) — frotte avec ADR 0003. À trancher avec Thomas.
- **`vault_stats` provider-agnostique** (ADR 0006) — sortir le vocabulaire « quota Gemini ».
- **Variante Windows** d'éventuels scripts — macOS d'abord (la cible immédiate).

# Chantier — Connexion MCP & connecteurs au bootstrap

> **But du fichier** : piloter un chantier découpé en plusieurs sessions Claude Code, sans
> dépendre du contexte de conversation (anti *context rot*). Une session fraîche lit **ce
> fichier + `DEVELOPING.md`**, fait *une* session, coche, commit, et s'arrête.
>
> ⚠️ Fichier **temporaire** : à supprimer en Session D (clôture).

## Objectif global

Améliorer l'expérience MCP de `bootstrap.mjs` :
1. **Smoke-test MCP** en fin de bootstrap : vérifier que Claude Code pourra réellement parler
   au serveur `vault-rag` (handshake stdio), avant de lancer `claude`.
2. **Étape connecteurs guidée** (optionnelle) : proposer de brancher des sources externes
   (Slack/Drive/Notion…) en injectant les blocs `.mcp.json` + permissions `settings.json`,
   avec rappel des credentials. Reste fidèle à l'esprit « starter » : guidé mais pas magique.

## Règles du chantier (rappel)

- **TDD strict** sur toute logique (cf. `DEVELOPING.md` règle 6) : red → green → refactor.
  Tests via `node --test`. Suite globale verte + `cd rag && npx tsc --noEmit` à chaque étape.
- **Multi-OS** : pur Node. `npx`/`npm` → suffixe `.cmd` sur Windows. Chemins en slashes `/`.
- **Une session = une feature = un commit vert.** Cocher les cases ici avant de commit.
- **Neutralité** : aucun nom perso/entreprise ; credentials = placeholders.
- **Commits manuels** (pas de hook auto-commit dans CE repo).
- Démarrer chaque session par `/clear`, ne charger que ce fichier + les `scripts/lib/*`
  touchés, déléguer toute recherche large à un sous-agent.

---

## Session A — Smoke-test MCP  ✅

**Livrable** : `bootstrap.mjs` affiche ✅/❌ de connexion au serveur `vault-rag` en fin d'install.

- [x] `scripts/lib/mcp-smoke.mjs` — `smokeTestMcp({command, args, cwd, expectTools, timeoutMs, env})`
      → spawn le serveur, handshake JSON-RPC **stdio newline-delimited** :
      `initialize` → réponse → `notifications/initialized` → `tools/list` → réponse.
      Renvoie `{ ok, tools: string[], error? }`. Timeout (défaut 15 s). Kill le child en sortie.
      Détection rapide de la mort du process (handler `exit`). **Pas de clé Gemini requise**.
- [x] `scripts/lib/mcp-smoke.test.mjs` (TDD) + **stub serveur** (`scripts/lib/__fixtures__/stub-mcp-server.mjs`,
      pilotable par `STUB_TOOLS`/`STUB_MODE`) → tests déterministes, sans réseau ni Gemini.
      Cas couverts : succès, outil manquant, timeout, serveur qui meurt. (4 tests verts.)
- [x] Wiring `bootstrap.mjs` : étape « 7/7 · Vérification de la connexion MCP » après l'indexation.
      Lit la conf `vault-rag` dans `.mcp.json` (mapping `npx`→`npx.cmd` sur Windows), `expectTools` =
      `["search_vault","get_document","list_documents","vault_stats"]`.
      **Non bloquant** : ❌ → `warn(...)` + pointer SETUP §8, pas d'`exit 1`. Étapes renumérotées `/6`→`/7`.
- [x] Doc : ligne troubleshooting `SETUP.md §8` (« Smoke-test MCP ❌ → … »).
- [x] `node --test` vert (4) + `cd rag && npm test` vert (76). E2E bootstrap jetable OK (`7/7 ✓ 5 outils`).
- [ ] **Commit** : `feat: smoke-test MCP en fin de bootstrap`

**Notes d'implémentation**
- Le serveur RAG démarre **non bloquant** (cf. `rag/docs/adr/0002`) → il répond à `initialize`
  même si l'indexation tourne en fond. OK pour un timeout court.
- `protocolVersion` dans `initialize` : envoyer une version récente (ex. `"2025-06-18"`) et
  accepter celle renvoyée par le serveur (le SDK `@modelcontextprotocol/sdk` négocie).
- Parser stdout **ligne par ligne** (une ligne = un message JSON-RPC). Ignorer les lignes non-JSON
  (logs éventuels du serveur sur stderr → ne pas lire stderr pour le protocole).

---

## Session B — Connecteurs : cœur logique (TDD pur)  ✅

**Livrable** : catalogue + fonctions de fusion idempotentes, entièrement testées. Aucun interactif.

- [x] `scripts/lib/connectors-catalog.mjs` — tableau `CONNECTORS` :
      `{ id, label, kind: 'mcp'|'native', serverConfig?, permissions?: string[], credentialsHint }`.
      - `kind:'mcp'` : `serverConfig` = bloc `.mcp.json` prêt à fusionner, env en **placeholders**
        (`"<…>"`), `permissions` = outils `mcp__<server>__*`.
      - `kind:'native'` : **pas** de `serverConfig` → juste un `credentialsHint` vers les
        *Connectors* claude.ai. Ne RIEN écrire pour ceux-là.
      - 4 entrées neutres : Google Drive (mcp), Notion (mcp), Slack (native), Google Calendar (native).
- [x] `scripts/lib/connectors-merge.mjs` — fonctions **pures** :
      `addServerToMcpJson(mcpObj, connector) → mcpObj'` et
      `addPermissions(settingsObj, perms[]) → settingsObj'`. **Idempotentes** (dédup),
      **non mutantes** (retour d'une copie).
- [x] `scripts/lib/connectors-merge.test.mjs` (TDD, 6 tests) : ajout, non-mutation + conservation
      des existants, idempotence serveur, ajout de permissions, dédup, non-mutation settings.
      `scripts/lib/connectors-catalog.test.mjs` (4 tests) : taille 2-4, champs requis + ids uniques,
      invariants mcp (serverConfig + permissions `mcp__*` + env placeholders), natifs sans serverConfig.
- [x] `node --test scripts/lib/*.test.mjs` vert (14) + `cd rag && npx tsc --noEmit` OK. Neutralité OK.
- [ ] **Commit** : `feat: catalogue connecteurs + merge idempotent (core testé)`

---

## Session C — Connecteurs : wizard + docs  ✅

**Livrable** : étape interactive optionnelle dans `bootstrap.mjs`, + `SETUP.md §6` réécrit.

- [x] Étape `bootstrap.mjs` **5/8 « Brancher des sources externes »** (après génération des
      fichiers, `rl` encore ouvert, avant `npm install`) : si **interactif** → « Brancher des
      sources externes ? [o/N] » → pour chaque connecteur du catalogue accepté, `kind:'mcp'` →
      `applyConnectorFiles` (fusionne `.mcp.json` + `settings.json`), `kind:'native'` → warn +
      pointeur claude.ai (rien écrit). `credentialsHint` affiché dans les deux cas. Steps
      renumérotés `/7`→`/8` (5 = connecteurs, 6 = install, 7 = index, 8 = smoke-test).
- [x] Non-interactif (`!stdin.isTTY`) → étape ignorée (warn). Relançable / idempotent (Session B).
- [x] Cœur I/O testable extrait : `scripts/lib/connectors-apply.mjs` (`applyConnectorFiles`,
      fine couche read/merge/write au-dessus de Session B) + `connectors-apply.test.mjs` (TDD,
      3 tests en dossier jetable `mkdtemp` : écrit serveur+permissions, idempotence 2ᵉ passe,
      natif n'écrit rien). Le wizard interactif lui-même = orchestration I/O (exception assumée).
- [x] `SETUP.md §6` réécrit : **3 chemins nommés** — (a) wizard `node bootstrap.mjs`,
      (b) ajout manuel, (c) connecteurs natifs claude.ai (≠ `.mcp.json`). `§2` liste 8 étapes.
- [x] `node --test scripts/lib/*.test.mjs` vert (17) + `cd rag && npm test` vert (76) + tsc OK.
      Neutralité OK (aucun chemin absolu en dur dans les fichiers touchés).
- [ ] **Commit** : `feat: étape connecteurs guidée au bootstrap`

---

## Session D — Clôture  ⬜

- [ ] E2E : bootstrap dans une copie jetable (cf. `DEVELOPING.md` règle 4) exerçant smoke-test
      + wizard ; sanity check chemins Unix & Windows (substitution `toPosix`).
- [ ] Passe finale README/SETUP/DEVELOPING (cohérence des étapes numérotées).
- [ ] **Supprimer `docs/connectors-plan.md`** (ce fichier).
- [ ] **Commit** : `chore: clôture chantier connecteurs MCP`

---

## Journal de reprise

> Chaque session : noter en une ligne ce qui est fait et le prochain point d'entrée.

- **Session A (faite)** — smoke-test MCP livré : `scripts/lib/mcp-smoke.mjs` (+ test + stub),
  étape 7/7 du bootstrap, doc SETUP §8. Tout vert, E2E jetable OK. **Prochain point d'entrée : Session B**
  (catalogue connecteurs + merge idempotent, TDD pur, aucun interactif).
- **Session B (faite)** — cœur logique livré : `connectors-catalog.mjs` (`CONNECTORS`, 4 entrées
  neutres) + `connectors-merge.mjs` (`addServerToMcpJson`, `addPermissions` — purs, idempotents,
  non mutants) + tests (6 merge, 4 catalogue). `node --test` vert (14), tsc OK, neutralité OK.
  **Prochain point d'entrée : Session C** (wizard interactif optionnel dans `bootstrap.mjs` qui
  consomme catalogue + merge, + réécriture `SETUP.md §6`).
- **Session C (faite)** — wizard livré : étape `bootstrap.mjs` 5/8 (interactive, optionnelle,
  skip si non-TTY) qui branche les connecteurs via `connectors-apply.mjs` (`applyConnectorFiles`,
  3 tests jetables TDD) ; steps renumérotés `/7`→`/8`. `SETUP.md §6` réécrit en 3 chemins
  nommés (wizard / manuel / natifs claude.ai), `§2` à 8 étapes. Tout vert (17 + 76), tsc OK,
  neutralité OK. **Prochain point d'entrée : Session D** (clôture : E2E bootstrap jetable
  smoke-test + wizard, passe finale README/SETUP/DEVELOPING, suppression de ce fichier).

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

## Session A — Smoke-test MCP  ⬜

**Livrable** : `bootstrap.mjs` affiche ✅/❌ de connexion au serveur `vault-rag` en fin d'install.

- [ ] `scripts/lib/mcp-smoke.mjs` — `smokeTestMcp({command, args, cwd, expectTools, timeoutMs})`
      → spawn le serveur, handshake JSON-RPC **stdio newline-delimited** :
      `initialize` → réponse → `notifications/initialized` → `tools/list` → réponse.
      Renvoie `{ ok, tools: string[], error? }`. Timeout (défaut ~15 s). Kill le child en sortie.
      **Pas de clé Gemini requise** (lister les outils n'embedde rien).
- [ ] `scripts/lib/mcp-smoke.test.mjs` (TDD) + **stub serveur** (`scripts/lib/__fixtures__/stub-mcp-server.mjs`)
      qui répond à `initialize`/`tools/list` → test déterministe, sans réseau ni Gemini.
      Cas : succès (outils attendus présents), timeout, serveur qui crash, outil manquant.
- [ ] Wiring `bootstrap.mjs` : nouvelle étape « 7/7 · Vérification de la connexion MCP »
      après l'indexation. Appelle `smokeTestMcp` avec la conf lue dans `.mcp.json` (command
      `npx`, args `["tsx","rag/src/index.ts"]`, cwd = ROOT), `expectTools` =
      `["search_vault","get_document","list_documents","vault_stats"]`.
      **Non bloquant** : ❌ → `warn(...)` + pointer SETUP, ne PAS `exit 1`.
      (Renuméroter les étapes : passer de « 6/6 » à « 7/7 ».)
- [ ] Doc : ligne troubleshooting `SETUP.md §8` (« smoke-test MCP ❌ → … »).
- [ ] `node --test` vert + `cd rag && npm test` vert.
- [ ] **Commit** : `feat: smoke-test MCP en fin de bootstrap`

**Notes d'implémentation**
- Le serveur RAG démarre **non bloquant** (cf. `rag/docs/adr/0002`) → il répond à `initialize`
  même si l'indexation tourne en fond. OK pour un timeout court.
- `protocolVersion` dans `initialize` : envoyer une version récente (ex. `"2025-06-18"`) et
  accepter celle renvoyée par le serveur (le SDK `@modelcontextprotocol/sdk` négocie).
- Parser stdout **ligne par ligne** (une ligne = un message JSON-RPC). Ignorer les lignes non-JSON
  (logs éventuels du serveur sur stderr → ne pas lire stderr pour le protocole).

---

## Session B — Connecteurs : cœur logique (TDD pur)  ⬜

**Livrable** : catalogue + fonctions de fusion idempotentes, entièrement testées. Aucun interactif.

- [ ] `scripts/lib/connectors-catalog.mjs` — tableau de connecteurs :
      `{ id, label, kind: 'mcp'|'native', serverConfig?, permissions?: string[], credentialsHint }`.
      - `kind:'mcp'` (self-hosted/communautaire) : `serverConfig` = bloc `.mcp.json` prêt à fusionner,
        env en **placeholders** (`"<CHEMIN_CREDENTIALS>"`), `permissions` = noms d'outils
        `mcp__<server>__*` à autoriser.
      - `kind:'native'` (Slack/Gmail/Calendar via claude.ai) : **pas** de `.mcp.json` → juste un
        `credentialsHint` pointant vers les *Connectors* du compte. Ne RIEN écrire pour ceux-là.
      - Garder 2-4 entrées neutres et crédibles (ex. Google Drive communautaire, Notion…).
- [ ] `scripts/lib/connectors-merge.mjs` — fonctions **pures** :
      `addServerToMcpJson(mcpObj, connector) → mcpObj'` et
      `addPermissions(settingsObj, perms[]) → settingsObj'`. **Idempotentes** (pas de doublon si
      le serveur/permission existe déjà). Ne mutent pas l'entrée (retour d'une copie).
- [ ] `scripts/lib/connectors-merge.test.mjs` (TDD) : ajout, ré-ajout (idempotence), fusion de
      permissions sans doublon, conservation des serveurs/permissions existants.
- [ ] `node --test` vert.
- [ ] **Commit** : `feat: catalogue connecteurs + merge idempotent (core testé)`

---

## Session C — Connecteurs : wizard + docs  ⬜

**Livrable** : étape interactive optionnelle dans `bootstrap.mjs`, + `SETUP.md §6` réécrit.

- [ ] Étape `bootstrap.mjs` (après génération des fichiers, avant/après le smoke-test) :
      si **interactif** → « Brancher des sources externes ? [o/N] » → pour chaque connecteur
      `kind:'mcp'` choisi : lire `.mcp.json` + `settings.json`, appliquer `addServerToMcpJson` /
      `addPermissions` (Session B), réécrire les fichiers, afficher le `credentialsHint`.
      Pour les `kind:'native'` : juste afficher le pointeur claude.ai (ne rien écrire).
- [ ] Non-interactif (`!stdin.isTTY`) → skip silencieux. Relançable (idempotent grâce à Session B).
- [ ] Test d'intégration léger en dossier jetable (`/tmp/...`) : choisir 1 connecteur mcp →
      vérifier que `.mcp.json` et `settings.json` contiennent bien le serveur + les permissions,
      et qu'une 2ᵉ passe ne duplique pas.
- [ ] Réécrire `SETUP.md §6` : **3 chemins distincts et nommés** —
      (a) wizard `node bootstrap.mjs`, (b) ajout manuel, (c) connecteurs natifs claude.ai (≠ `.mcp.json`).
- [ ] `node --test` vert + `cd rag && npm test` vert.
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

- _(rien encore — démarrer par la Session A)_

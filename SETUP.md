# SETUP — Installation détaillée & personnalisation

## 1. Prérequis

| Outil | Pourquoi | Installation |
|---|---|---|
| **Node.js ≥ 18** | Fait tourner le moteur RAG **et** tout le harnais (installateur + hooks sont en Node, multi-OS) | https://nodejs.org (macOS : `brew install node` · Windows : `winget install OpenJS.NodeJS`) |
| **git** | Versionnement + portabilité entre machines | https://git-scm.com |
| **Claude Code** | L'agent qui interroge le vault | https://claude.com/claude-code |
| **Clé Gemini** | Embeddings + recherche sémantique (gratuit) | https://aistudio.google.com/apikey |

> **Multi-OS** : macOS, Linux et Windows (cmd ou PowerShell). L'installateur et les hooks
> sont en Node — pas besoin de bash, `jq` ni `sqlite3`. Node est le seul prérequis runtime.

## 2. Installation

```bash
node bootstrap.mjs
```

Le script :
1. vérifie les prérequis (et s'arrête proprement s'il en manque) ;
2. te demande nom / contexte / langue / nom de projet ;
3. te demande ta clé Gemini (ou plus tard) ;
4. génère `CLAUDE.md`, `.mcp.json`, `.claude/settings.json`, `.env` personnalisés ;
5. installe les dépendances du moteur (`npm install`) ;
6. indexe le vault d'exemple.

Idempotent : tu peux le relancer. Les fichiers déjà générés ne sont pas écrasés (supprime-les pour régénérer).

### Installation manuelle (si tu préfères)
1. Copie `.env.example` → `.env` et renseigne ta clé Gemini.
2. Copie chaque `*.template` vers son fichier final (`CLAUDE.md.template` → `CLAUDE.md`,
   `.mcp.json.template` → `.mcp.json`, `.claude/settings.json.template` → `.claude/settings.json`)
   puis remplace les placeholders `{{...}}` (notamment `{{PROJECT_ROOT}}` = chemin absolu du
   repo en slashes `/`, et `{{TMP_DIR}}` = dossier temp de l'OS).
3. `cd rag && npm install && npm run index`

> En pratique, `node bootstrap.mjs` fait tout ça pour toi, sur tous les OS — préfère-le.

## 3. Premier test

```bash
claude
```
Puis : *« Quelle base de données a-t-on choisie pour la facturation et pourquoi ? »*
Claude doit citer `[[decisions/2026-01-10-choix-base-de-donnees]]`.

> Si Claude ne « voit » pas le serveur RAG : vérifie que `.mcp.json` existe et pointe le bon
> chemin, accepte le serveur MCP au démarrage de Claude Code, et que `.env` contient la clé.

## 4. Le moteur RAG en bref

- Découpe chaque `.md` en **chunks** (un par section `#`/`##`/`###`).
- Embedde chaque chunk (modèle `gemini-embedding-001`) → vecteur stocké dans `rag/.cache/vault.db` (SQLite).
- Une recherche embedde la question et remonte les chunks les plus proches par similarité.
- **Incrémental** : seuls les fichiers modifiés (hash de contenu) sont ré-indexés. Au démarrage du serveur MCP, un reindex de fond rattrape les nouveautés sans bloquer les recherches.
- **Garde-fous quota** : plafond `MAX_EMBED_REQUESTS_PER_DAY` + réserve `QUERY_RESERVE` (les recherches ne sont jamais bloquées par l'indexation). Surchargeables dans `.env`.
- Rebuild forcé : `cd rag && npm run reindex`. Tests : `cd rag && npm test`.

Outils MCP exposés : `search_vault`, `get_document`, `list_documents`, `vault_stats`, `reindex`.

## 5. Personnaliser ton harnais

| Fichier | À faire |
|---|---|
| `CLAUDE.md` | Adapter les sections marquées 🔧 : confidentialité, dossiers du vault, sources, ton. C'est *ta* constitution. |
| `vault/` | Supprimer les notes d'exemple, mettre les tiennes. Garder les conventions de nommage. |
| `.claude/skills/` | Ajouter tes skills (voir `EXAMPLES.md`). `/improve` t'aide à les faire évoluer. |

## 6. Connecteurs externes (optionnel)

Le starter ne fournit que le moteur RAG. Pour brancher tes sources, ajoute des MCP servers
dans `.mcp.json`. Exemples (adapte les commandes/credentials à chaque serveur) :

```jsonc
{
  "mcpServers": {
    "vault-rag": { "...": "déjà là" },

    // Google Drive (transcripts, docs) — ex. paquet communautaire
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@isaacphi/mcp-gdrive"],
      "env": { "GDRIVE_CREDS_DIR": "/chemin/vers/credentials" }
    }
    // Slack, Notion, Gmail, Calendar : ajoute le MCP server de ton choix ici.
  }
}
```

Pense à :
- documenter dans `CLAUDE.md` (§ 4) **quel outil pour quoi** ;
- ajouter les permissions correspondantes dans `.claude/settings.json` (`mcp__<server>__<tool>`) ;
- activer le serveur côté Claude Code au démarrage.

Pour les connecteurs natifs Claude (Slack/Gmail/Calendar/Notion via claude.ai), branche-les
depuis les *Connectors* de ton compte plutôt que dans `.mcp.json`.

## 7. Portabilité multi-machines

Configure un remote git privé :
```bash
git remote add origin <url-de-ton-repo-privé>
git push -u origin main
```
Le hook auto-commit pushera ensuite à chaque modif. Sur l'autre machine, `git clone` +
`node bootstrap.mjs` (récupère la clé / réinstalle), et tu retrouves ton cerveau. En cours de
session, le skill `/sync` récupère les changements de l'autre machine.

> ⚠️ Ne commite **jamais** `.env` (gitignoré). Sur une nouvelle machine, re-renseigne la clé.

## 8. Troubleshooting

| Symptôme | Cause probable | Remède |
|---|---|---|
| `npm install` échoue dans `rag/` | Node trop ancien | Node ≥ 18 (`node -v`) |
| `npm install` échoue sur **`better-sqlite3`** (Windows) | Module natif sans prebuild pour ta version de Node | Utilise une **version LTS** de Node (prebuilds dispos), ou installe les outils de compilation : `npm install --global windows-build-tools` (ancien) ou les *Visual Studio Build Tools* (« Desktop development with C++ »). Puis `cd rag && npm install`. |
| Recherches vides | Index pas construit / pas de clé | `cd rag && npm run index` après avoir mis la clé |
| `RESOURCE_EXHAUSTED` / 429 | Quota Gemini du jour atteint | reprise auto au reset (minuit Pacifique), ou monte `MAX_EMBED_REQUESTS_PER_DAY` |
| Statut RAG « indisponible » au démarrage | Moteur RAG pas encore installé / DB en cours d'écriture | `cd rag && npm install` ; le statut se rétablit une fois l'index construit |
| Le serveur MCP n'apparaît pas | `.mcp.json` absent / mauvais chemin | relance `node bootstrap.mjs`, accepte le serveur dans Claude Code |
| **Smoke-test MCP ❌** en fin de bootstrap (« connexion MCP KO ») | `rag/` pas installé, `.mcp.json` mal généré, ou `npx`/`tsx` indisponible | `cd rag && npm install` puis relance `node bootstrap.mjs` ; vérifie que `.mcp.json` pointe `npx tsx rag/src/index.ts` avec le bon `cwd`. Test manuel : `npx tsx rag/src/index.ts` doit démarrer sans crash (la clé Gemini n'est **pas** requise pour ce test). |

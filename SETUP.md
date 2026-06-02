# SETUP — Installation détaillée & personnalisation

## 1. Prérequis

| Outil | Pourquoi | Installation |
|---|---|---|
| **Node.js ≥ 18** | Fait tourner le moteur RAG | https://nodejs.org · ou `brew install node` |
| **git** | Versionnement + portabilité entre machines | https://git-scm.com |
| **Claude Code** | L'agent qui interroge le vault | https://claude.com/claude-code |
| **Clé Gemini** | Embeddings + recherche sémantique (gratuit) | https://aistudio.google.com/apikey |
| `jq`, `sqlite3` *(optionnels)* | Ligne de statut plus riche au démarrage | `brew install jq sqlite3` |

## 2. Installation

```bash
./bootstrap.sh
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
```bash
cp .env.example .env && $EDITOR .env            # mets ta clé Gemini
sed "s|{{PROJECT_ROOT}}|$(pwd)|g" .mcp.json.template > .mcp.json
sed "s|{{PROJECT_ROOT}}|$(pwd)|g" .claude/settings.json.template > .claude/settings.json
cp CLAUDE.md.template CLAUDE.md                  # puis édite les placeholders {{...}}
cd rag && npm install && npm run index
```

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
`./bootstrap.sh` (récupère la clé / réinstalle), et tu retrouves ton cerveau. En cours de
session, le skill `/sync` récupère les changements de l'autre machine.

> ⚠️ Ne commite **jamais** `.env` (gitignoré). Sur une nouvelle machine, re-renseigne la clé.

## 8. Troubleshooting

| Symptôme | Cause probable | Remède |
|---|---|---|
| `npm install` échoue dans `rag/` | Node trop ancien | Node ≥ 18 (`node -v`) |
| Recherches vides | Index pas construit / pas de clé | `cd rag && npm run index` après avoir mis la clé |
| `RESOURCE_EXHAUSTED` / 429 | Quota Gemini du jour atteint | reprise auto au reset (minuit Pacifique), ou monte `MAX_EMBED_REQUESTS_PER_DAY` |
| Statut RAG « indisponible » au démarrage | `sqlite3`/`jq` absents | `brew install jq sqlite3` (optionnel) |
| Le serveur MCP n'apparaît pas | `.mcp.json` absent / mauvais chemin | relance `./bootstrap.sh`, accepte le serveur dans Claude Code |

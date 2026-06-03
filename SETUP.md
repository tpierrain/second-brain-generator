# SETUP — Installation détaillée & personnalisation

## 1. Prérequis

| Outil | Pourquoi | Installation |
|---|---|---|
| **Node.js ≥ 18** | Fait tourner le moteur RAG **et** tout le harnais (installateur + hooks sont en Node, multi-OS) | https://nodejs.org (macOS : `brew install node` · Windows : `winget install OpenJS.NodeJS`) |
| **git** | Versionnement + portabilité entre machines | https://git-scm.com |
| **Claude Code** | L'agent qui interroge le vault | https://claude.com/claude-code |
| **Clé Gemini** | Embeddings + recherche sémantique (gratuit pour démarrer) | https://aistudio.google.com/apikey |

> **Multi-OS** : macOS, Linux et Windows (cmd ou PowerShell). L'installateur et les hooks
> sont en Node — pas besoin de bash, `jq` ni `sqlite3`. Node est le seul prérequis runtime.

> 🔒 **Confidentialité** : sur le **palier gratuit**, Gemini peut utiliser tes contenus pour
> améliorer ses produits (relecture humaine possible). Pour un vault **confidentiel**, active la
> **facturation** (palier payant). Côté Claude, pense aussi à désactiver le partage pour
> l'amélioration. **Détails en §9 (Confidentialité des données).**

### 1.1 Récupérer ta clé Gemini — l'affaire de 2 minutes

Pas besoin de toucher à la console Google Cloud : tout se fait via **Google AI Studio**, en
quelques clics.

1. Ouvre **<https://aistudio.google.com/apikey>** et connecte-toi avec un compte Google.
2. Clique **« Create API key »** (Créer une clé API).
3. Laisse AI Studio **créer un projet automatiquement** (ou choisis-en un existant) — tu n'as rien
   d'autre à configurer.
4. **Copie la clé** (elle ressemble à `AIza…`).
5. Colle-la quand `node bootstrap.mjs` te la demande (ou dans `.env`, variable `GEMINI_API_KEY`).

C'est tout : le **palier gratuit est actif immédiatement**, aucune carte bancaire requise pour
démarrer.

> 💳 **Passer au payant** (recommandé pour un vault confidentiel — cf. §9) : dans AI Studio, ouvre
> la clé et **active la facturation** sur son projet (un compte de facturation Google Cloud, créé en
> une fois). Le coût reste de l'ordre de quelques centimes (cf. l'abaque en §9).
>
> ⚠️ Une clé API est un **secret** : ne la commite jamais, ne la partage pas. Elle vit dans `.env`,
> qui est gitignoré.

## 2. Installation

```bash
node bootstrap.mjs
```

Le script :
1. vérifie les prérequis (et s'arrête proprement s'il en manque) ;
2. te demande nom / contexte / langue / nom de projet ;
3. te demande ta clé Gemini (ou plus tard) ;
4. génère tes fichiers personnalisés : `CLAUDE.md` (qui **remplace l'amorce de pré-installation**),
   `.mcp.json`, `.claude/settings.json`, `.env` ;
5. propose de **brancher des sources externes** (optionnel — cf. §6) ;
6. propose de **vider les notes d'exemple** (optionnel — garde-les pour le 1er test, vide-les ensuite pour ne pas polluer ton RAG) ;
7. installe les dépendances du moteur (`npm install`) ;
8. indexe le vault d'exemple ;
9. **smoke-test MCP** : vérifie que Claude Code pourra parler au serveur `vault-rag` (cf. §8).

Idempotent : tu peux le relancer. Les fichiers déjà générés ne sont pas écrasés (supprime-les pour
régénérer) — seule exception, le `CLAUDE.md` **amorce** est remplacé au premier passage ; ta vraie
constitution `CLAUDE.md`, une fois en place, est ensuite préservée.

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

Le starter ne fournit que le moteur RAG. Pour interroger aussi tes autres sources
(Drive, Notion, Slack, Calendar…), trois chemins — choisis selon ton confort.

### (a) Le wizard du bootstrap — *recommandé*

Pendant `node bootstrap.mjs`, l'étape **5/8 « Brancher des sources externes »** te propose un
petit catalogue. Pour chaque connecteur **MCP** que tu acceptes, le script fusionne tout seul
son bloc serveur dans `.mcp.json` **et** ses permissions dans `.claude/settings.json`, puis
t'affiche le rappel credentials à renseigner. C'est **idempotent** : relancer le bootstrap ne
crée jamais de doublon. Reste à mettre tes vrais credentials à la place des placeholders `<…>`.

### (b) À la main — *si tu préfères tout contrôler*

Ajoute toi-même le MCP server dans `.mcp.json` (adapte commande/credentials à chaque serveur) :

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

Pense alors à :
- documenter dans `CLAUDE.md` (§ 4) **quel outil pour quoi** ;
- ajouter les permissions correspondantes dans `.claude/settings.json` (`mcp__<server>__<tool>`) ;
- activer le serveur côté Claude Code au démarrage.

### (c) Connecteurs natifs claude.ai — *≠ `.mcp.json`*

Slack, Gmail, Calendar, Notion existent aussi en **connecteurs natifs** côté compte claude.ai.
Ceux-là **ne se branchent pas dans `.mcp.json`** : active-les depuis les *Connectors* de ton
compte (Settings → Connectors). Le wizard (a) te le rappelle pour ces sources et n'écrit rien
pour elles.

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

## 9. Confidentialité des données

Ton vault peut contenir du **professionnel / confidentiel**. Deux services voient ton contenu —
et dans les deux cas, tu peux **empêcher son exploitation**.

### Claude (le raisonnement)

Claude Code lit ton vault pour répondre.
- **API, Team, Enterprise** : par défaut, tes données **ne servent pas** à entraîner les modèles.
- **Grand public** (claude.ai Free/Pro/Max) : va dans **Réglages → Confidentialité** et **désactive**
  l'utilisation de tes conversations pour l'amélioration des modèles.

### Gemini (le RAG / embeddings)

Le moteur envoie le **texte de tes notes** (et de tes requêtes) à l'API Gemini pour calculer les
**embeddings** — c'est tout : Gemini ne « répond » jamais, et les vecteurs sont stockés **en local**
(`rag/.cache`).
- **Palier gratuit** : ⚠️ Google **peut utiliser ces contenus pour améliorer ses produits**, et une
  **relecture humaine** est possible. À éviter pour du confidentiel.
- **Palier payant** (facturation activée sur ta clé / projet Google) : Google s'engage à **ne pas**
  utiliser tes contenus pour l'entraînement, sans relecture humaine. **C'est le geste qui met tes
  données à l'abri.**

**Et ça ne coûte presque rien** (`gemini-embedding-001`, ordre de grandeur ~0,15 $ / million de
tokens indexés) :

| Ce que tu indexes | Coût approximatif (one-shot) |
|---|---|
| ~1 000 notes (≈ 500 mots chacune) | **~0,10 €** (une dizaine de centimes) |
| ~10 000 notes | **~1 €** |
| Tes **requêtes** (quelques dizaines de tokens) | **négligeable** — des dizaines de milliers de questions pour ~1 centime |

> L'index est **incrémental** : seules les notes **modifiées** sont ré-embeddées → le coût récurrent
> est quasi nul. Bilan : pour le prix d'un café (sur toute une année), tu sors tes données du
> périmètre d'entraînement.

### Pour aller plus loin (100 % local)

Pour que **rien** ne sorte de ta machine, on pourrait brancher un **modèle d'embeddings local**
(Ollama / open-source) à la place de Gemini. Le moteur est modulaire (`EMBEDDING_MODEL` dans
`rag/src/lib/config.ts` + `embedder.ts`), mais cette option **n'est pas livrée** aujourd'hui.

> Les conditions d'Anthropic et de Google **évoluent** : vérifie-les au moment où tu lis (Anthropic
> Privacy Center · *Gemini API Additional Terms of Service*).

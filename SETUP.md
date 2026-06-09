# SETUP — Installation détaillée & personnalisation

## 1. Prérequis

| Outil | Pourquoi | Installation |
|---|---|---|
| **Node.js ≥ 18** | Fait tourner le moteur RAG **et** tout le harnais (installateur + hooks sont en Node, multi-OS) | https://nodejs.org (macOS : `brew install node` · Windows : `winget install OpenJS.NodeJS`) |
| **git** | Versionnement + portabilité entre machines | https://git-scm.com |
| **Claude Code** | L'agent qui interroge le vault | https://claude.com/claude-code |
| **Clé Gemini** *(optionnelle)* | Embeddings — **uniquement si tu choisis l'embedder Gemini** (cf. note ci-dessous) | https://aistudio.google.com/apikey |

> 🧩 **La clé Gemini n'est plus obligatoire (D1, ADR 0007).** À l'install, tu choisis ton **moteur
> d'embedding** parmi 3 options, avec une **reco adaptée à ta machine** :
> **1. Tout sur ta machine** (« Gemma inside », `in-process`) — 🟢 privé + gratuit + hors-ligne,
> **rien à installer** (recommandé si ≥ 12 Go de RAM et pas un Mac Intel) ;
> **2. Clé d'API** — Gemini, OpenAI, ou l'endpoint de ton entreprise (⚠️ « gratuit ≠ privé » : le
> palier gratuit de Gemini peut exploiter tes données ; payer quelques centimes/mois rend privé) ;
> **3. Local via Ollama** (avancé). Seule l'option 2-Gemini demande la clé ci-dessus ; les options
> 1 et 3 écrivent `EMBEDDING_PROVIDER` dans `.env` (cf. `.env.example`) et **sautent l'étape clé**.

> **Multi-OS** : macOS, Linux et Windows (cmd ou PowerShell). L'installateur et les hooks
> sont en Node — pas besoin de bash, `jq` ni `sqlite3`. Node est le seul prérequis runtime.

> ⚙️ **Node via `nvm`/Homebrew ? C'est géré.** L'app Claude Desktop lance les hooks avec un PATH
> minimal où un `node` installé par `nvm` ou Homebrew serait introuvable (les hooks tomberaient
> alors **en silence** — l'auto-commit ne sauvegarderait plus tes notes). L'installeur génère un
> petit lanceur `scripts/run-node.*` qui retrouve `node` tout seul avant chaque hook, et **vérifie
> à l'install** qu'il y arrive — en **simulant le PATH minimal** de l'app, pour que la preuve soit
> réelle (sinon l'install échoue bruyamment). Tu n'as rien à configurer.
> Si l'install **recale** à ce smoke-test, c'est que ton `node` est dans un emplacement
> **inhabituel** (le lanceur couvre `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, asdf, nvm,
> volta, nodenv, fnm — et côté Windows nodejs, npm, Volta, `NVM_SYMLINK`). Solution : réinstalle
> `node` via l'une de ces voies (p. ex. `nvm` ou Homebrew), ou signale ton cas pour qu'on l'ajoute.

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
5. Colle-la quand `node installer.mjs` te la demande (ou dans `.env`, variable `GEMINI_API_KEY`).

C'est tout : le **palier gratuit est actif immédiatement**, aucune carte bancaire requise pour
démarrer.

> 💳 **Passer au payant** (recommandé pour un vault confidentiel — cf. §9) : dans AI Studio, ouvre
> la clé et **active la facturation** sur son projet (un compte de facturation Google Cloud, créé en
> une fois). Le coût reste de l'ordre de quelques centimes (cf. l'abaque en §9).
>
> ⚠️ Une clé API est un **secret** : ne la commite jamais, ne la partage pas. Elle vit dans `.env`,
> qui est gitignoré.

## 2. Installation

> **Un launcher, un cerveau — deux dossiers.** L'installeur s'exécute depuis le **launcher** (ce
> dépôt cloné) et **crée un dossier cerveau séparé** où il génère toute ta config. Le launcher reste
> **en lecture seule** et **réutilisable** (plusieurs cerveaux depuis un même launcher). Le nom du
> cerveau = `--name` (ou la question « Nom du cerveau ») ; son emplacement = `--dest` (défaut : ton
> home → `~/<nom>`). L'installeur **refuse si le dossier cible existe déjà** — c'est lui qui le crée.

```bash
cd second-brain-generator   # le launcher cloné
node installer.mjs          # interactif : demande nom, emplacement, ton nom, langue
```

Le script :
1. vérifie les prérequis (et s'arrête proprement s'il en manque) ;
2. te demande **nom du cerveau / emplacement / ton nom / langue** ;
3. te demande ta clé Gemini (ou plus tard) ;
4. **crée le dossier cerveau** (`<emplacement>/<nom>`, **refus s'il existe**) et y **copie les
   fichiers suivis du launcher**, puis génère tes fichiers personnalisés dedans : `CLAUDE.md` (qui
   **remplace l'amorce**), `.mcp.json`, `.claude/settings.json`, `.env` ;
5. **initialise un dépôt git dans le cerveau** (1er commit, **0 remote** — socle de l'auto-commit) ;
6. propose de **brancher des sources externes** (optionnel — cf. §6) ;
7. propose de **vider les notes d'exemple** (optionnel — garde-les pour le 1er test, vide-les ensuite pour ne pas polluer ton RAG) ;
8. installe les dépendances du moteur (`npm install`) dans le cerveau ;
9. indexe le vault d'exemple ;
10. **smoke-test MCP** : vérifie que Claude Code pourra parler au serveur `vault-rag` (cf. §8).

**Refus si le dossier existe.** Pour ne jamais écraser un cerveau, l'installeur **refuse** quand le
dossier cible existe déjà (sortie non-zéro, rien n'est touché). Pour recommencer : choisis un autre
`--name`/`--dest`, ou supprime le dossier. Le **launcher**, lui, reste réutilisable à l'infini.

### Installation manuelle (si tu préfères)
> L'installeur **crée le dossier cerveau** pour toi (copie + génération + `git init`). En manuel,
> crée d'abord un dossier vide à part, puis depuis le launcher :
1. Copie tout le contenu du launcher dans ton nouveau dossier cerveau (hors `.git`, `node_modules`,
   `DEVELOPING.md`).
2. Dans le cerveau : copie `.env.example` → `.env` et renseigne ta clé Gemini.
3. Copie chaque `*.template` vers son fichier final (`CLAUDE.md.template` → `CLAUDE.md`,
   `.mcp.json.template` → `.mcp.json`, `.claude/settings.json.template` → `.claude/settings.json`)
   puis remplace les placeholders `{{...}}` (notamment `{{PROJECT_ROOT}}` = chemin absolu du
   **cerveau** en slashes `/`, et `{{TMP_DIR}}` = dossier temp de l'OS).
4. `git init` dans le cerveau, puis `cd rag && npm install && npm run index`.

> En pratique, `node installer.mjs` fait tout ça pour toi, sur tous les OS — préfère-le.

### Installation non-interactive (flags) & démarrage piloté par Claude

L'installeur accepte un **mode non-interactif** : utile pour scripter l'install, et c'est ce qui
permet le **démarrage assisté par Claude** (cf. README « Option A »). Claude récolte les réponses
en chat, puis appelle **une seule commande** :

```bash
node installer.mjs --non-interactive --name "second-brain" --owner "Jane Doe" --lang "français"
# → crée ~/second-brain. Ajoute --dest <dossier-parent> pour choisir l'emplacement.
```

- **Flags** : `--name` (nom du dossier cerveau créé), `--dest` (dossier parent ; défaut = ton home),
  `--owner` (ton nom), `--lang`. Formes `--x valeur` **et** `--x=valeur`. Alias du
  mode : `--non-interactive`, `--yes`, `--no-input`.
- **Précédence** : flag CLI > variable d'environnement (`SB_PROJECT_NAME`, `SB_DEST`, `SB_OWNER_NAME`,
  `SB_LANGUAGE`) > valeur par défaut.
- **La clé Gemini n'est JAMAIS un argument** (sécurité : pas de secret en ligne de commande). En
  mode non-interactif elle est **toujours différée** → renseigne-la ensuite dans `<cerveau>/.env` ;
  l'index se construit au 1er démarrage du serveur MCP.
- **Aucun lien vers le launcher, par construction.** L'installeur **crée un dossier neuf**, y copie
  les fichiers suivis (jamais le `.git` du launcher), puis y fait `git init` + 1er commit. Le cerveau
  n'a donc **aucun remote** — rien à détacher, aucune chirurgie git. Le launcher n'est jamais modifié.
- **Aucune fuite possible : le push est opt-in.** Le hook auto-commit **ne pousse que si tu as
  explicitement activé** `git config secondbrain.autopush true` (posé par l'étape « dépôt distant »
  ci-dessous). Par défaut **off** → même un remote qui traînerait ne reçoit jamais tes notes.
- **Dépôt distant : décidé après coup, jamais imposé.** L'install ne crée aucun remote. Tu peux en
  brancher un quand tu veux (cf. §7) — en pensant à activer `secondbrain.autopush`. En démarrage
  assisté, Claude te **proposera** d'en créer un (backup + multi-machine) — répondre non est sans
  risque.

> ⚠️ En mode non-interactif, les étapes **connecteurs** (§6) et **purge des notes d'exemple** sont
> sautées (elles restent interactives) — tu les feras à la main ou en relançant l'installeur **vers
> un nouveau cerveau**.

## 3. Premier test

> ⚠️ **Renseigne ta clé Gemini dans `.env` AVANT ce premier démarrage.** Le serveur MCP `vault-rag`
> est lancé une fois à l'ouverture de Claude Code : s'il démarre sans clé, le RAG ne pourra pas
> répondre. (Au démarrage, le hook de statut **te prévient** si la clé manque.)

```bash
cd <emplacement>/<nom>   # le dossier cerveau créé par l'installeur (ex. ~/second-brain)
claude
```
Puis : *« Dans la boîte qui aide les gens à arrêter de se surmener, quel salarié a été mis à
l'honneur pour en avoir fichu le moins de tous — et avec quel pourcentage ? »*
Claude doit répondre **Pélagie de Mollecuisse, lauréate du Trophée de l'Inertie avec un TRF de
98,7 %**, en citant `[[decisions/2025-11-20-trophee-de-l-inertie]]`. C'est un **canari** à trois
étages : le sujet est **inventé** (l'entreprise « Flemmr ») → Claude n'a pas de réponse en mémoire,
il est *forcé* d'interroger le vault (**routage**) ; le fait est introuvable ailleurs (**provenance**
— pas Internet ; s'il dit ne pas connaître l'entreprise, le RAG est down) ; et la question ne partage
**aucun mot** avec les notes (tout est *décrit* par synonymes) — donc retrouver « Mollecuisse »
prouve aussi la recherche **par le sens**, pas un grep.

> 🔎 **Verdict déterministe (recommandé après avoir collé la clé).** Plutôt que de juger la réponse
> à l'œil, lance depuis le dossier cerveau :
> ```bash
> node scripts/verify-rag.mjs
> ```
> Il (ré)indexe et **assert** que la démo ressort « Mollecuisse ». `exit 0` = RAG OK ; `exit 1` = échec
> explicite (pas de faux vert).

> **Clé ajoutée après coup ?** Si tu as lancé Claude Code sans la clé, colle-la dans `.env` puis
> **repose ta question** : le serveur relit `.env` à la volée et la prend en compte — pas besoin de
> reconnecter. Si jamais ça résiste, reconnecte le serveur MCP avec `/mcp` (dans Claude Code) ou
> relance Claude Code.

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

Le générateur ne fournit que le moteur RAG. Pour interroger aussi tes autres sources
(Drive, Notion, Slack, Calendar…), trois chemins — choisis selon ton confort.

### Menu — quel connecteur pour quel besoin

Des **idées** pour démarrer (à adapter à tes outils). « Natif claude.ai » = à activer côté
compte (Settings → Connectors), rien à écrire dans `.mcp.json` ; « MCP communautaire » = un
serveur que tu branches dans `.mcp.json`. Catalogue complet et détaillé : [CONNECTORS.md](CONNECTORS.md).

| Besoin | Connecteur recommandé | Comment le brancher |
|---|---|---|
| **Notes / wikis** | Notion | MCP communautaire `@notionhq/notion-mcp-server`, ou connecteur **natif** claude.ai |
| **Mail** | Gmail | Connecteur **natif** claude.ai |
| **Agenda** | Google Calendar | Connecteur **natif** claude.ai |
| **Fichiers / documents** | Google Drive | MCP communautaire (`@modelcontextprotocol/server-gdrive`, `@isaacphi/mcp-gdrive`…), ou **natif** claude.ai |
| **Chat d'équipe** | Slack | Connecteur **natif** claude.ai |
| **Transcripts de réunion** (Meet) | **Google Calendar + Google Drive** | Pas un produit à part : le lien d'enregistrement/transcription est souvent dans l'**invitation** (Calendar) et le doc de transcription atterrit sur le **Drive**. Branche les deux. |

> 💡 Les transcripts de réunion ne sont **pas** un connecteur dédié : ce sont des documents
> produits par Meet/Gemini. On les attrape via le **Calendar** (lien dans l'événement) et le
> **Drive** (le doc de transcription). Pas besoin d'un MCP de meeting-bot tiers pour démarrer.

### (a) Le wizard de l'installeur — *recommandé*

Pendant `node installer.mjs`, l'étape **5/9 « Brancher des sources externes »** te propose un
petit catalogue. Pour chaque connecteur **MCP** que tu acceptes, le script fusionne tout seul
son bloc serveur dans `.mcp.json` **et** ses permissions dans `.claude/settings.json`, puis
t'affiche le rappel credentials à renseigner. C'est **idempotent** : relancer l'installeur ne
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

## 7. Sauvegarde & portabilité multi-machines (dépôt distant)

Configure un remote git privé, **puis active le push** (sans ça, l'auto-commit reste local — c'est
le garde-fou opt-in qui empêche toute fuite par défaut) :
```bash
git remote add origin <url-de-ton-repo-privé>
git push -u origin main
git config secondbrain.autopush true   # ← active le push automatique du hook
```
Le hook auto-commit pushera ensuite à chaque modif. Sur l'autre machine : `git clone <ton-repo-privé>`
puis, **dans le dossier cloné**, `cd rag && npm install` et re-renseigne la clé dans `.env` (l'index
se reconstruit au 1er démarrage). *(Pas besoin de l'installeur ici : il sert à **générer** un cerveau,
pas à ré-hydrater un cerveau déjà existant.)* En cours de session, le skill `/sync` récupère les
changements de l'autre machine.

> ⚠️ Ne commite **jamais** `.env` (gitignoré). Sur une nouvelle machine, re-renseigne la clé.

## 8. Troubleshooting

| Symptôme | Cause probable | Remède |
|---|---|---|
| `npm install` échoue dans `rag/` | Node trop ancien | Node ≥ 18 (`node -v`) |
| `npm install` échoue sur **`better-sqlite3`** (Windows) | Module natif sans prebuild pour ta version de Node | Utilise une **version LTS** de Node (prebuilds dispos), ou installe les outils de compilation : `npm install --global windows-build-tools` (ancien) ou les *Visual Studio Build Tools* (« Desktop development with C++ »). Puis `cd rag && npm install`. |
| Recherches vides | Index pas construit / pas de clé | `cd rag && npm run index` après avoir mis la clé |
| `RESOURCE_EXHAUSTED` / 429 | Quota Gemini du jour atteint | reprise auto au reset (minuit Pacifique), ou monte `MAX_EMBED_REQUESTS_PER_DAY` |
| Statut RAG « indisponible » au démarrage | Moteur RAG pas encore installé / DB en cours d'écriture | `cd rag && npm install` ; le statut se rétablit une fois l'index construit |
| Le serveur MCP n'apparaît pas | `.mcp.json` absent / mauvais chemin | relance `node installer.mjs`, accepte le serveur dans Claude Code |
| **Smoke-test MCP ❌** en fin d'installation (« connexion MCP KO ») | `rag/` pas installé, `.mcp.json` mal généré, ou `npx`/`tsx` indisponible | `cd rag && npm install` puis relance `node installer.mjs` ; vérifie que `.mcp.json` pointe `npx tsx rag/src/index.ts` avec le bon `cwd`. Test manuel : `npx tsx rag/src/index.ts` doit démarrer sans crash (la clé Gemini n'est **pas** requise pour ce test). |

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

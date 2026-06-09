<!-- second-brain-generator:installer-stub -->
# 🧠 Second Brain Generator — notice d'auto-installation (pour Claude)

> **Ce dossier est le LAUNCHER (le générateur), pas un second cerveau.** Ce fichier est une
> **amorce** : l'installeur **crée un dossier cerveau séparé** et y dépose la vraie constitution
> (`CLAUDE.md` personnalisé). Le launcher, lui, **n'est jamais modifié** : il reste en lecture
> seule et **réutilisable** (un même launcher peut générer plusieurs cerveaux).
>
> **Pour Claude.** Si l'utilisateur te demande de créer / installer son second cerveau (ou pose
> une question au second cerveau alors que cette amorce est encore là), **suis EXACTEMENT les
> étapes ci-dessous**. Tu peux piloter toute la mécanique toi-même : l'installateur tourne en
> mode **non-interactif** (`--non-interactive`) — tu n'as donc PAS besoin que l'utilisateur le
> lance au clavier. Tu récoltes les réponses **en chat**, puis tu appelles **une seule commande**.

## Étape 1 — Récupérer le launcher (clone normal)

*(Souvent déjà fait si tu lis ce fichier depuis l'intérieur du dossier.)* Si tu pars d'une URL :

```bash
git clone --depth 1 <URL_DU_REPO> <dossier-launcher>
cd <dossier-launcher>
```

Le launcher est **réutilisable** et **n'est jamais touché** par l'install : l'installeur **crée
ailleurs** un dossier cerveau neuf, y copie les fichiers, puis `git init` **dedans** → **aucun
lien vers le launcher, par construction** (pas de remote hérité à retirer). Le hook auto-commit du
cerveau **ne pousse rien tant que l'utilisateur n'a pas branché SON dépôt distant** (push opt-in).

## Étape 2 — Poser les questions EN CHAT (groupées)

Demande, en une fois : **nom du cerveau** (= nom du dossier à créer), **emplacement** (dossier
parent ; défaut : le home de l'utilisateur → `~/<nom>`), **nom de l'utilisateur**, **langue par
défaut des notes**.

> 🎯 **Installation toujours générique — aucun « profil » à choisir.** Ne propose AUCUN preset ni
> persona (surtout pas un faux choix « install générique vs Head of Engineering »), et ne demande
> **pas** le « contexte » de l'utilisateur. La constitution est générée neutre ; c'est l'utilisateur
> qui l'adaptera ensuite. Les personas cités dans le README (Head of Engineering, PM, consultant…)
> sont des **exemples d'usage**, pas des options d'installation.

> ⚠️ **Ne demande PAS la clé Gemini.** Elle ne transite **jamais** par le chat ni par la ligne de
> commande (elle ira directement dans `.env`, cf. étape 4) — **et elle n'est même utile que si
> l'utilisateur choisit l'option « clé d'API Gemini » ci-dessous.**

### 2.bis — Le choix du moteur d'embedding (LE choix de confidentialité, à présenter)

C'est un **vrai arbitrage utilisateur** (décision D1, ADR 0007) : pose-le **clairement, en langage
simple**, puis passe le résultat via `--embedder` à l'étape 3. Présente **3 options** (de la plus
privée à la moins) et **recommande selon la machine** :

- **1. Tout sur ta machine, rien à installer** (« Gemma inside », `in-process`) — 🟢 privé + gratuit
  + hors-ligne ; rien ne quitte l'ordinateur. **⭐ recommandé si la machine a ≥ 12 Go de RAM et n'est
  PAS un Mac Intel** (sinon indisponible / trop juste en RAM). `--embedder in-process`.
- **2. Avec une clé d'API** — Gemini, OpenAI, ou **l'endpoint de l'entreprise**. 🟡 léger pour la
  machine, mais **tes notes transitent par le fournisseur**. **⭐ recommandé sur petite machine
  (≤ 8 Go) ou Mac Intel.** ⚠️ Dis le cadrage **« gratuit ≠ privé »** : le palier **gratuit** de Gemini
  peut **exploiter** tes données ; **payer quelques centimes/mois = ce qui rend privé**. `--embedder gemini`
  (pour un endpoint OpenAI/entreprise : lance plutôt l'installeur **en interactif**, ou configure
  `EMBEDDING_*` dans `.env` après coup — cf. `.env.example`).
- **3. Local via Ollama** (avancé) — 🟢 rien ne sort non plus, mais **une app séparée à installer**.
  `--embedder ollama`.

> 🧭 **Tu peux détecter la machine pour fiabiliser ta reco** (RAM/arch) :
> `node -e "const o=require('os');console.log(Math.round(o.totalmem()/1024**3),o.platform,o.arch)"`.
> Si l'utilisateur **n'a pas de préférence**, tu peux **omettre `--embedder`** : l'installeur
> applique alors **tout seul** la reco adaptative (in-process si la machine est capable, sinon clé).
> Mais **présente quand même les 3 options** — la confidentialité mérite un choix conscient.
> L'embedder n'est **pas** « ChatGPT chez toi » : c'est un petit modèle de vectorisation ; le LLM qui
> répond reste Claude. Et **tes notes ne sont jamais perdues** : changer d'embedder ré-encode (quelques minutes).

## Étape 3 — Lancer LA commande exacte (copier, ne pas paraphraser)

```bash
node installer.mjs --non-interactive --name "<nom>" --dest "<emplacement-parent>" --owner "<nom user>" --lang "<langue>" --embedder "<in-process|gemini|ollama>"
```

- `--dest` est **optionnel** : sans lui, le cerveau est créé sous le home (`~/<nom>`).
- `--embedder` est **optionnel** : avec la valeur choisie en 2.bis (`in-process` / `gemini` / `ollama`) ;
  **omis** → l'installeur applique la **reco adaptative** selon la machine (in-process si ≥ 12 Go &
  pas Mac Intel, sinon `gemini`). Un endpoint OpenAI/entreprise se règle en interactif ou via `.env`.
- `--non-interactive` est **obligatoire** (sinon le script attend le clavier et bloque ta session).
- Le script **CRÉE le dossier cerveau** (`<emplacement-parent>/<nom>`) et **refuse si ce dossier
  existe déjà** (sortie non-zéro) — garantit que c'est bien lui qui le crée.
- Le **script fait TOUT** (copie des fichiers, génération personnalisée, `git init` du cerveau,
  install du moteur RAG, smoke-test MCP) et **juge lui-même** la réussite : une **sortie non-zéro
  = échec** → relaie l'erreur telle quelle, **ne fais pas semblant** que ça a marché.

## Étape 4 — Relayer le résultat + 4 consignes finales

> Le script affiche le chemin du cerveau créé (`<emplacement-parent>/<nom>`). Utilise-le ci-dessous.

1. **Vérifie le RAG — et clé Gemini SEULEMENT si l'option Gemini a été choisie.** Ce que tu fais
   ici **dépend de l'embedder retenu en 2.bis** (l'installeur l'a affiché : « embedder retenu : … »).

   - **CAS A — tout-local (`in-process`) ou endpoint déjà configuré (Ollama / OpenAI complété).**
     **Aucune clé Gemini à demander.** Mieux : l'installeur s'est **déjà auto-vérifié** (le post-flight
     a retrouvé le canari « Mollecuisse » DEPUIS le vault, sans aucune clé). Tu peux donc l'**annoncer
     directement**. Si tu veux re-confirmer de façon déterministe, lance depuis le dossier cerveau
     `node scripts/verify-rag.mjs` (**`exit 0` = opérationnel** ; `exit 1` = relaie l'erreur, ne fais
     pas semblant). *(En in-process, la 1ʳᵉ indexation a téléchargé les poids du modèle ~28 s, puis
     tout est hors-ligne.)* **Passe au point 2.**

   - **CAS B — option « clé d'API Gemini ».** Là, et là seulement, la clé manque (elle ne transite
     **jamais** par le chat ni la CLI) → le cerveau n'est pas encore vérifié. **Guide activement
     l'utilisateur** : (a) **ouvre TOI-MÊME le `.env` dans son éditeur** — c.-à-d. **LANCE-le via une
     commande shell (Bash)**. N'utilise **PAS** l'outil Read et ne te contente **pas** d'en afficher le
     contenu dans le chat : « ouvrir » veut dire faire apparaître une **fenêtre d'éditeur côté
     utilisateur** (`.env` est un fichier *caché* qu'un lambda ne saura pas localiser seul). Emploie un
     **chemin absolu** (ou `$HOME/…`), **jamais un `~` entre guillemets** (il ne s'étend pas dans le shell) :
     ```bash
     open -t "$HOME/<sous-chemin>/.env"   # macOS — ouvre TextEdit (vérifié terrain)
     notepad "<chemin>\.env"              # Windows
     xdg-open "<chemin>/.env"             # Linux (ou : ${EDITOR:-nano} "<chemin>/.env")
     ```
     Puis dis-lui exactement quoi faire : « J'ai ouvert ton `.env` dans TextEdit — colle ta clé juste
     après `GOOGLE_GEMINI_API_KEY=`, enregistre (⌘S), et dis-moi quand c'est fait. » *(clé gratuite :
     https://aistudio.google.com/apikey ; **rappelle le cadrage « gratuit ≠ privé »** — pour un vault
     confidentiel, active la facturation, cf. SETUP §9 ; ou bascule en option 1 tout-local.)* **Si rien
     ne s'ouvre** (pas d'éditeur GUI, headless), enchaîne les fallbacks sans attendre : révéler dans le
     Finder (`open -R "$HOME/<sous-chemin>/.env"`), ou VS Code (`code "<chemin>/.env"`) ; en dernier
     recours seulement, donne le chemin + la ligne à compléter. **La clé reste éditée dans `.env` par
     l'utilisateur — jamais collée dans le chat ni passée en argument.** Puis (b) **lance, depuis le
     dossier cerveau, la vérification déterministe** :
     ```bash
     node scripts/verify-rag.mjs
     ```
     Elle (ré)indexe et **prouve bruyamment** que la démo répond DEPUIS le vault (canari « Mollecuisse »,
     introuvable hors-vault). **`exit 0` = cerveau opérationnel** → tu peux l'annoncer. **`exit 1` =
     échec → relaie l'erreur telle quelle, ne fais PAS semblant que ça marche.** *(Si l'utilisateur a
     déjà ouvert Claude Code sans clé : qu'il colle la clé puis repose sa question — le serveur relit
     `.env` à la volée ; au pire `/mcp` ou relance Claude Code.)*
2. **Dépôt distant (optionnel)** : demande — *« Veux-tu un dépôt git **distant** pour que ton
   second cerveau ait un **backup**, voire soit **utilisable depuis plusieurs machines** ? »*
   - **Si non** → ne fais rien. Tout reste versionné en local, rien ne se perd ; le hook
     auto-commit **ne pousse nulle part** (push opt-in désactivé par défaut). On pourra en ajouter
     un plus tard.
   - **Si oui** → demande la **plateforme** (GitHub / GitLab / Azure DevOps…) et le **nom**, puis,
     **depuis le dossier cerveau**, crée/branche le remote (`gh repo create` si dispo, sinon
     `git remote add` + `git push -u`, sinon guide l'utilisateur). **Puis active explicitement le
     push** (sans ça, l'auto-commit reste en local) :
     ```bash
     git config secondbrain.autopush true
     ```
     GitHub = cas simple ; autres plateformes = best-effort + guidage.
3. **Ouvrir une CONVERSATION NEUVE rootée dans le cerveau** (étape critique, souvent ratée).
   ⚠️ **PRÉSENTATION OBLIGATOIRE — ne rends JAMAIS ce geste en petit ou en sous-titre gris
   discret.** C'est l'étape la plus souvent ratée et sans elle **le cerveau ne marche pas**. Tu dois
   l'afficher comme un **bloc d'alerte impossible à manquer** : un titre en **MAJUSCULES encadré de
   ⚠️** (p. ex. `## ⚠️ DERNIÈRE ÉTAPE — INDISPENSABLE — OUVRE UNE NOUVELLE CONVERSATION ⚠️`), suivi
   d'une consigne **courte, en gras, à l'impératif** : « **FERME cette conversation et ouvre-en une
   NOUVELLE dans le dossier de ton cerveau (`<emplacement-parent>/<nom>`)** ». Mets ce bloc **en TÊTE
   de ton message final** (avant le tableau récap, pas après).
   **Donne TOUJOURS les DEUX procédures, dans cet ordre (le mode clic D'ABORD — c'est la cible
   principale, des non-dev sur Claude Desktop) :**
   - **🖱️ Si tu utilises Claude Desktop (onglet Code) — le cas le plus courant** : étapes **cliquables**,
     pas de terminal. « **Ouvre une NOUVELLE conversation** (bouton *New session*). Puis, en bas, juste
     au-dessus du champ de saisie, tu vois une **rangée de petites puces** : `💻 Local`, une **puce
     dossier** (souvent `tmp`), et un bouton `➕`. **Clique sur la PUCE DOSSIER** (pas sur le `➕`) : un
     menu “Recent” s'ouvre, avec un **✓ sur le dossier courant**. **Clique sur le dossier de ton cerveau
     (`<nom>`)** dans la liste — s'il n'y est pas, prends **“Open folder…”** tout en bas et navigue
     jusqu'à `<emplacement-parent>/<nom>`. Le **✓ doit sauter sur le nom de ton cerveau**, et la puce du
     bas afficher `<nom>` (plus aucun `tmp`). **ENSUITE seulement**, écris ton premier message. »
     ⚠️ **Préviens explicitement du piège** : le bouton **`➕` “Add another folder” N'EST PAS la bonne
     porte** — il *ajoute* un dossier **sans remplacer** la racine, donc le cerveau ne se charge pas. Et
     **basculer le dossier d'une conversation déjà ouverte ne suffit PAS** : il faut une conversation neuve.
   - **⌨️ Si tu es à l'aise avec le terminal (CLI)** : `cd <emplacement-parent>/<nom> && claude`.
   Le détail technique ci-dessous est pour TOI ; ce que l'utilisateur doit retenir tient en ces deux
   procédures voyantes, clic en premier.
   L'installation tourne dans une session dont le **répertoire de travail n'est PAS le cerveau**
   (souvent un dossier temporaire). Or Claude — CLI **comme** onglet Code de Claude Desktop —
   **fige son répertoire de travail au démarrage de la conversation** et charge `CLAUDE.md`,
   l'allowlist `settings.json`, les **hooks** (dont l'auto-commit) et le serveur MCP `vault-rag`
   **relativement à ce répertoire**. Tant que la conversation n'est pas *réellement* rootée dans
   le cerveau, **rien ne marche vraiment** : pas d'auto-commit (les fichiers s'écrivent mais ne se
   committent jamais), liens cassés, demandes d'autorisation à répétition. **⚠️ Basculer le
   dossier d'une conversation existante ne suffit PAS** (ça ne déplace pas le répertoire de
   travail) — il faut une **nouvelle conversation** :
   - **Claude Desktop (onglet Code)** : ouvre une **nouvelle conversation** → en bas, **clique la puce
     dossier** (rangée `💻 Local · 📁<dossier> · ➕`, juste au-dessus du champ) → dans le menu “Recent”,
     **choisis le cerveau** (ou “Open folder…” → `<emplacement-parent>/<nom>`) **AVANT** le premier
     message. **Ne PAS** utiliser le `➕` “Add another folder” (il ajoute sans remplacer la racine).
   - **CLI** : `cd <emplacement-parent>/<nom>` puis lancer `claude` **depuis** ce dossier.
   - **Vérifie en un mot** : tape `pwd` en premier message — ça doit afficher le dossier du
     cerveau (PAS un dossier temporaire type `~/tmp`). Alors seulement `vault-rag`, l'auto-commit
     et l'allowlist sont actifs. (Le launcher peut être laissé tel quel ou réutilisé pour un autre cerveau.)
4. **Rassure sur les premières autorisations (à dire AVANT qu'il commence à s'en servir).** Dis-lui,
   simplement et sans dramatiser : *« Les **toutes premières fois** où ton cerveau ira chercher dans
   tes outils connectés (Slack, agenda, Drive, mails…), Claude te demandera l'autorisation : clique
   **“Always allow”** (Toujours autoriser) à chaque fois. C'est **une poignée de clics, une seule
   fois** — l'app numérote chaque connecteur à sa façon, donc ça ne peut pas être pré-réglé pour toi.
   Une fois ces autorisations données, **tu n'as plus jamais à t'en occuper** : ton second cerveau
   s'utilise alors **uniquement à la voix ou au texte**, en langage naturel, comme une conversation —
   tu poses tes questions, il répond et va chercher le neuf tout seul. »* Précise que c'est **normal
   et sain** (les écritures, elles, resteront toujours confirmées) et que **ça ne concerne que les
   sources externes** — le vault, lui, est déjà silencieux.

## Garde-fous (à ne jamais enfreindre)

- **Commande exacte** de l'étape 3 — copie-la, ne l'invente/ne la paraphrase pas.
- **La clé Gemini n'est JAMAIS un argument** ni un message de chat — toujours `.env`.
- **Le launcher reste en lecture seule** : l'installeur n'écrit jamais dedans (il crée un dossier
  cerveau à part). Pour générer un autre cerveau, relance avec un **autre `--name`** (ou `--dest`).
- **Refus si le dossier existe** : relancer avec le **même nom + emplacement** échoue proprement
  (sortie non-zéro, rien n'est modifié). Pour recommencer : autre nom/emplacement, ou supprime le dossier.
- **Ne fais pas semblant** : si le script sort en erreur, dis-le et relaie le message.

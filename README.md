# Second Brain Generator

**Retrouve n'importe quelle décision ou info de ton travail en quelques secondes — en posant la question en langage naturel, avec les sources à l'appui.**

> 🧑 *« On en est où sur le projet facturation — qui porte quoi, et qu'est-ce qui a été décidé ? »*
>
> 🧠 *« Au point d'équipe du 15 janvier : la base de données a été tranchée (PostgreSQL plutôt que
> MongoDB), et Jane Doe — Tech Lead plateforme — pousse pour anticiper la dette technique dès le
> sprint 1.*
> *→ décision du 10 janvier · → point d'équipe du 15 janvier »*

> 🧑 *« Que veut dire "MEDDIC", ce truc que l'équipe sales répète en boucle dans leurs réunions ? »*
>
> 🧠 *« MEDDIC = la méthode de qualification d'opportunités adoptée par les sales : Metrics, Economic
> buyer, Decision criteria, Decision process, Identify pain, Champion. Introduite par John Smith (VP
> Sales) au kickoff commercial du 12 février pour fiabiliser le forecast.*
> *→ kickoff commercial du 12 février · → playbook sales »*

Au lieu d'aller fouiller toi-même dans Slack, tes mails, Google Drive et tes comptes rendus de
réunion, tu demandes — et ton **second cerveau** te répond tout de suite, en citant d'où vient
l'info. Dans la langue de ton choix : il **retrouve par le sens**, donc tu peux questionner en
français des notes rédigées en anglais (ou l'inverse).

> ⚠️ Ce repo n'est **pas** un cerveau tout fait : c'est un **générateur** qui te **produit** une
> **graine** (un squelette) que tu fais pousser pour t'en construire **un à toi**. On explique
> pourquoi plus bas — et c'est précisément ce qui le rend utile.

---

## C'est quoi, un « second cerveau » ?

Une **mémoire externe à toi** : tes notes, tes décisions et tes échanges de travail réunis en un
seul endroit, que tu interroges en langage naturel et qui te répond **immédiatement, sources à
l'appui**.

Trois propriétés le définissent :

- **Il est à toi.** Tout vit dans un dossier de notes (un *vault*) versionné dans **ton repo git
  privé**. Tu n'es pas locataire d'un service en ligne : tu es propriétaire de tes données.
- **Il se souvient.** Chaque réponse, chaque info nouvelle est persistée (commit git local). Ton
  cerveau accumule une trace exploitable — et peut **te suivre d'une machine à l'autre** dès que tu
  lui branches un dépôt distant (optionnel).
- **Il cite ses sources.** Pas de réponse en l'air : tu remontes toujours à la note ou au message
  d'origine, avec sa date.

## C'est pour qui ?

Pour toute personne qui **croule sous l'information dispersée** et veut la retrouver sans effort —
quel que soit son niveau technique :

- **Managers, Head of Engineering** — suivre ses équipes, ses 1-1, ce qu'on attend de soi.
- **Product managers, product designers** — garder le fil des décisions produit, des arbitrages,
  du « pourquoi on a tranché comme ça ».
- **Consultants, chercheurs, freelances** — consolider un domaine métier, ne rien perdre d'un
  contexte client.

> ⚠️ L'**usage au quotidien ne demande aucune compétence technique** : tu poses des questions, tu
> lis des réponses. Seule l'**installation** (une fois, ~15 min) suppose d'avoir git, Node et une
> clé API — on te guide pas à pas, et un installateur vérifie tout pour toi.

## En quoi c'est différent de ChatGPT, Claude, Notion AI ou de la recherche Slack ?

| | Ce qui leur manque | Ce que fait ton second cerveau |
|---|---|---|
| **ChatGPT / Claude « nu »** | Ne connaît que ce que tu recolles à chaque conversation. Oublie tout ensuite. | Une **mémoire persistante**, qui grossit à chaque question. |
| **Notion AI, recherche Slack…** | Cloisonné à **un seul outil**. | **Transversal** : Slack + Drive + mails + transcripts + tes notes, au même endroit. |
| **N'importe quel SaaS** | Tes données chez un tiers, format fermé. | **Chez toi**, en Markdown, dans **ton** repo git privé. |

Et surtout : ce n'est pas **un** produit unique pour tout le monde. C'est une **méthode** pour te
fabriquer **le tien**, calé sur *tes* usages (voir « *Pourquoi un générateur et pas un produit fini ?* »).

## Ce que ça change pour toi, concrètement

- **Réponse immédiate.** En quelques secondes, pas le temps d'aller faire un café.
- **Toujours sourcé.** Tu vois d'où vient chaque info, et si elle est récente ou pas.
- **Rien ne se perd.** Chaque modif est **commitée automatiquement en local**. Et si tu branches un
  **dépôt distant** (optionnel, ~2 min — push *opt-in*), tout est aussi sauvegardé **hors de ta
  machine** : laptop perdu ou volé, tu reprends ailleurs où tu en étais.
- **Zéro effort de ta part.** Tu n'as jamais à lancer une synchro, à déclencher quoi que ce soit
  dans le bon ordre, ni même à savoir que git existe : **tu n'as à savoir ni comment c'est fait
  dedans, ni comment c'est rangé.** Tu poses ta question, c'est tout.

> 💡 Pour les curieux : ta réponse arrive tout de suite à partir de ce que ton cerveau a déjà en
> mémoire, et se met à jour discrètement en arrière-plan s'il trouve du nouveau — un peu comme une
> page web qui s'affiche instantanément puis se rafraîchit toute seule. Le détail est en
> [« Sous le capot »](#sous-le-capot).

---

## Prêt à essayer ?

### De quoi tu as besoin

- **[Claude Code](https://claude.com/claude-code)**, **[Node.js](https://nodejs.org) ≥ 18** et
  **git**. *(L'installateur vérifie tout — s'il en manque un, il te le dit proprement.)*
- **Une [clé API Gemini](https://aistudio.google.com/apikey)** (Google) pour la recherche. Le
  **palier gratuit suffit pour démarrer** — ~2 min, 3 clics, sans toucher à la console Google
  Cloud ni sortir de carte bancaire. *(Pas à pas : [SETUP §1.1](SETUP.md).)*
- **Tes sources d'information** (Slack, Drive, mails, Notion, transcripts…), à brancher selon
  *tes* outils. Optionnel au début. *(cf. [SETUP §6](SETUP.md))*

> 💶 **Combien ça coûte ?** Quasi rien. Indexer **~1 000 notes ≈ 0,10 €**, **~10 000 notes ≈ 1 €**,
> les questions sont négligeables. Le gratuit suffit pour démarrer ; le payant (très bon marché)
> sert pour les gros volumes — et protège tes données (voir ci-dessous). *Vérifie le tarif courant,
> il évolue.*

### Comment ça s'installe — le modèle en un coup d'œil

**Un launcher, un cerveau — deux dossiers.** Tu récupères d'abord le **launcher** (ce générateur).
L'installateur **crée ensuite un dossier cerveau séparé** et y dépose tout. Le launcher n'est
**jamais modifié** : il reste en **lecture seule** et **réutilisable** — un même launcher peut
générer plusieurs cerveaux.

```
1.  Récupérer le launcher (ce générateur)
        │   git clone <URL_DU_REPO>
        ▼
    📁 second-brain-generator/   ← le LAUNCHER : lecture seule, réutilisable, jamais modifié
        │
        │   node bootstrap.mjs --name mon-cerveau     (il CRÉE un dossier AILLEURS)
        ▼
    📁 ~/mon-cerveau/            ← TON second cerveau : dossier NEUF créé par le bootstrap
        ├── CLAUDE.md          (ta constitution — générée à partir de l'amorce)
        ├── vault/             (tes notes)
        ├── rag/               (le moteur de recherche)
        ├── .git/              (dépôt NEUF, 0 remote — aucun lien vers le launcher)
        └── .mcp.json, .env …  (config générée)
        │
        │   cd ~/mon-cerveau  puis  claude   (ouvre Claude Code DANS le cerveau)
        ▼
    → tu poses tes questions
```

Pour lever les doutes qu'on a tous au début :

- **Le launcher n'est pas ton cerveau** : c'est l'outil qui le **produit**. Garde-le pour en
  générer d'autres, ou jette-le — ton cerveau vit dans **son propre dossier**.
- **Aucun lien vers le launcher**, par construction : le bootstrap **copie** les fichiers dans un
  dossier neuf puis y fait `git init` (0 remote). Rien à « détacher » toi-même.
- **`--name` = le nom du dossier cerveau créé** ; son emplacement se choisit avec `--dest` (par
  défaut, ton home → `~/<nom>`). Le bootstrap **refuse si le dossier existe déjà**.
- Le cerveau naît **sans dépôt distant** : pour un backup / multi-machine, tu branches TON dépôt
  plus tard (push opt-in, cf. geste 2 ci-dessous).

### Installation — Claude installe tout pour toi

Tu utilises Claude Code et tu as l'URL du générateur ? Laisse **Claude tout installer pour toi** —
c'est le seul geste à faire. Ouvre Claude Code (même hors du repo) et donne-lui cette
instruction — adapte le nom et l'URL :

> *« Installe-moi un second cerveau nommé `mon-cerveau` à partir de ce générateur : `<URL_DU_REPO>`. »*

> 📍 **Depuis quel dossier ?** Peu importe — ouvre Claude Code dans n'importe quel dossier de
> travail (un sous-dossier `second-brain-generator/`, jetable, y sera cloné). **Le dossier courant
> ne décide pas où va ton cerveau** : par défaut il est créé dans ton home (`~/<nom>`). Pour un
> autre emplacement, précise-le dans l'instruction (« …dans `~/cerveaux` ») — pas besoin de t'y
> placer toi-même.

C'est tout : pas besoin de préciser « ne touche pas au launcher » ni « ne demande pas ma clé » —
**le générateur enforce lui-même la sûreté** (le launcher reste en lecture seule, le cerveau est un
dossier neuf sans lien distant, clé jamais demandée en chat). Claude clone le **launcher**, te pose
**en chat** les quelques questions (nom du cerveau, emplacement, ton nom, langue), puis lance
l'installateur en mode non-interactif — qui **crée le dossier cerveau** et fait **tout** (copie,
fichiers générés, `git init`, moteur RAG, vérification). Il te reste **3 gestes** :

1. **Coller ta clé Gemini** dans `<cerveau>/.env` (ligne `GOOGLE_GEMINI_API_KEY=`) — jamais dans le chat.
   > 💡 **Idéalement avant le 1er démarrage** (geste 3). Si tu as déjà ouvert Claude Code sans la
   > clé : colle-la dans `.env`, puis **repose simplement ta question** — le serveur RAG relit
   > `.env` tout seul à la requête suivante. Si jamais ça résiste, reconnecte le serveur MCP
   > (commande `/mcp` dans Claude Code) ou relance Claude Code.
2. **Dépôt distant ?** Claude te demandera si tu veux un dépôt git **distant** (backup +
   multi-machine). **Dire non est sans risque** : tout reste versionné en local, rien ne se perd,
   et l'auto-commit **ne pousse nulle part** (push opt-in désactivé par défaut). Tu pourras en
   ajouter un plus tard.
3. **Rouvrir Claude Code** dans le **dossier cerveau créé** (ex. `~/mon-cerveau`) — active le moteur
   de recherche. (Le launcher, lui, peut être réutilisé pour un autre cerveau ou supprimé.)

Une fois installé, essaie par exemple :

> *« Quelle base de données a-t-on choisie pour la facturation, et pourquoi ? »*

Claude cherche dans ton vault et répond avec les liens vers les notes sources.

> 🧪 **Les notes d'exemple.** Le générateur est livré avec quelques **fausses notes de démo** pour que
> tu voies tout de suite à quoi ça ressemble, dès la première question. En fin d'installation, le
> bootstrap te **propose de les effacer** d'un coup — histoire de repartir d'un vault propre, sans
> polluer ton second cerveau avec ces données factices.

### 💾 Sauvegarder ton cerveau & l'utiliser sur plusieurs machines (optionnel)

Par défaut, ton cerveau est **versionné en local** (chaque modif est commitée automatiquement) mais
**reste sur ta machine** — rien ne part ailleurs. Pour avoir un **backup hors-machine** et/ou t'en
servir **depuis plusieurs ordinateurs**, branche-lui un **dépôt git distant** : **GitHub**, GitLab,
Azure DevOps, ou ton propre serveur git.

- **Pendant l'installation** : Claude te le **propose directement** (geste 2) et configure tout.
- **Plus tard** : trois commandes (`git remote add` → `git push -u` → activer le push auto), pas à
  pas dans [SETUP §7](SETUP.md).

C'est **opt-in** : tant que tu ne l'as pas branché, **rien n'est poussé** (garde-fou anti-fuite par
défaut). Tu peux le faire tout de suite **ou des semaines plus tard**, sans rien casser. Une fois en
place, le hook auto-commit **pousse à chaque modif** — backup et bascule entre laptops deviennent
transparents.

## Et la confidentialité de mes données ?

Question légitime : ton vault peut être **confidentiel**. Deux services voient ton contenu — et
**dans les deux cas, tu peux fermer la porte à leur exploitation** :

- **Claude** (qui raisonne et répond) lit ton vault. En **API / Team / Enterprise**, tes données
  ne servent **pas** à l'entraînement. Sur le **grand public** (claude.ai Free/Pro/Max), va dans
  **Réglages → Confidentialité** et **décoche** l'usage de tes conversations pour l'amélioration
  des modèles.
- **Gemini** (qui fait la recherche) reçoit le **texte de tes notes** pour les indexer. ⚠️ Sur le
  **palier gratuit**, Google **peut exploiter** ces contenus (relecture humaine possible).
  **Activer la facturation = le geste qui protège** : Google s'engage alors à **ne pas** s'en
  servir pour l'entraînement.

**Pour le prix d'un café à l'année, tes données sortent du périmètre d'entraînement.** Détails et
abaque : [SETUP §9](SETUP.md). *(Les conditions des deux fournisseurs évoluent : vérifie-les.)*

---

## Pourquoi un *générateur*, et pas un produit fini ?

Parce qu'un second cerveau est **personnel**. Ce qui sert un Head of Engineering, un commercial ou
un chercheur n'a **rien à voir**. Un outil unique pour tous serait fade pour chacun.

Alors ce repo te livre **la mécanique prête à l'emploi** (le moteur de recherche) et **une
méthode** — l'approche *use case driven* de **Thomas Pierrain** ([sa série d'articles](#la-série-darticles)) —
pour faire **émerger tes propres usages** au fil de tes questions. Tu pars d'une graine ; tu la
fais pousser en t'en servant.

**Chacun a son instance.** Un collègue qui veut le sien **repart du même launcher** et se **génère**
son propre cerveau. On ne partage pas un second cerveau à plusieurs — on partage le générateur.

C'est aussi pour ça que le `CLAUDE.md` (les règles que Claude suit) est **ta constitution**,
propre à *tes* usages : l'installateur le **génère** sur mesure pour toi. Le launcher ne contient
qu'une **amorce** qui signale à Claude qu'il est encore un générateur (et te guide vers
l'installateur) ; le bootstrap **génère ta vraie constitution dans le dossier cerveau** — et ne
touche **jamais** à l'amorce du launcher (qui reste réutilisable).

## Sûr par construction : il observe, il répond

Ton second cerveau **ne prend aucune action** sur tes outils. Il **lit et il répond**, point. Aucune
surprise, rien qui parte en ton nom : c'est un choix de conception, et c'est ce qui le rend
tranquille à adopter.

> Et si un jour tu le veux : en le faisant grandir, on peut lui ajouter des **capacités d'action**
> (brouillon de mail, page Notion, message Slack à valider…), **délibérément et sous ton contrôle**.
> Jamais par défaut, jamais dans ton dos.

## Adapte-le à tes cas d'usage

Un second cerveau ne vaut que **calé sur ton activité** : tes besoins, le type de questions que tu
poses, le type d'échange que tu veux avoir avec lui. C'est *toi* qui définis ça.

**Exemple — pour Thomas Pierrain, *Head of Engineering*** — son second cerveau l'aide à :

- **suivre ses collaborateurs**, celles et ceux qu'il coache et mentore ;
- **se faire challenger** quand il a la tête dans le guidon, sur un poste où l'on se sent parfois
  seul ;
- **consolider des concepts métier client avancés** (ici comptabilité et fiscalité) ;
- **distinguer les acronymes** métier des acronymes applicatifs — récupérer vite le sens en pleine
  réunion, sans interrompre tout le monde ;
- **cartographier les équipes** : qui porte quel sujet, à tout moment ;
- **savoir en permanence ce qu'on attend de lui, et ce qu'il attend des autres**.

Rien de tout cela n'est livré : ce sont **ses** spécificités. Le générateur ne cherche pas à les
répliquer — il te donne le moteur et la méthode pour faire émerger **les tiennes**.

## La série d'articles

Le « pourquoi » derrière ce repo — à lire dans l'ordre, chaque épisode raconte une étape (et ses
ratés assumés) :

1. [Mon second cerveau a pivoté 2 fois en 3 jours](https://medium.com/@tpierrain/mon-second-cerveau-a-pivot%C3%A9-2-fois-en-3-jours-d846b7b2cbb5)
2. [J'ai mis un coach vénère dans mon second cerveau](https://medium.com/@tpierrain/jai-mis-un-coach-v%C3%A9n%C3%A9re-dans-mon-second-cerveau-c5593bbfd7d7)
3. [Pourquoi mon second cerveau parlait sans comprendre](https://medium.com/@tpierrain/pourquoi-mon-second-cerveau-parlait-sans-comprendre-6848fcf98421)

---

## Sous le capot

*Cette section est pour les curieux et les profils techniques. Tu n'as pas besoin de la lire pour
utiliser ton second cerveau.*

### Le parti-pris : répondre tout de suite, vérifier ensuite

Tout est pensé **expérience d'abord** : tu veux une réponse en quelques secondes à *chaque*
question — pas attendre qu'un agent ait fini de re-fouiller tous tes outils.

Donc le second cerveau **répond immédiatement** à partir de ce qu'il a déjà en mémoire (le vault),
par **recherche sémantique** (il retrouve une note même formulée autrement, pas par mots-clés
exacts). Pendant que tu lis, des agents **re-vérifient en arrière-plan** les sources externes et
n'**amendent** la réponse que s'il y a du nouveau. C'est le pattern *stale-while-revalidate* du web
appliqué à ta mémoire : la rapidité prime, la fraîcheur suit.

À chaque question, le cerveau **se rattrape** : il aspire ce qui s'est passé de nouveau depuis la
dernière fois (en **mode delta** — uniquement les nouveautés) et persiste tout dans le vault
Markdown, versionné par git.

### Le flux en 4 phases

```
Question
   │
   ▼  PHASE 1 — Réponse immédiate depuis le vault (recherche sémantique)
   │
   ├──▶ PHASE 2 — (optionnel) Sync des sources externes en arrière-plan
   │
   ▼  PHASE 3 — Amender la réponse si du nouveau est trouvé
   │
   ▼  PHASE 4 — Persistance : tout est sauvé dans le vault + commit auto
```

Le **moteur RAG** découpe chaque note en *chunks* (un par section), les transforme en vecteurs
(*embeddings* Gemini) et retrouve les passages les plus proches du **sens** de ta question. L'index
se reconstruit seul, incrémentalement ; un hook git **committe** à chaque modification (et **pousse**
seulement si tu as branché un dépôt distant — *opt-in*).

### Ce qu'il y a dans la boîte

| Élément | Rôle | Statut |
|---|---|---|
| **`rag/`** | Moteur RAG (serveur MCP TypeScript) : chunking, embeddings Gemini, recherche sémantique, garde-fous quota | ✅ prêt à l'emploi |
| **`vault/`** | Ton contenu Markdown (notes d'exemple fournies) | 🔧 à remplir |
| **`CLAUDE.md`** | Les règles que Claude suit (flux 4 phases, conventions, posture) | 🌱 amorce dans le launcher → le bootstrap en **génère** une version perso **dans le cerveau**, puis à adapter |
| **`.claude/skills/`** | Skills livrées (voir ci-dessous) + idées d'autres skills | 🔧 à étoffer |
| **`.claude/settings.json`** | Hooks (auto-commit, statut au démarrage) + permissions | ✅ généré |
| **`scripts/*.mjs`** | Hooks Node multi-OS : état repo + RAG au démarrage, commit auto | ✅ prêt |
| **`bootstrap.mjs`** | Installateur : **crée le dossier cerveau** à partir du launcher (macOS / Linux / Windows) | ✅ |

### Les skills que tu appelles

Le générateur reste volontairement **frugal**. Celles que tu invoques au quotidien :

| Skill | Ce qu'elle fait |
|---|---|
| **`/coach`** | **Coach « vénère »**, sparring partner branché sur ton vault, esprit *Radical Candor* (bienveillant ET brutalement honnête) : il challenge tes décisions, nomme tes angles morts. *Coaching de soi uniquement.* |
| **`/prepare-1-1`** | Prépare un 1-1 **dans les deux sens** : avec **ton manager** ou avec quelqu'un que **tu manages** (suivi des engagements, revue de KPI). Croise fiche personne + dernier 1-1 + signaux récents. |
| **`/improve`** | Fait évoluer ton harnais : lit les frictions, propose et applique les améliorations utiles. |
| **`/sync`** | Synchronise ton repo entre machines — utile surtout si tu as **plusieurs laptops**. Rarement nécessaire au quotidien. |

### L'outillage interne (tu ne l'appelles pas)

Ces éléments font partie de la mécanique : tu n'as pas à les connaître. C'est juste bon de savoir
qu'ils existent.

| Élément | Rôle | Qui le déclenche |
|---|---|---|
| **`sync-sources`** | Aspire le **delta** des sources externes en sous-agents parallèles **lecture seule** — le moteur de la Phase 2. 🔧 à câbler sur tes connecteurs. | **tes questions** (jamais toi) |
| **hook auto-commit** | **Committe** ton vault à chaque modification (et le **pousse** si tu as activé un dépôt distant — *opt-in*, off par défaut). C'est ce qui fait qu'un profil **non-technique n'a jamais à connaître git** — tout est versionné tout seul en local, rien ne se perd ; branche un dépôt distant et tu changes de laptop sans y penser. | automatique |
| **`tdd-discipline`** | Discipline TDD vendorée — sert à développer *le harnais lui-même*. | Claude, quand on modifie le harnais |

Le reste n'est **pas livré** : ce sont des **idées de skills** à faire émerger selon tes besoins,
détaillées dans [`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md). Par exemple :
`briefing-journee` (briefing du matin), `briefing` (synthèse après une absence), `prepare-meeting`,
`rapport-etonnement`, `weekly-review`.

> **Skill ≠ connecteur.** Slack, Drive, Notion, Calendar sont des **connecteurs** (sources de
> données), pas des skills. Tu les branches au bootstrap ([SETUP §6](SETUP.md)). Une *skill* est
> une procédure qui exploite ces sources — à toi de l'écrire.

### Le vocabulaire en 30 secondes

<details>
<summary>Déplier le mini-glossaire</summary>

- **Vault** — le dossier où vivent tes notes (en Markdown).
- **RAG / recherche sémantique** — la techno qui retrouve une note par le *sens* de ta question,
  pas par mots-clés exacts.
- **Embeddings** — la traduction d'un texte en chiffres, pour comparer les *sens* entre eux.
- **Skill** — une procédure que tu déclenches (ex. « prépare mon 1-1 »).
- **Connecteur** — un branchement vers une de tes sources (Slack, Drive, Notion…). Deux formes :
  **natif** (activé dans les réglages de ton compte Claude) ou **MCP** (un serveur déclaré dans `.mcp.json`).
- **Harnais** — l'ensemble des règles (`CLAUDE.md`) + skills que tu personnalises.
- **Hook** — une action automatique déclenchée par un événement (ex. sauvegarder à chaque modif).
- **Bootstrap** — l'installateur qui prépare tout pour toi.
- **Repo / git** — l'endroit versionné où tout est stocké et sauvegardé.

</details>

---

## Brancher tes sources (connecteurs)

Le moteur RAG répond depuis **tes notes**. Pour qu'il puisse aussi aller chercher dans tes **autres
sources** (mail, agenda, Notion, fichiers, chat…), tu branches des **connecteurs**.

**Deux façons de brancher une source — c'est ce que veut dire « natif » vs « MCP » :**

- **Connecteur _natif_ (claude.ai)** — une intégration **fournie et hébergée par Claude**, que tu
  actives en quelques clics dans **les réglages de ton compte Claude** (*Settings → Connectors*).
  **Rien à installer ni configurer** dans ton cerveau. Le plus simple — c'est le cas de Gmail,
  Google Calendar, Slack, Google Drive, Notion.
- **Serveur _MCP_ (communautaire)** — un petit programme (souvent un paquet `npm`) que **tu déclares
  toi-même** dans le fichier `.mcp.json` de ton cerveau, avec tes identifiants. Plus de choix et de
  contrôle, mais un peu plus de configuration. Le wizard du bootstrap peut l'ajouter pour toi.

> 👉 Quand une source existe **dans les deux formes** (Notion, Drive…), commence par le **natif** :
> moins de friction. Passe au **MCP** si tu veux une variante précise ou un outil sans connecteur natif.

Quelques idées pour démarrer — *à toi de choisir selon tes outils* :

| Tu veux interroger… | Tu peux par exemple brancher… | Type |
|---|---|---|
| Tes **notes / wikis** Notion | le serveur MCP Notion `@notionhq/notion-mcp-server`, ou le connecteur Notion **natif** | natif **ou** MCP |
| Tes **mails** | le connecteur **Gmail** **natif** | natif (claude.ai) |
| Ton **agenda** | le connecteur **Google Calendar** **natif** | natif (claude.ai) |
| Tes **fichiers / documents** | un serveur MCP Google Drive (`@modelcontextprotocol/server-gdrive`, `@isaacphi/mcp-gdrive`…), ou le connecteur Drive **natif** | natif **ou** MCP |
| Ton **chat d'équipe** | le connecteur **Slack** **natif** | natif (claude.ai) |
| Les **transcripts de tes réunions** (Meet) | le **Calendar** *et* le **Drive** — voir ci-dessous | natif + MCP |

> 🎙️ **Les transcripts de réunion ne sont pas un connecteur à part.** Quand tu enregistres une
> visio (Google Meet / Gemini), le lien de la transcription se retrouve souvent dans
> l'**invitation de l'événement** (→ via le **Calendar**) et le document de transcription atterrit
> sur ton **Google Drive** (→ via le **Drive**). Tu les attrapes donc en branchant **ces deux
> connecteurs**, pas un outil de meeting-bot tiers.

Le **wizard du bootstrap** (étape 5/9) te propose de brancher tout ça en te montrant, pour chaque
source, *à quoi elle sert*. Le menu complet et le détail des credentials sont dans
[**CONNECTORS.md**](CONNECTORS.md) et [SETUP §6](SETUP.md).

## Et après ?

La graine te donne le **moteur** et un **squelette de harnais** ; *ton* second cerveau, tu le fais
pousser en l'utilisant — tes notes, tes règles, tes skills. Pour aller plus loin :
[`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md) (idées de skills) et
[SETUP.md](SETUP.md) (connecteurs, troubleshooting, détails du RAG).

## À propos

Par **Thomas Pierrain** — retrouve la série « second cerveau » et ses autres écrits sur
[medium.com/@tpierrain](https://medium.com/@tpierrain).

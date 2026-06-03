# Second Brain Starter

## C'est quoi un second cerveau ?

Une mémoire externe à toi : tes notes, décisions et échanges de travail réunis en un seul endroit
que tu interroges **en langage naturel** — et qui te répond tout de suite, **sources à l'appui**,
au lieu que tu ailles fouiller toi-même dans **tous tes outils** (Slack, Teams, mails, Google
Drive, CR de meetings, etc.).

## À quoi sert ce starter ?

À te construire **TON** second cerveau — pas à t'en livrer un tout fait. Le moteur (RAG) est prêt à
l'emploi ; le harnais (règles + skills) est un **template** : une **graine** que tu fais pousser en
l'utilisant, à la façon *use case driven* décrite par **Thomas Pierrain** dans sa série d'articles
(ci-dessous).

Car un second cerveau est **personnel** : il doit être **fine-tuné à tes usages**. Ce n'est **pas
un outil *one-size-fits-all*** — ce qui sert un Head of Engineering, un commercial ou un chercheur
n'a rien à voir. Le starter te donne la mécanique et la méthode ; *toi*, tu définis tes notes, tes
règles (`CLAUDE.md`) et tes skills (cf. la section « adapte-le à tes cas d'usage » plus bas).

## En quoi ce « second cerveau *use case driven* » est-il spécifique ?

Tout ici est pensé **interaction et expérience** d'abord : tu veux une réponse **immédiate**, en
quelques secondes, à *chacune* de tes questions — pas attendre qu'un agent ait fini de re-fouiller
tous tes outils. Tout le reste découle de cette exigence.

Le parti-pris : **répondre tout de suite sur la base de ce qui a déjà été aspiré dans le substrat,
vérifier ensuite en parallèle par des sous-agents** qu'il n'y a pas d'infos plus fraîches ou
contradictoires. À ta question, le second cerveau répond en quelques secondes à partir du vault par
**recherche sémantique** (embeddings / RAG — il retrouve une note même formulée autrement, pas par
mots-clés exacts), en citant ses sources et leur fraîcheur. Pendant que tu lis, des agents
re-vérifient en arrière-plan les sources externes (Slack, Drive, transcripts…) et n'**amendent** la
réponse que s'il y a du nouveau. C'est le pattern *stale-while-revalidate* du web appliqué à ta
mémoire : le cache prime sur la fraîcheur immédiate.

Et **à chaque question posée, le substrat se rattrape** : il aspire tout ce qui s'est passé de
nouveau depuis la dernière fois (**en mode delta** — uniquement les nouveautés). Tout est persisté
dans un vault Markdown *append-only* versionné par git (ton cerveau te suit d'une machine à
l'autre) ; et comme tout vit dans un **repo git privé**, un laptop perdu ou volé n'est plus un
drame : tu re-clones ailleurs et tu **reprends exactement là où tu en étais**.

> **Principe directeur — l'affordance avant tout.** Tu interroges ton second cerveau en langage
> naturel et tu obtiens une réponse immédiate, sourcée. Tu n'as **jamais** à savoir comment c'est
> fait à l'intérieur (RAG, embeddings, synchro delta, index, sous-agents) : **l'usage est découplé
> de l'implémentation**. C'est pensé pour alléger ta charge mentale — au point que *même quelqu'un
> de non-technique* pourrait s'en servir.

Corollaire : **zéro couplage temporel, zéro charge cognitive.** Tu n'as *jamais* à orchestrer la
mécanique (pas de « appelle tel skill avant tel autre », pas de synchro à déclencher, pas à savoir
quand l'index se reconstruit). Et comme **tout est persisté**, ton second cerveau accumule une trace
exploitable : tu peux lui demander *« qu'est-ce qu'on pourrait améliorer ? »*, il observe cet
historique et suggère ses propres pistes d'**amélioration continue** (c'est l'objet de la skill `improve`).

## De quoi vais-je avoir besoin ?

- **[Claude Code](https://claude.com/claude-code)**, **[Node.js](https://nodejs.org) ≥ 18** et **git**
  (le bootstrap vérifie tout).
- **Tes sources d'information**, branchées via **MCP** (ou d'autres moyens) : Slack, Google Drive,
  Calendar, mails, Notion, transcripts de réunions… selon *tes* outils (cf. [SETUP §6](SETUP.md)).
- Une **clé API Gemini de Google** pour le RAG (chunking → embeddings → recherche sémantique). Le
  **palier gratuit suffit pour démarrer** (quotas journaliers, avec garde-fous intégrés). Pour aller
  plus vite ou indexer un **gros volume**, le palier payant est **très bon marché** : les embeddings
  se comptent en **centimes** (ordre de grandeur ~0,15 $ par million de tokens indexés — indexer des
  milliers de notes coûte typiquement quelques dizaines de centimes ; *vérifie le tarif courant, il
  évolue*).

## Et la confidentialité de mes données ?

Question légitime : ton vault peut être **confidentiel**. Deux services voient ton contenu — et
dans les deux cas tu peux **fermer la porte à leur exploitation** :

- **Claude (le raisonnement)** lit ton vault pour répondre. Par **API / Team / Enterprise**, tes
  données ne servent **pas** à l'entraînement. Sur le **grand public** (claude.ai Free/Pro/Max),
  va dans **Réglages → Confidentialité** et **décoche** l'usage de tes conversations pour
  l'amélioration des modèles.
- **Gemini (le RAG)** reçoit le **texte de tes notes** pour calculer les embeddings (rien d'autre ;
  les vecteurs restent en local). ⚠️ Sur le **palier gratuit**, Google **peut exploiter** ces
  contenus (amélioration produit, relecture humaine possible). **Activer la facturation (palier
  payant) = le geste qui protège** : Google s'engage alors à **ne pas** s'en servir pour
  l'entraînement.

Et ça ne coûte **presque rien** : indexer **~1 000 notes ≈ 0,10 €**, **~10 000 notes ≈ 1 €**, les
requêtes négligeables, l'index incrémental → coût récurrent quasi nul. **Pour le prix d'un café à
l'année, tes données sortent du périmètre d'entraînement.** Détails et abaque :
[SETUP — §9 Confidentialité](SETUP.md). *(Les conditions des deux fournisseurs évoluent : vérifie-les.)*

### La série d'articles (le « pourquoi » derrière ce repo)

À lire dans l'ordre — chaque épisode raconte une étape de la construction :

1. [Mon second cerveau a pivoté 2 fois en 3 jours](https://medium.com/@tpierrain/mon-second-cerveau-a-pivot%C3%A9-2-fois-en-3-jours-d846b7b2cbb5)
2. [J'ai mis un coach vénère dans mon second cerveau](https://medium.com/@tpierrain/jai-mis-un-coach-v%C3%A9n%C3%A9re-dans-mon-second-cerveau-c5593bbfd7d7)
3. [Pourquoi mon second cerveau parlait sans comprendre](https://medium.com/@tpierrain/pourquoi-mon-second-cerveau-parlait-sans-comprendre-6848fcf98421)

---

## Démarrage en 3 étapes

```bash
# 1. Clone ce template (bouton "Use this template" sur GitHub, ou git clone)
cd second-brain-starter

# 2. Lance l'installateur (vérifie les prérequis, personnalise, installe le moteur)
#    Multi-OS : macOS / Linux / Windows (cmd ou PowerShell), aucun shell requis.
node bootstrap.mjs

# 3. Ouvre Claude Code et pose une question
claude
```

> **Prérequis** : [Node.js](https://nodejs.org) ≥ 18, git, [Claude Code](https://claude.com/claude-code),
> et une [clé Gemini gratuite](https://aistudio.google.com/apikey). Le bootstrap vérifie tout.

Une fois installé, demande par exemple :
> *« Quelle base de données a-t-on choisie pour la facturation, et pourquoi ? »*

Claude cherche dans le vault et répond avec les backlinks vers les notes sources.

---

## Ton second cerveau = ta propre instance de ce template

Ce repo est un **template**, pas un service partagé. Pour te faire un second cerveau :

1. **« Use this template » sur GitHub** (ou `git clone` puis re-pointe `origin` vers un repo à toi,
   cf. [SETUP §7](SETUP.md)) → tu obtiens **ton propre repo privé**, séparé de ce starter.
2. `node bootstrap.mjs` → il **génère tes fichiers personnalisés** (dont `CLAUDE.md`) dans cette copie.
3. Cette copie **EST** ton second cerveau : vault + harnais dans un seul repo privé, qui te suit
   d'une machine à l'autre.

Chaque personne a **sa** propre instance : un collègue qui veut le sien **repart du template** et
crée **son** repo privé à lui. Un second cerveau est personnel — on n'en partage pas un seul à plusieurs.

> **Pourquoi aucun `CLAUDE.md` n'est livré (et pourquoi ne pas en ajouter ici).** `CLAUDE.md` est
> **ta constitution** : les règles que Claude suit, propres à *tes* usages. Le bootstrap la **génère**
> depuis `CLAUDE.md.template`, et il **refuse d'écraser** un `CLAUDE.md` existant. En committer un
> dans le starter empêcherait donc chaque utilisateur d'avoir le sien.

---

## Ce qu'il y a dans la boîte

| Élément | Rôle | Statut |
|---|---|---|
| **`rag/`** | Moteur RAG (MCP server TypeScript) : chunking, embeddings Gemini, recherche sémantique, garde-fous quota | ✅ prêt à l'emploi |
| **`vault/`** | Ton contenu Markdown (notes d'exemple fournies) | 🔧 à remplir |
| **`CLAUDE.md`** | Les règles que Claude suit (flux 4 phases, conventions, posture) | 🔧 template à adapter |
| **`.claude/skills/`** | Skills livrées : `sync`, `improve`, `coach` (le **coach vénère** à la Radical Candor), `prepare-1-1`, `sync-sources` + `tdd-discipline` (vendorée) — détail ci-dessous — et des idées d'autres skills | 🔧 à étoffer |
| **`.claude/settings.json`** | Hooks (auto-commit, statut au démarrage) + permissions | ✅ généré |
| **`scripts/*.mjs`** | Hooks Node multi-OS : état repo + RAG au démarrage (`session-status`), commit auto (`auto-commit`) | ✅ prêt |
| **`bootstrap.mjs`** | Installateur interactif (macOS / Linux / Windows) | ✅ |

### Les skills que tu appelles

Le starter reste volontairement **frugal en skills**. Celles que tu invoques au quotidien :

| Skill | Ce qu'elle fait |
|---|---|
| **`/coach`** | **coach « vénère », sparring partner branché sur ton vault**, dans l'esprit *Radical Candor* (Care Personally + Challenge Directly) : brutalement honnête ET bienveillant, il challenge tes décisions et tes raisonnements, nomme tes angles morts. *Coaching de soi uniquement.* |
| **`/prepare-1-1`** | prépare un 1-1 **dans les deux sens** : avec **ton manager** (les sujets que tu veux porter, ce qui a bougé depuis la dernière fois) ou avec quelqu'un que **tu manages** (suivi des engagements, sujets opérationnels, **revue de KPI**). Croise fiche personne + dernier 1-1 + delta de signaux. *Skill méta : une structure à affiner à tes axes et tes KPI.* |
| **`/improve`** | fait évoluer ton harnais : lit les frictions, propose et applique les améliorations les plus utiles |
| **`/sync`** | synchronise le repo git entre tes machines — **utile surtout si tu as plusieurs laptops** (commit, `pull --rebase`, gestion de conflits, push). Rarement nécessaire au quotidien. |

### Outillage interne du harnais (tu ne les appelles pas)

Ces skills font partie de la **mécanique** : tu n'as pas à les connaître pour utiliser ton second
cerveau — c'est tout l'objet de l'**affordance** du harnais (l'usage est découplé de
l'implémentation). C'est juste bon de savoir qu'elles existent.

| Élément | Rôle | Qui le déclenche |
|---|---|---|
| **`sync-sources`** | architecture **fan-out/fan-in** qui aspire le **delta** des sources externes en sous-agents parallèles **lecture seule** — le moteur de la Phase 2 (cf. « Comment ça marche »). 🔧 à câbler sur tes connecteurs. | **tes questions** (jamais toi directement) |
| **hook auto-commit** | committe **et pushe** ton vault à chaque ajout/modif de fichier (`scripts/auto-commit.mjs`). Rôle clé dans l'**affordance** : un profil **non-tech n'a pas à connaître git** (ni `add`, ni `commit`, ni `push`) — tout est versionné tout seul. Précieux pour **ne rien perdre**, **auditer** l'historique, nourrir l'**amélioration continue**, et **changer de laptop / jongler entre plusieurs machines** sans y penser. | automatique (hook PostToolUse sur Write/Edit) |
| **`tdd-discipline`** | discipline TDD vendorée — sert à développer *le harnais lui-même* en TDD. | Claude, quand on modifie le harnais |

Le reste n'est **pas livré** : ce sont des **idées de skills à faire émerger selon tes besoins**.
Le starter t'en propose plusieurs (détaillées dans
[`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md)), inspirées de cas d'usage réels —
par exemple :

- **`briefing-journee`** — briefing du matin : agenda du jour, points chauds, actions prioritaires ;
- **`briefing`** — après une absence, la synthèse de ce qui s'est passé sur tes canaux suivis ;
- **`prepare-meeting`** — contexte, points ouverts et historique des participants avant une réunion ;
- **`rapport-etonnement`** — capturer ton regard neuf lors d'une prise de poste / d'une nouvelle mission ;
- **`weekly-review`** — revue hebdo : ce qui a avancé, ce qui stagne, ce qui arrive.

C'est voulu : un second cerveau ne vaut que calé sur *tes* cas d'usage (cf. la section
« adapte-le à tes cas d'usage » plus bas).

> **Skill ≠ connecteur.** Slack, Drive, Notion, Calendar sont des **connecteurs** (sources de
> données), pas des skills. Tu les branches au bootstrap (wizard, cf. [SETUP §6](SETUP.md)) ;
> les natifs (Slack, Calendar) se configurent côté compte claude.ai. Une *skill* est une
> procédure qui exploite ces sources — à toi de l'écrire.

---

## Comment ça marche

```
Question
   │
   ▼  PHASE 1 — Réponse immédiate depuis le vault (recherche sémantique RAG)
   │
   ├──▶ PHASE 2 — (optionnel) Sync sources externes en background
   │
   ▼  PHASE 3 — Amender si du nouveau est trouvé
   │
   ▼  PHASE 4 — Persistance : tout est sauvé dans le vault + commit auto (hook)
```

Sous le capot, le **moteur RAG** découpe chaque note en *chunks* (un par section), les
transforme en vecteurs (embeddings Gemini) et retrouve les passages les plus proches du sens
de ta question. L'index se reconstruit seul, incrémentalement ; un hook git committe et pushe
à chaque modification (phase 4).

---

## Un second cerveau, c'est *personnel* — adapte-le à tes cas d'usage

Un second cerveau n'a de valeur que **calé sur ton activité** : tes besoins, le **type de
questions** que tu poses, le **type d'interaction** que tu veux avoir avec lui. C'est *toi*
qui définis ça — pas le starter.

**Par exemple, pour Thomas Pierrain — *Head of Engineering*** — le second cerveau doit l'aider à :

- **suivre ses collaborateurs**, celles et ceux qu'il coache et mentore ;
- **se coacher lui-même** (et se faire challenger) : prendre du recul quand on a la tête dans
  le guidon, sur des postes où l'on se sent parfois un peu seul ;
- **comprendre et consolider des concepts métier avancés** côté client — ici comptabilité et
  fiscalité, des domaines loin d'être triviaux ;
- **distinguer les acronymes métier des acronymes applicatifs** : tu es en réunion, quelqu'un
  vient de lâcher un acronyme barbare — récupère vite l'info pour suivre, sans avoir à
  interrompre tout le monde pour demander (les mêmes lettres ne veulent pas dire la même chose) ;
- **cartographier les équipes et l'organisation** : qui travaille sur quel périmètre, quelle
  équipe porte quel sujet, à tout moment ;
- **savoir en permanence ce qu'on attend de lui — et ce qu'il attend des autres**.

Rien de tout cela n'est livré dans le starter : ce sont des **spécificités propres à son
activité**. Le starter ne cherche surtout pas à les répliquer — il te donne le moteur et la
méthode pour faire **émerger les tiennes**, au fil de tes questions et de tes interactions.

---

## Et après ?

La graine te donne le **moteur** et un **squelette de harnais** ; *ton* second cerveau, tu le
fais pousser en l'utilisant — tes notes, tes règles dans `CLAUDE.md`, tes skills. Pour aller
plus loin : [`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md) (idées de skills) et
[SETUP.md](SETUP.md) (connecteurs Slack/Drive/Notion, troubleshooting, détails du RAG).

---

## À propos

Par **Thomas Pierrain** — retrouve la série « second cerveau » et ses autres écrits sur
[medium.com/@tpierrain](https://medium.com/@tpierrain).

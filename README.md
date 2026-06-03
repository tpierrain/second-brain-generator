# Second Brain Starter

> Ce dépôt est une **graine** pour te construire ton propre **second cerveau** — à la façon
> *use case driven* décrite par **Thomas Pierrain** dans sa série d'articles Medium. Concrètement : un vault
> Markdown versionné que des agents Claude Code interrogent en langage naturel, au lieu de
> re-parcourir tes outils à chaque question.

Le moteur est prêt à l'emploi ; le harnais (règles + skills) est un **template** que tu
adaptes à **ton** usage. C'est une *graine*, pas un cerveau tout fait : tu le fais pousser
en l'utilisant.

### La série d'articles (le « pourquoi » derrière ce repo)

À lire dans l'ordre — chaque épisode raconte une étape de la construction :

1. [Mon second cerveau a pivoté 2 fois en 3 jours](https://medium.com/@tpierrain/mon-second-cerveau-a-pivot%C3%A9-2-fois-en-3-jours-d846b7b2cbb5)
2. [J'ai mis un coach vénère dans mon second cerveau](https://medium.com/@tpierrain/jai-mis-un-coach-v%C3%A9n%C3%A9re-dans-mon-second-cerveau-c5593bbfd7d7)
3. [Pourquoi mon second cerveau parlait sans comprendre](https://medium.com/@tpierrain/pourquoi-mon-second-cerveau-parlait-sans-comprendre-6848fcf98421)

### La spécificité en un paragraphe

Tout ici est pensé **interaction et expérience** d'abord : tu veux une réponse **immédiate**,
en quelques secondes, à *chacune* de tes questions — pas attendre qu'un agent ait fini de
re-fouiller tous tes outils avant de te répondre. Tout le reste découle de cette exigence.

Le parti-pris : **répondre tout de suite sur la base de ce qui a déjà été aspiré dans le
substrat, vérifier ensuite en parallèle par des sous-agents** qu'il n'y a pas d'infos plus
fraîches ou contradictoires. À ta
question, le second cerveau répond en quelques secondes à partir du vault par **recherche
sémantique** (embeddings / RAG — il retrouve une note même formulée autrement, pas par
mots-clés exacts), en citant ses sources et leur fraîcheur. Pendant que tu lis, des agents
vont en arrière-plan re-vérifier les sources externes (Slack, Drive, transcripts…) et
n'**amendent** la réponse que s'il y a du nouveau. C'est le pattern *stale-while-revalidate*
du web appliqué à ta mémoire : le cache prime sur la fraîcheur immédiate.

Et **à chaque question posée, le substrat se rattrape** : il aspire tout ce qui s'est passé
de nouveau depuis la dernière fois (**en mode delta** — uniquement les nouveautés, pas tout
re-télécharger). Concrètement, selon les outils que tu utilises au travail : les réunions
ajoutées à ton **Google Calendar**, les transcripts déposés dans **Google Drive** ou **Notion**,
les échanges dans tes **mails**… — bref, *tes* sources de données primaires. Cela suppose de
brancher au départ les **connecteurs MCP** correspondants (le bootstrap t'y aide via un wizard,
cf. [SETUP.md §6](SETUP.md)). Tout est persisté dans un vault Markdown *append-only* versionné par git
(ton cerveau te suit d'une machine à l'autre). Et comme tout vit dans un **repo git privé**,
un laptop perdu ou volé n'est plus un drame : tu re-clones ailleurs et tu **reprends ton
activité exactement là où tu en étais**.

Corollaire : **zéro couplage temporel, zéro charge cognitive.** Le moteur RAG comme le harnais
fonctionnent en **foolproof** — tu n'as *jamais* à orchestrer la mécanique : pas de « appelle
tel skill avant tel autre », pas de synchro à déclencher à la main, pas besoin de savoir quand
l'index se reconstruit. Tu poses ta question ; la recherche, la synchro delta, l'indexation et
la persistance s'enchaînent toutes seules, au bon moment. L'**usage est volontairement découplé
de l'implémentation** — fluide, souple, simple au point que *n'importe qui* pourrait s'en servir.
Tout l'objectif : **alléger ta charge mentale** pour que tu te concentres sur les bons sujets,
au bon moment.

Et comme **tout est persisté** — tes questions, les réponses, ce qui a été synchronisé et
généré —, ton second cerveau accumule une trace exploitable. Au bout d'un moment, tu peux
littéralement lui demander *« qu'est-ce qu'on pourrait améliorer ? »* : il observe tout cet
historique et s'en sert comme base pour suggérer ses propres pistes d'**amélioration continue**
(c'est tout l'objet de la skill `improve`).

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

## Ce qu'il y a dans la boîte

| Élément | Rôle | Statut |
|---|---|---|
| **`rag/`** | Moteur RAG (MCP server TypeScript) : chunking, embeddings Gemini, recherche sémantique, garde-fous quota | ✅ prêt à l'emploi |
| **`vault/`** | Ton contenu Markdown (notes d'exemple fournies) | 🔧 à remplir |
| **`CLAUDE.md`** | Les règles que Claude suit (flux 4 phases, conventions, posture) | 🔧 template à adapter |
| **`.claude/skills/`** | Skills livrées : `sync`, `improve`, `coach` (le **coach vénère** à la Radical Candor) + `tdd-discipline` (vendorée) — détail ci-dessous — et des idées d'autres skills | 🔧 à étoffer |
| **`.claude/settings.json`** | Hooks (auto-commit, statut au démarrage) + permissions | ✅ généré |
| **`scripts/*.mjs`** | Hooks Node multi-OS : état repo + RAG au démarrage (`session-status`), commit auto (`auto-commit`) | ✅ prêt |
| **`bootstrap.mjs`** | Installateur interactif (macOS / Linux / Windows) | ✅ |

### Les skills incluses

Le starter reste volontairement **frugal en skills** — il en livre cinq, génériques :

| Skill | Ce qu'elle fait |
|---|---|
| **`/sync`** | synchronise le repo git entre tes machines (commit, `pull --rebase`, gestion de conflits, push) |
| **`/improve`** | fait évoluer ton harnais : lit les frictions, propose et applique les améliorations les plus utiles |
| **`/coach`** | **coach « vénère », sparring partner branché sur ton vault**, dans l'esprit *Radical Candor* (Care Personally + Challenge Directly) : brutalement honnête ET bienveillant, il challenge tes décisions et tes raisonnements, nomme tes angles morts. *Coaching de soi uniquement.* |
| **`sync-sources`** | *(référence interne, pas une commande)* — l'architecture **fan-out/fan-in** qui aspire le **delta** des sources externes en sous-agents parallèles **lecture seule**. C'est le moteur de la Phase 2 (cf. « Comment ça marche »). 🔧 à câbler sur tes connecteurs. |
| **`/tdd-discipline`** | discipline TDD vendorée — sert à développer *le harnais lui-même* en TDD (utile surtout si tu le modifies) |

Le reste n'est **pas livré** : ce sont des **idées de skills à faire émerger selon tes besoins**.
Le starter t'en propose plusieurs (détaillées dans
[`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md)), inspirées de cas d'usage réels —
par exemple :

- **`briefing-journee`** — briefing du matin : agenda du jour, points chauds, actions prioritaires ;
- **`prepare-1-1`** — brief avant un entretien individuel : derniers échanges, engagements, signaux faibles ;
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

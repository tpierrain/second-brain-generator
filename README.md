# Second Brain Starter

> Ce dépôt est une **graine** pour te construire ton propre **second cerveau** — à la façon
> décrite par **Thomas Pierrain** dans sa série d'articles Medium. Concrètement : un vault
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

Le parti-pris : **répondre tout de suite, vérifier ensuite.** À ta question, le second
cerveau répond en quelques secondes à partir du vault par **recherche sémantique** (embeddings
/ RAG — il retrouve une note même formulée autrement, pas par mots-clés exacts), en citant ses
sources et leur fraîcheur. Pendant que tu lis, des agents vont en arrière-plan re-vérifier les
sources externes (Slack, Drive, transcripts…) et n'**amendent** la réponse que s'il y a du
nouveau. C'est le pattern *stale-while-revalidate* du web appliqué à ta mémoire : le cache
prime sur la fraîcheur immédiate, et tout est persisté dans un vault Markdown *append-only*
versionné par git (ton cerveau te suit d'une machine à l'autre).

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
| **`.claude/skills/`** | Skills `sync` + `improve` (génériques) + idées d'autres skills | 🔧 à étoffer |
| **`.claude/settings.json`** | Hooks (auto-commit, statut au démarrage) + permissions | ✅ généré |
| **`scripts/*.mjs`** | Hooks Node multi-OS : état repo + RAG au démarrage (`session-status`), commit auto (`auto-commit`) | ✅ prêt |
| **`bootstrap.mjs`** | Installateur interactif (macOS / Linux / Windows) | ✅ |

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

## Et après ?

La graine te donne le **moteur** et un **squelette de harnais** ; *ton* second cerveau, tu le
fais pousser en l'utilisant — tes notes, tes règles dans `CLAUDE.md`, tes skills. Pour aller
plus loin : [`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md) (idées de skills) et
[SETUP.md](SETUP.md) (connecteurs Slack/Drive/Notion, troubleshooting, détails du RAG).

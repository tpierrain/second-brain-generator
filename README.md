# Second Brain Starter

> Un **second cerveau** personnel : un vault Markdown versionné que des agents Claude Code
> interrogent en langage naturel, au lieu de re-parcourir tes outils à chaque question.
>
> Inspiré de l'approche *append-only + LLM retrieval* (Andrej Karpathy).

L'idée centrale : le vault n'est pas un stockage, c'est un **substrat**. Tu y déposes tes
notes (réunions, décisions, idées, fiches personnes), un moteur **RAG** les indexe par le
sens, et tu poses des questions — Claude répond en citant ses sources.

Ce repo est un **starter** : le moteur est prêt à l'emploi, le harnais (règles + skills)
est un template que tu adaptes à **ton** usage.

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

Le **moteur RAG** découpe chaque note en *chunks* (un par section), les transforme en
vecteurs (embeddings Gemini), et retrouve les passages les plus proches du sens de ta
question. L'index se reconstruit tout seul, incrémentalement.

La **portabilité** est assurée par git : ton cerveau te suit d'une machine à l'autre. Un
hook committe et pushe automatiquement à chaque modification.

---

## Le starter ≠ un cerveau tout fait

Ce repo te donne le **moteur** et un **squelette de harnais**. Il ne te donne pas *ton*
second cerveau — celui-là, tu le construis en l'utilisant : tes notes, tes règles dans
`CLAUDE.md`, tes skills. Voir [`.claude/skills/EXAMPLES.md`](.claude/skills/EXAMPLES.md)
pour des idées, et [SETUP.md](SETUP.md) pour les détails (connecteurs Slack/Drive/Notion,
troubleshooting, fonctionnement du RAG).

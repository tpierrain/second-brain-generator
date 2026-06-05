# ADR 0004 — Claude-only pour l'instant, cross-platform non exclu

- **STATUT :** ACTÉ (2026-06-05).
- **Lié :** [`0002-installateur-maison-vs-plugin.md`](0002-installateur-maison-vs-plugin.md),
  [`0003-pas-upgrade-capacites-cerveaux.md`](0003-pas-upgrade-capacites-cerveaux.md).

## Contexte

Le générateur, et les cerveaux qu'il produit, sont aujourd'hui taillés pour **Claude Code et son
écosystème** : constitution `CLAUDE.md`, skills `.claude/skills/`, **hooks** `settings.json`
(`PostToolUse` auto-commit, `SessionStart`), onboarding piloté en chat par Claude.

Or, en regardant les couches, l'essentiel est **déjà agnostique de l'IA** :

- **Le substrat (vault)** = Markdown + frontmatter + `[[wikilinks]]`, format ouvert, compatible
  Obsidian, lisible par n'importe quel outil.
- **Le moteur (`rag/`)** = un serveur **MCP standard** (SDK officiel, transport stdio). MCP est un
  **protocole ouvert** consommable par un éventail croissant de clients (Claude, et au-delà).

Ce qui est réellement couplé à Claude, c'est **la couche de pilotage** : hooks, skills, format de
constitution, install conversationnelle.

## Décision

Pour l'instant, on assume **Claude-only** : on ne cherche **pas** à rendre le générateur ni les
cerveaux cross-platform. On ne complexifie pas le produit pour des clients qu'on ne sait pas encore
utilisés. **Mais ce n'est pas exclu** : la décision de portage cross-IA sera prise **sur feedbacks
réels** des utilisateurs.

## Conséquences

- **Garantit la simplicité et la cohérence :** une seule cible (Claude + ses hooks), pas de couche
  d'abstraction multi-client à concevoir/tester/maintenir avant d'en avoir le besoin prouvé.
- **Coûte la portabilité immédiate de l'expérience complète** : sur un autre client, on ne récupère
  aujourd'hui que l'interrogation du cerveau (via MCP), pas l'auto-commit ni les skills.
- **Invariant à préserver :** **ne pas ré-coupler** ce qui est déjà agnostique. Le **vault** doit
  rester du Markdown pur, et le **serveur RAG** un MCP standard sans dépendance à une API
  propriétaire Claude. C'est ce qui maintient la porte du cross-platform **ouverte à faible coût**.

## Ce qui restera à adresser le jour du cross-platform

Le gros est déjà multi-IA — il restera surtout la **couche de fiabilisation / ergonomie /
automatisation** :

1. **Déjà portable, rien à faire :**
   - le **vault** (Markdown) — lisible par tout outil (Obsidian, autre RAG, upload, grep…) ;
   - le **serveur `vault-rag`** — MCP pur, consommable tel quel par tout client MCP-capable.
2. **À adapter par client (la couche de pilotage) :**
   - **Constitution** : `CLAUDE.md` est la convention Claude. Prévoir un équivalent / une sortie
     vers un format cross-outil émergent (p. ex. `AGENTS.md`) comme hedge le moins cher.
   - **Hooks** (`PostToolUse` auto-commit, `SessionStart`) : ce sont des événements Claude Code.
     Ailleurs → équivalent du client, **ou** déporter hors-IA. *Note : l'auto-commit pourrait
     migrer dans le watcher de fichiers que le serveur RAG démarre déjà (`startVaultWatcher`),
     ce qui le rendrait agnostique gratuitement.*
   - **Skills** (`coach`, `sync-sources`, `prepare-1-1`…) et **onboarding piloté en chat** : format
     et mécanique Claude → à re-exprimer dans la mécanique du client cible.

## Alternatives écartées

- **Abstraction multi-client dès maintenant** — surcoût de conception/maintenance pour des clients
  hypothétiques ; prématuré sans signal d'usage. On préfère **attendre les feedbacks**.
- **Verrouiller délibérément sur des API propriétaires Claude** (pour aller plus vite) — casserait
  l'agnosticité déjà acquise du vault et du RAG, et fermerait la porte du cross-platform. Refusé :
  voir l'invariant ci-dessus.

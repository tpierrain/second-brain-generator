# 0003 — Pas de daemon : la session est le déclencheur

- **Statut** : Accepté
- **Date** : 2026-05-31

## Contexte

On veut un RAG « idiot-proof » : pas de déclenchement manuel, pas de couplage
temporel à connaître, rien qui se gâche. Tentation naturelle pour y arriver :
un daemon (launchd/cron) qui ré-indexe le vault en arrière-plan en continu.

## Décision

**Pas de processus d'arrière-plan permanent.** Le déclencheur d'indexation est
**l'ouverture d'une session** Claude Code : le serveur MCP lance un reindex
incrémental au démarrage (cf. [0002](0002-demarrage-mcp-non-bloquant.md)). Comme
on ouvre une session précisément quand on veut « parler » au vault, l'acte d'usage
EST le déclencheur. L'index converge session après session.

## Conséquences

- Zéro pièce mobile cachée : aucun daemon à débugger, à surveiller, à redémarrer.
  Aucun mode de panne silencieux hors session.
- Le delta quotidien du vault est minuscule (~10 chunks/jour) → la convergence
  par session est largement suffisante.
- **Limite assumée** : si on modifie le vault sans jamais ouvrir de session, l'index
  ne progresse pas. Acceptable vu l'usage réel (on ouvre une session pour s'en servir).
- **Invariant à ne pas violer** : ne pas introduire de daemon/cron d'indexation « pour
  bien faire ». Si un jour le besoin d'indexation hors-session devient réel, ça
  justifie un **nouvel ADR** qui supersède celui-ci — pas un ajout discret.

## Alternatives écartées

- **Daemon launchd** — résout l'indexation hors-session mais ajoute un mode de panne
  silencieux et de la complexité opérationnelle disproportionnée au gain.
- **Watcher de fichiers (fs.watch)** — même objection, plus la fragilité du watch sur
  un vault synchronisé par git entre laptops.

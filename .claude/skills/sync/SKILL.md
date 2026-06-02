---
name: sync
description: "Synchronise le repo git entre machines en cours de session. Commit les changements locaux, pull --rebase depuis origin, gère les conflits interactivement, et push."
version: 1.0.0
---

# /sync — Synchronisation repo inter-machines

> Commande utilisateur. Utile quand on travaille sur plusieurs machines (laptop perso / pro)
> et qu'on veut récupérer les changements pushés depuis l'autre sans quitter la session.

## Quand l'utiliser

- Quand on a travaillé sur une autre machine et qu'on veut récupérer les changements ici.
- En milieu de session, sans avoir à quitter et relancer Claude Code.
- Complète le hook `SessionStart` (qui fait un pull au démarrage) pour les cas mid-session.

> ℹ️ Nécessite un **remote git configuré** (`origin`). En usage purement local, ce skill est inutile.

## Procédure

### Étape 1 — État local
```bash
git status --porcelain
```
**Clean** → passer à l'étape 3. **Dirty** → étape 2.

### Étape 2 — Commit des changements locaux
```bash
git add .
git commit -m "auto: vault/claude sync"
```
Crée un point de retour sûr avant le rebase.

### Étape 3 — Fetch et rebase
```bash
git fetch origin
git rebase origin/$(git branch --show-current)
```
**Succès** → résumé + étape 5. **Conflit** → étape 4.

### Étape 4 — Gestion des conflits
1. Lister les fichiers en conflit : `git diff --name-only --diff-filter=U`
2. Afficher le diff de chacun avec contexte.
3. Demander à l'utilisateur :
   > **Conflit sur N fichier(s).** Options :
   > - **merge** : je résous et on continue le rebase
   > - **abort** : `git rebase --abort` — retour à l'état d'avant (le commit local est safe)
4. Si **merge** : résoudre intelligemment (contenu vault = souvent append-only → garder les deux versions), `git add` les fichiers résolus, `git rebase --continue`.
5. Si **abort** : `git rebase --abort`, signaler que le commit local est intact, stop.

### Étape 5 — Push et résumé
```bash
git push
```
Afficher : commit local oui/non, fichiers récupérés depuis l'autre machine, statut du push.

## Cas limites
- **Rien à sync** : repo clean + à jour → « Rien à synchroniser (commit abc1234). »
- **Réseau indisponible** : `git fetch` échoue → signaler, changements locaux intacts.
- **Conflit complexe** (binaires, restructuration) : recommander une résolution manuelle.

# Skills à construire toi-même — exemples d'inspiration

Ce starter ne fournit que quelques skills génériques : `sync` (synchro git inter-machines),
`improve` (amélioration du harnais) et `coach` (sparring partner « vénère » sur soi — une
**implémentation de référence** dont tu peux t'inspirer). Le reste est à toi de le construire,
**selon tes usages**.

C'est là que ton second cerveau devient *le tien* : un skill = un angle d'attaque sur le
même vault. Voici des idées courantes (à adapter, pas à copier tel quel).

## Anatomie d'un skill

Un skill vit dans `.claude/skills/<nom>/SKILL.md` avec un frontmatter :

```markdown
---
name: mon-skill
description: "Phrase qui dit quand l'utiliser — c'est ce que Claude lit pour décider de le déclencher."
version: 1.0.0
---

# /mon-skill — Titre

## Quand l'utiliser
…

## Procédure
1. …
2. …

## Ce que ça produit
…
```

## Idées de skills (par usage)

| Skill | Ce qu'il fait | Sources typiques |
|---|---|---|
| **prepare-meeting** | Avant une réunion : ramène l'historique, les points ouverts, le contexte des participants | Calendar, vault, transcripts |
| **prepare-1-1** | Brief avant un entretien individuel : derniers échanges, engagements, signaux faibles | Calendar, Slack, vault/backlog |
| **coach** ✅ livré | Sparring partner branché sur le vault : challenge les raisonnements, rappelle les engagements (coaching de soi) | vault entier |
| **briefing** | Après une absence : synthèse de ce qui s'est passé sur les canaux suivis | Slack, mail |
| **debrief** | En fin de journée : transforme les événements en notes structurées (daily, topics) | conversation, vault |
| **weekly-review** | Revue hebdo : ce qui a avancé, ce qui stagne, ce qui arrive | vault/backlog, Calendar |
| **rapport-etonnement** | Capturer ton regard neuf lors d'une prise de poste / d'une nouvelle mission (étonnements, angles morts) | vault, observations |
| **article** | Écrire ou continuer un texte en binôme conversationnel, nourri par le vault | vault entier |

## Méthode recommandée

1. **Commence par le flux question directe** (décrit dans CLAUDE.md) — souvent il suffit, pas besoin de skill.
2. **Crée un skill quand un besoin se répète** : si tu redemandes la même chose 3 fois, c'est un skill.
3. **Utilise `/improve`** pour faire évoluer ton harnais au fil des frictions.
4. **Garde les skills minces** : un skill décrit une procédure, il ne réimplémente pas le moteur.

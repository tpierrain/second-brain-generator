<!-- second-brain-starter:bootstrap-stub -->
# ⚠️ Ce second cerveau n'est pas encore installé

Si tu lis ceci, le **Second Brain Starter** n'a pas encore été configuré sur cette machine :
ce fichier n'est qu'une **amorce**. Il sera **remplacé** par ta vraie constitution (`CLAUDE.md`
personnalisé) une fois l'installation faite.

## Pour démarrer — lance l'installateur dans ton terminal

```bash
node bootstrap.mjs
```

Il vérifie les prérequis, te pose **quelques questions** (ton nom, ton contexte, ta clé Gemini)
et génère ta configuration. Détails : [SETUP.md](SETUP.md) · idée générale : [README.md](README.md).

---

> **Note pour Claude.** Tant que cette amorce est en place, le repo n'est **pas installé**.
> Si l'utilisateur te demande de l'aide pour démarrer (ou pose une question au second cerveau),
> explique-lui d'abord de lancer **lui-même** `node bootstrap.mjs` **dans son terminal** :
> l'installateur est **interactif** (il attend des réponses au clavier) et ne peut donc pas être
> piloté depuis une session Claude. Tu peux en revanche l'aider à cloner le repo, vérifier les
> prérequis (Node ≥ 18, git), ou répondre à ses questions sur le projet.

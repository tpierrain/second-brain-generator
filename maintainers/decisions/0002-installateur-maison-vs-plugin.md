# ADR 0002 — Installateur/générateur maison plutôt que plugin Claude

- **STATUT :** ACTÉ (2026-06-05).
- **Lié :** [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (l'archi launcher↔cerveau
  que cette décision habille), [`0003-pas-upgrade-capacites-cerveaux.md`](0003-pas-upgrade-capacites-cerveaux.md)
  (l'updatabilité, conséquence directe du choix), [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md).

## Contexte

Il existe une voie « idiomatique » pour distribuer des capacités Claude Code : un **plugin**
installé depuis une **marketplace** (skills + slash-commands + hooks + serveur MCP empaquetés,
posés par `/plugin install`). La question s'est posée : faut-il que le générateur soit un plugin,
plutôt qu'un `bootstrap.mjs` qu'on clone et lance ?

Deux forces tranchent la réponse :

1. **Le public visé n'est pas technique** — managers, PM, consultants, chercheurs (cf. README
   « C'est pour qui ? »). On ne peut pas supposer qu'ils connaissent les notions de plugin, de
   marketplace, de scope global des hooks, ni même Claude Code en profondeur.
2. **Un plugin résout le mauvais problème.** Un plugin ajoute des *capacités partagées* à un
   environnement Claude existant. Le produit, lui, doit **créer un dépôt git séparé, possédé, avec
   sa propre constitution (`CLAUDE.md`) et son auto-commit** : c'est de la *donnée par utilisateur*,
   pas du *code partagé*. Aucun plugin ne fait ça — il faudrait de toute façon un scaffolder en plus.

## Décision

Le générateur reste un **installateur maison** : un launcher qu'on clone, piloté par une **amorce
conversationnelle** (`CLAUDE.md` du launcher) qui fait récolter les réponses **en chat** à Claude,
puis lance **UNE** commande `node bootstrap.mjs --non-interactive`. Le script déterministe fait
tout (copie, génération, `git init` du cerveau, install RAG, smoke-test MCP).

On **n'empaquette pas** le générateur en plugin/marketplace pour l'instant.

## Conséquences

- **Garantit la simplicité d'entrée pour un non-spécialiste :** « pose-moi des questions, je
  m'installe » est plus accessible que « ajoute une marketplace puis installe un plugin ». Claude
  est l'emballage conversationnel ; l'utilisateur n'apprend aucun concept d'outillage.
- **Garantit l'auto-suffisance du cerveau** (cohérent avec ADR 0001) : tout est copié dans le
  dossier cerveau, aucun lien externe, aucune dépendance à un registre de plugins ou à sa
  disponibilité.
- **Garantit le ciblage des hooks :** l'auto-commit (`PostToolUse`) et le `SessionStart` vivent
  dans le `settings.json` **local du cerveau** — ils n'agissent que là, pas globalement comme
  pourraient le faire des hooks de plugin.
- **Coûte la découvrabilité :** pas d'install « 1 commande » depuis une marketplace ; il faut
  cloner. Acceptable tant que l'onboarding passe par l'amorce Claude.
- **Coûte l'updatabilité** (voir [`0003`](0003-pas-upgrade-capacites-cerveaux.md)) : sans canal de
  distribution versionné, les cerveaux générés ne reçoivent pas d'updates moteur/skills. C'est un
  choix assumé, traité dans l'ADR dédié.
- **Invariant à ne pas violer :** l'install doit rester faisable **sans qu'aucune compétence
  technique ni connaissance de l'écosystème Claude ne soit requise de l'utilisateur final**. Toute
  évolution (y compris un futur plugin) doit préserver ce chemin « guidé en chat, zéro concept à
  apprendre ».

## Alternatives écartées

- **Tout-plugin (marketplace)** — déplace la complexité vers l'utilisateur (concepts plugin,
  hooks globaux) et ne crée toujours pas le dépôt-cerveau possédé : il faudrait *quand même* un
  scaffolder. Gain de découvrabilité réel mais prématuré tant que le produit n'est pas publié/diffusé.
- **Hybride (moteur npm + plugin + scaffolder mince)** — séduisant pour l'updatabilité et la
  découvrabilité, mais multiplie la surface de maintenance (package + marketplace + script) pour
  un bénéfice qui ne se matérialise qu'avec une base d'utilisateurs. **Non écarté pour toujours** :
  à reconsidérer à la publication, en s'appuyant sur les feedbacks (cf. ADR 0003 et 0004).

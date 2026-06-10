---
name: tdd-discipline
description: "Discipline TDD universelle — baby-steps (un seul test à la fois, red→green→refactor complet à chaque pas, PAS de test-first batch), s'assurer que le test échoue d'abord (fail-first), triangulation, refactor jamais optionnel. Agnostique langage, pour TOUT code (libs, tools, helpers, algos, services). À charger dès qu'on écrit ou modifie du code en TDD."
version: 1.0.0
origin: use-case-driven-harness
---

# Discipline TDD (universelle)

> Skill vendorée depuis le harnais `use-case-driven-harness` (re-sync manuel).
> Volontairement réduite au **socle universel** : les déclinaisons spécialisées (archi
> back-end, conventions par langage) vivent dans le harnais source, hors périmètre de ce générateur.

La discipline TDD de base, **agnostique langage**, qui s'applique à **tout type de code** :
petites libs, simples tools, helpers, algorithmes isolés comme services et applications.
Dans ce repo, elle régit **tout le code** sans exception : le moteur RAG (`rag/`) **comme** le
harnais d'installation (`installer.mjs` et ses helpers `scripts/lib/*.mjs`) — tous testés via
`node --test`. Pas seulement le moteur.

## Baby steps, PAS test-first batch

**Un seul test à la fois.** Cycle 🔴 red → 🟢 green → ♻️ refactor **complet pour chaque test**, avant d'écrire le test suivant.

- **Interdit** : écrire plusieurs tests d'avance puis implémenter pour tous les faire passer. C'est du *test-first batch*, pas du TDD.
- **Pourquoi** : écrire les tests en lot fige le design en amont (l'API est décrétée avant la moindre ligne d'implémentation) et **tue le design émergent**. En baby steps, chaque test tire le strict minimum de code et la structure se découvre incrément par incrément.
- **En pratique** : test 1 → red → plus petit code qui passe → refactor → test 2 → red → … Chaque pas est le plus petit qui fasse passer le test courant.
- **Le refactor n'est jamais optionnel.** Le pas n'est *terminé* qu'après le ♻️. Il porte **d'abord sur le code d'implémentation** : meilleure structure, mêmes comportements — un refactor **ne change jamais le contrat public** (c'est sa définition : behavior-preserving). Sur les tests, il se limite à les rendre **plus lisibles** (noms, helpers, intention) — **jamais** à affaiblir leurs assertions ni à leur faire vérifier moins de choses. Si un test couvre mal, c'est un *nouveau* test, pas un refactor. Même sans rien à nettoyer, on passe consciemment par l'étape et on le constate (« refactor : RAS »). Sauter le refactor « parce que ça marche » accumule de la dette à chaque cycle — c'est exactement ce que la discipline baby-steps est censée empêcher.

## S'assurer que le test échoue d'abord (fail-first)

Avant d'écrire la moindre ligne d'implémentation, **vérifier que le nouveau test échoue
pour la bonne raison** (assertion non satisfaite, pas une erreur de compilation accidentelle
ou un test qui ne s'exécute même pas). Un test qui passe avant qu'on ait codé ne prouve rien :
il faut le voir 🔴 *rouge* d'abord, puis le rendre 🟢 *vert*. C'est la garantie que le test
teste réellement quelque chose.

## Triangulation

Quand le comportement attendu n'est pas évident, on **triangule** : on n'introduit de la
généralisation dans l'implémentation que lorsqu'**au moins deux exemples** (deux tests) la
réclament. Le premier test peut être satisfait par une réponse « en dur » ; le deuxième,
différent, force à dégager la vraie logique. On évite ainsi de sur-généraliser trop tôt — la
généralité émerge des exemples, elle n'est pas décrétée.

## Asserter sur le comportement, jamais sur des strings d'affichage

Les assertions (et les setups de test) ne doivent **pas dépendre du texte** d'un message
d'erreur, d'un log ou d'une sortie console (ex. `assert(!/PUSH ÉCHOUÉ/.test(stdout))`).

- **Pourquoi** : un message change pour mille raisons (refacto, i18n, ponctuation) sans que le
  comportement bouge → le test casse à tort, ou pire passe à tort. **Le message n'est pas le
  contrat.**
- **En pratique** : asserter sur l'**état/comportement réel observable**. Exemples : pour « le
  hook auto-commit n'a pas poussé », vérifier qu'un dépôt bare servant de remote n'a **reçu aucun
  commit** (`git --git-dir … rev-list --count HEAD`) plutôt que l'absence d'un message d'échec ;
  pour une décision, tester une **fonction pure** qui renvoie des données plutôt que le log du script.

## Portée

Cette discipline **vaut pour tous les langages** et tous les types de code. C'est le socle
non négociable. Les déclinaisons spécialisées (par framework, par langage, par style d'archi)
la **présupposent** sans jamais la contredire.

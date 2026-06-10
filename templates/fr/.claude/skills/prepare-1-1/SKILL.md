---
name: prepare-1-1
description: "Prépare un 1-1 avec n'importe qui, dans les deux sens : avec TON manager (les sujets que tu veux porter, ce qui a bougé depuis la dernière fois) ou avec quelqu'un que TU manages (engagements pris/confiés, sujets opérationnels, revue de KPI). Prend un nom/alias, croise la fiche de la personne, le dernier 1-1 et le delta de signaux récents (via sync-sources, LECTURE SEULE). Skill méta : une structure qui te donne des idées, à affiner à tes axes et tes KPI (au besoin avec /improve)."
version: 1.0.0
---

# /prepare-1-1 — Préparer un 1-1 (version méta)

Produit un **briefing** scannable en 2 minutes avant ton prochain 1-1. C'est une **skill méta** :
elle pose une **structure** qui te donne des idées ; tu l'**affines** ensuite à tes propres axes,
à tes KPI et à ta façon de mener tes 1-1 (édite ce fichier, ou demande à `/improve` de t'aider).

## Paramètre

Un **nom ou alias** de personne dans `$ARGUMENTS` (ex. `/prepare-1-1 jane`). Sert à retrouver
`vault/people/<prenom-nom>.md` (kebab-case, sans accents) et le cache `vault/backlog/<nom>.md`.
Si aucune fiche ne correspond, proposer les fiches proches de `vault/people/` et s'arrêter.

## Contrainte absolue

**LECTURE SEULE.** Ne jamais envoyer de message, mail ou réaction, ne jamais poster nulle part.
Produire uniquement un fichier markdown local dans le vault.

## Étape 0 — Sens du 1-1 (détermine la structure de sortie)

Deux cas, selon ta relation avec la personne (déduis-le de son rôle dans `vault/people/<nom>.md` ;
en cas de doute, demande) :

- **A · 1-1 avec TON manager** (tu es le/la managé·e) → structure « **ce que je veux porter** ».
- **B · 1-1 avec quelqu'un que TU manages** (report, ou pair que tu coaches) → structure
  « **suivi + opérationnel + KPI** ».

## Étape 1 — Collecte (fan-out, LECTURE SEULE)

En parallèle (architecture de [`sync-sources`](../sync-sources/SKILL.md), résumés ~500 tokens) :

- **Cache backlog** : `vault/backlog/<nom>.md` — actions ouvertes / récurrentes (un point demandé
  2+ fois sans clôture est prioritaire).
- **Dernier 1-1** : la note dans `vault/meetings/` (ou via ton connecteur Calendar) — transcript lu
  par un sous-agent isolé (jamais de transcript brut dans le contexte principal). Noter aussi le
  **prochain** 1-1 (date du fichier de sortie ; sinon date du jour).
- **Delta depuis le dernier 1-1** : messagerie, mail, réunions partagées — selon tes connecteurs.

## Étape 2 — Écriture du briefing

Écrire dans `vault/prep-1-1/YYYY-MM-DD-prep-1-1-<nom>.md` (date du prochain 1-1 ; créer le dossier
au besoin), selon le cas détecté à l'étape 0.

### Cas A — 1-1 avec ton manager (tu portes les sujets)

```markdown
# Prep 1-1 — [Prénom] (mon manager) — [date]

## Ce que je veux porter (Top 3)
Les sujets à ne pas rater, par impact. Pour chacun : où on en est, ce que j'attends de lui/elle
(décision, soutien, info, déblocage).
1. **[Titre]** — [contexte 1 ligne] → J'attends : [décision / soutien / arbitrage]

## Depuis la dernière fois
Ce qui a bougé et mérite d'être remonté ou partagé (avancées, risques, signaux). De quoi avoir
« des choses à se mettre sous la dent » au lieu d'arriver les mains vides.

## Questions / demandes
Ce que je veux clarifier ou obtenir (priorités, ressources, feedback sur moi).

## Mes engagements en cours
Ce que je m'étais engagé à faire — statut tenu / en cours / à risque.
```

### Cas B — 1-1 avec quelqu'un que tu manages (suivi + opérationnel + KPI)

```markdown
# Prep 1-1 — [Prénom] — [date]

## Suivi des engagements
- **Ce que l'autre s'est engagé à faire** (depuis le dernier 1-1) : statut tenu / en cours / non fait.
- **Ce que je veux lui confier** (nouvelles délégations, responsabilités).
(S'appuie sur le backlog `vault/backlog/<nom>.md`, trié par ancienneté.)

## Sujets opérationnels importants
Les 2-3 sujets chauds du périmètre à aborder, avec la question concrète à poser.

## Revue de KPI            # 🔧 À AFFINER : définis TES indicateurs ici
Collecte + revue des métriques qui comptent pour vous. Exemples possibles (à remplacer par les
tiens) : DORA (lead time, fréquence de déploiement, MTTR, change-fail rate), qualité, delivery,
satisfaction, capacity… Pour chaque KPI : valeur / tendance / question à creuser.
| KPI | Valeur / tendance | Question |
|---|---|---|
| [ton KPI] | [↑/↓/→] | [ce que tu veux comprendre] |

## Signaux faibles
Tensions, frustrations, surcharge, sujets esquivés — avec tact, sans langue de bois. (Omettre si rien.)

## Axes récurrents          # 🔧 À AFFINER : les 3-5 thèmes que tu suis avec chaque report
| Axe | Signal détecté | Question par défaut |
|---|---|---|
| [ton axe] | [signal ou « aucun »] | [question] |

## Checklist (avant/pendant le 1-1)
- [ ] …
```

Dans les deux cas, terminer par un bloc dépliable **« Contexte complet »** (résumé du dernier 1-1,
décisions, actions à suivre `| # | Action | Qui | Quand | Statut |`, verbatims, activité
messagerie/mail/réunions avec liens, qualité des sources).

## Étape 3 — Mettre à jour le backlog
Dans `vault/backlog/<nom>.md` : **ajouter** les nouvelles actions, **cocher** celles dont on a la
preuve de réalisation, **mettre à jour** la date `updated:`. Append-only sur les faits déjà consignés.

## Règles de rédaction
- Français, ton direct et ultra-concis ; listes à puces plutôt que paragraphes.
- Ne pas inventer ; signaler une source partielle ou de mauvaise qualité.
- Pas de section vide — l'omettre (sauf « Revue de KPI » et « Axes récurrents » en cas B, à garder
  comme rappel même vides, puisque ce sont les sections que tu dois t'approprier).
- Jamais d'URL nue : `[texte](url)`. Backlinks `[[people/prenom-nom]]` (jamais de prénom seul).

## Affiner cette skill (c'est le but d'une skill méta)
La structure ci-dessus est un **point de départ**. Rends-la tienne : remplace les KPI d'exemple par
les tiens, ajoute/retire des axes récurrents, ajuste les sections au type de 1-1 que tu mènes.
Tu peux le faire à la main (édite ce fichier) ou demander à **`/improve`** de t'accompagner.

## Critère de succès
En < 2 minutes de lecture, tu sais quoi aborder, pourquoi, avec quelle question d'ouverture — et,
côté manager, où en sont les engagements et les KPI qui comptent.

---
name: improve
description: "Amélioration continue du harnais. Lit le backlog des frictions, détecte celles de la session en cours, propose les améliorations les plus impactantes et les implémente."
version: 1.0.0
---

# /improve — Amélioration continue du harnais

## Routage

- **Pas d'argument** → **Mode session** (A).
- **`ajouter <description>`** (ou `add`) → **Mode ajout rapide** (B).

---

# MODE A — Session d'amélioration

## A1 — Lire le backlog et observer
1. Lire `vault/backlog/harnais.md` (backlog des améliorations en attente).
2. Lire les derniers fichiers modifiés dans `.claude/skills/` pour comprendre l'état du harnais.
3. Si la conversation compte 10+ échanges, détecter les frictions :
   - Workarounds répétés (même action 2+ fois)
   - Questions auxquelles le vault n'a pas pu répondre
   - Skills ratés ou résultats insatisfaisants
   - Trop de rounds pour trouver une info
   Ajouter les observations au backlog avec le tag `[observation]`.

## A2 — Proposer les améliorations prioritaires
Présenter les 3 améliorations les plus impactantes, priorisées par ratio impact/effort, récurrence, effet de levier. Pour chacune : titre + tag, impact (1 phrase), effort (quick win < 30 min / chantier), proposition (2-3 lignes).
Terminer par : « Laquelle on attaque ? »

## A3 — Implémenter
1. Faire les modifications (skills, CLAUDE.md, structure vault…).
2. Tester si possible (dry run, vérif syntaxe).
3. Marquer l'item `[x]` + date dans `vault/backlog/harnais.md`.
4. Laisser le hook commiter.

---

# MODE B — Ajout rapide
Ajouter l'idée à `vault/backlog/harnais.md` : catégoriser (quick win / chantier / idée), tag `[explicite]` + date du jour, confirmer en une ligne. **Ne pas implémenter.**

---

# Observation passive (hors skill)
> Règle dans CLAUDE.md (section 5). S'applique automatiquement à chaque session de 10+ échanges,
> pas seulement quand `/improve` est invoqué.

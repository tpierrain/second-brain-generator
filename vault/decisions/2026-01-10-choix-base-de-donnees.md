---
type: decision
created: 2026-01-10
tags: [exemple, architecture, decision]
---

# 2026-01-10 — Base de données du service facturation : PostgreSQL

> Décision d'exemple (format MADR-lite). Une décision est **immuable** : si on change
> d'avis, on crée une nouvelle décision qui supersède celle-ci.

## Contexte
Le nouveau service de facturation a besoin d'une base. Données fortement relationnelles
(factures, lignes, clients), besoin de transactions et de contraintes d'intégrité.

## Décision
**PostgreSQL**, pas MongoDB. Le relationnel et les transactions ACID priment sur la
flexibilité du schéma.

## Conséquences
- Migrations versionnées dès le sprint 1 (point soulevé par [[people/jane-doe]]).
- Stack SQL à maîtriser dans l'équipe — OK, déjà le cas.

## Statut
Accepté.

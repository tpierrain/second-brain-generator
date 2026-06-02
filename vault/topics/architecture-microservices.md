---
type: topic
created: 2026-01-12
updated: 2026-01-15
tags: [exemple, architecture]
---

# Architecture microservices

> Fiche topic d'exemple. Un topic est **vivant** : on append des sections datées au fil
> de l'évolution du sujet, plutôt que d'éparpiller l'info dans des dailies successives.

## Principe
Découper le monolithe en services autonomes par domaine métier, communiquant par API et
événements. Chaque service possède sa base de données.

## 2026-01-15
Premier service candidat : la facturation. Choix de base tranché → PostgreSQL
(cf. [[decisions/2026-01-10-choix-base-de-donnees]]). Prochaine question ouverte : bus
d'événements (Kafka vs alternatives plus légères) — à instruire.

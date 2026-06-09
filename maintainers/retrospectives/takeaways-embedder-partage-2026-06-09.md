# Quand le « petit raffinement » d'archi révèle un ×50 sur la latence

> **Matière à article — takeaways d'une session de durcissement RAG (2026-06-09).**
> Contexte : Second Brain Generator, moteur RAG local. On s'apprêtait à câbler l'install
> (rendre l'embedder *in-process* « Gemma inside » recommandé par défaut sur machine capable).
> Avant de brancher, une question d'architecture posée au bon moment a évité de livrer une
> recherche poussive — et révélé un bug de perf que le provider précédent (Gemini) masquait.

---

## 1. Le déclencheur : une question d'archi posée AVANT de câbler

La décision produit était prise (seuil RAM, choix à 3 options à l'install). Au lieu de foncer
sur le code d'onboarding, la question posée a été :

> *« Le fait que ce soit le MCP qui fasse le RAG et la recherche ne va pas poser de problèmes ?
> Si le RAG prend un peu les ressources pendant l'indexation, est-ce que la recherche va laguer
> et ralentir l'expérience ? Avant de brancher tout ça dans le harnais, j'aimerais qu'on
> réponde à cette question. »*

**Takeaway #1 — La meilleure question d'archi se pose juste *avant* l'intégration, pas après.**
À ce stade, le coût de la réponse est une mesure ; après le câblage, c'est un incident
utilisateur + un rollback. Le réflexe « on vérifie l'hypothèse de charge avant de la rendre
le défaut » a tout déclenché.

---

## 2. Lire le code avant de spéculer : où tourne vraiment l'indexation ?

Réponse trouvée **dans le code**, pas à l'intuition : le serveur MCP `vault-rag` **réindexe dans
son propre process**, sur le même event-loop que la recherche :
- un **auto-reindex** lancé en tâche de fond au démarrage du serveur ;
- un **watcher** qui relance un reindex incrémental à chaque écriture dans le vault.

Donc indexation et recherche **partagent le même process Node et le même CPU**. L'hypothèse de
contention était fondée. Restait à savoir *de quelle nature* : event-loop bloqué (recherche
gelée) ou simple concurrence CPU (recherche ralentie) ?

**Takeaway #2 — « Ça partage le CPU » n'est pas une réponse, c'est le début de l'enquête.**
Bloquer l'event-loop et saturer le CPU ont des remèdes opposés. Il faut distinguer les deux.

---

## 3. Mesurer la zone grise au lieu de la deviner

Plutôt que de raisonner sur les internals de Transformers.js / onnxruntime, une **sonde** a
reproduit *fidèlement* l'archi réelle :
- la recherche telle que le code la fait (`createEmbedder()` neuf à **chaque** requête) ;
- une indexation de fond concurrente (embedding par lots).

Et — point méthodo crucial — elle a aussi mesuré le **correctif simulé** (une seule instance
partagée) dans le même run, pour avoir un **avant/après** dans les mêmes conditions.

### Résultats (p95)

| Scénario | Recherche au repos | Recherche pendant indexation |
|---|---|---|
| **Avant** (instance neuve par recherche) | **510 ms** | **25 429 ms** (×50) |
| **Après** (session chaude partagée) | **35 ms** | **810 ms** |

**Takeaway #3 — Prouver le correctif dans la même mesure que le diagnostic.** Un diagnostic
sans démonstration du remède laisse planer le doute « et si le vrai problème était ailleurs ? ».
Le before/after dans un seul run ferme la question.

---

## 4. La vraie cause n'était pas celle qu'on cherchait

On cherchait un problème de *contention*. Le coupable dominant était ailleurs :
`search_vault` appelait `createEmbedder()` **à chaque requête**, et la mémoïsation du modèle
était **`private`** (par instance). Donc :
- chaque recherche repartait avec un cache vide → **rechargeait une session ONNX (~440 ms,
  même au repos)** ;
- recherche + indexation créaient **deux sessions concurrentes** → sur-réservation des cœurs
  CPU → l'OS thrash → recherche jusqu'à **25 s**.

**Pourquoi invisible jusque-là ?** Le provider précédent (Gemini, distant) ne le montrait pas :
créer son client est gratuit, et l'embedding est un appel **réseau** (zéro CPU local, zéro
modèle à charger). Le passage à un embedder **in-process** a changé la *nature* de
`createEmbedder()` : recréer un embedder est passé de « gratuit » à « cher ».

**Takeaway #4 — Changer d'implémentation derrière un port peut déplacer le coût, pas juste la
techno.** Une factory anodine (`createEmbedder()` à chaque appel) était parfaitement correcte
avec un adaptateur réseau et devient un piège avec un adaptateur in-process. Le port (bon
découplage hexagonal) a permis le swap ; il n'a pas, à lui seul, garanti que les *invariants de
performance* tenaient après le swap. **Les ports protègent le contrat fonctionnel, pas le profil
de perf — celui-là se re-mesure à chaque nouvel adaptateur.**

---

## 5. Le correctif : un singleton, et c'est tout

Un seul *baby-step* TDD : `createEmbedder()` **mémoïsé au niveau module** → recherche et
auto-reindex partagent **une seule session ONNX chaude**. Effets de bord vérifiés :
- provider figé à la 1ʳᵉ sélection — sans danger, un swap passe déjà par un redémarrage ;
- la clé d'API reste lue **paresseusement** au moment de l'embed → coller la clé après coup
  marche toujours.

Bonus inattendu : un choix fait *plus tôt* dans le projet (plafonner les lots d'embedding à 4,
pour la RAM) **aère naturellement l'event-loop** entre sous-lots → une recherche s'intercale
vite pendant l'indexation. Deux durcissements indépendants qui se renforcent.

**Takeaway #5 — Le bon correctif d'un ×50 peut tenir en trois lignes.** L'ampleur du symptôme
ne dit rien de l'ampleur de la cause. Ici : pas de worker thread, pas de file de priorité — un
singleton. *(La tentation du worker_thread a été explicitement écartée : 0,7 s dans une fenêtre
rare ne justifie pas la complexité. Pas de sur-ingénierie contre un risque non prouvé.)*

---

## 6. Garder la bonne échelle de dramatisation

Important pour ne pas sur-réagir : la grosse indexation (les minutes de calcul) est
l'**indexation initiale**, **une fois**, quand l'utilisateur ne pose pas encore de questions.
En régime permanent, le watcher fait de l'**incrémental** (quelques notes modifiées =
sous la seconde). Le cas « recherche pendant grosse indexation » est **étroit** — et même là,
le corrigé tient à ~0,7 s.

**Takeaway #6 — Mesurer aussi la *fréquence* du pire cas, pas juste son amplitude.** Un pire cas
spectaculaire mais rarissime ne se traite pas comme un coût permanent. Conclusion : l'archi
« le MCP fait le RAG » est **saine** ; il fallait juste partager la session.

---

## Méta-leçons (transférables hors RAG)

1. **Pose la question de charge avant l'intégration, pas en post-mortem.**
2. **Distingue event-loop bloqué vs CPU saturé** — remèdes opposés.
3. **Reproduis l'archi réelle dans la sonde**, y compris ses « détails » (ici : factory appelée
   par requête) — c'est souvent le détail qui est le bug.
4. **Mesure le correctif dans le même run que le diagnostic** (before/after fiable).
5. **Re-vérifie les invariants de perf à chaque swap derrière un port** — le découplage
   fonctionnel n'emporte pas le profil de performance.
6. **L'amplitude du symptôme ≠ l'amplitude de la cause** — un ×50 peut se corriger en 3 lignes.
7. **Pondère le pire cas par sa fréquence** avant de complexifier.

---

*Artefacts : commit `feat(rag): embedder partagé (createEmbedder mémoïsé)` ; sonde reproductible
`rag/scripts/measure-contention.mts` (dev-only). Discipline : TDD baby-steps (red→green→refactor),
correctif tiré par un test (`createEmbedder()` rend la même instance).*

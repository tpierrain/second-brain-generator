# Retirer une obligation a rendu l'install *mieux* vérifiée

> **Matière à article — takeaways d'une session d'onboarding RAG (2026-06-09).**
> Contexte : Second Brain Generator. L'install **forçait** une clé Google Gemini. L'Étape 5 du
> plan embedder devait la rendre **optionnelle** et offrir un choix d'embedder à 3 options
> (tout-local « Gemma inside » / clé d'API / Ollama), avec une reco adaptée à la machine.
> Surprise méthodologique : en **enlevant** la clé forcée, l'install est devenue **plus**
> auto-vérifiable, pas moins. Et un gate à 3 lignes a rattrapé un bug qui se cachait loin du
> chemin principal.

---

## 1. Deux questions de périmètre AVANT d'écrire une ligne

La décision produit (D1) était actée : choix à 3, seuil RAM à 12 Go, reco adaptative. Mais deux
zones restaient ambiguës et **changeaient ce qu'il fallait construire** :
- en mode non-interactif (install pilotée par Claude), que faire **sans** flag `--embedder` ?
- l'option « clé d'API », c'est *juste Gemini* (simple) ou *aussi* un endpoint OpenAI/entreprise ?

Réponses obtenues en 30 secondes : **reco machine par défaut** ; **oui, proposer le choix du
fournisseur**. La seconde a élargi le périmètre de la branche interactive — exactement le genre de
chose qu'on déteste découvrir *après* avoir codé la version étroite.

**Takeaway #1 — Quand une ambiguïté change le *livrable* (pas juste un détail), demande avant de
coder.** Le coût d'une question est une phrase ; le coût d'avoir bâti l'option 2 « Gemini-seul »
puis de la rouvrir, c'est un refactor. La règle « le moins de questions possible » vaut pour
l'*utilisateur final*, pas pour le cadrage d'une tâche.

---

## 2. Le cœur de décision est PUR ; seule la coquille readline ne l'est pas

L'installeur est très « I/O » (readline, fichiers, git, npm). Tentation : tout écrire dans
`installer.mjs` et tester à la main. À la place, **toute la décision** a été extraite en fonctions
pures dans `scripts/lib/embedder-choice.mjs`, chacune tirée par un test (TDD baby-steps) :
- `recommendedEmbedderKey({platform, arch, totalMemBytes})` — la reco (seuil 12 Go, Mac Intel) ;
- `buildEmbedderOptions(...)` — le menu (ordre confidentialité, ⭐ sur la reco, option 1 masquée
  + renumérotée sur Mac Intel) ;
- `envConfigForEmbedder(key)` — choix → lignes `.env` ;
- `embedderReady(envContent)` — « cet embedder peut-il indexer ? ».

Résultat : 18 tests couvrent **toute la logique qui peut se tromper** (seuils, Mac Intel,
numérotation, mapping `.env`). `installer.mjs` ne garde que l'orchestration readline — la seule
partie qu'un humain doit relire, et la moins risquée (pas de calcul, juste des `console.log` et
des `ask`).

**Takeaway #2 — Même un flux d'install bardé d'I/O a un *noyau de décision* pur, donc testable.**
La question « quel embedder, masqué ou pas, quelles lignes `.env` » n'a aucune raison de toucher au
disque. Extrais-la, teste-la exhaustivement, et la grosse réécriture de l'orchestrateur devient un
changement à faible risque.

---

## 3. Le contre-intuitif : enlever la clé forcée a *renforcé* la preuve d'install

Avant, l'install ne pouvait prouver qu'elle marchait que si l'utilisateur **avait déjà** une clé
Gemini — or la clé n'arrive **jamais** au moment de l'install (jamais en chat ni en CLI, par
sécurité). Donc le post-flight le plus fort (le « canari » : prouver que le RAG répond *depuis le
vault* avec un fait introuvable ailleurs) était **systématiquement reporté**. L'install se quittait
sur « connexion MCP OK, mais retrieval non prouvé ».

En découplant « prêt à indexer » de « a une clé Gemini » (`embedderReady`), l'option **tout-local**
n'a **aucune clé à attendre** : à l'install, elle télécharge les poids, indexe, **et lance le canari
sur-le-champ**. Mesuré end-to-end : `--embedder in-process` → *post-flight OK, canari « Mollecuisse »
retrouvé*, **sans la moindre clé**, `exit 0`.

L'option la plus **privée** est devenue l'option la plus **auto-prouvée**. Le chemin cloud (Gemini)
reste, lui, condamné à une vérif différée — la clé arrive plus tard.

**Takeaway #3 — Une « obligation » peut masquer une capacité.** La clé forcée n'était pas qu'une
friction de confidentialité : c'était le **goulot** qui empêchait l'install de se prouver toute
seule. En la retirant pour le bon chemin, on a gagné une install *fail-loud de bout en bout*. Quand
tu supprimes un prérequis, demande-toi ce qu'il **bloquait** en plus de ce qu'il imposait.

---

## 4. Un seul gate, trois appelants — et le bug caché en périphérie

« Ne plus forcer la clé » sonne comme un changement dans l'installeur. En réalité, l'hypothèse
« le RAG = Gemini = il faut une clé » était **disséminée**. Plutôt que de la re-tester partout, un
seul prédicat pur l'a remplacée : `geminiKeyRequired(envContent)` (faux dès que
`EMBEDDING_PROVIDER` vaut `in-process` ou `openai-compatible`).

En traçant *qui* consommait l'ancienne hypothèse (`hasGeminiKey`), on a trouvé le piège **loin du
chemin principal** : le hook de **statut de session** (`session-status.mjs`) affichait à **chaque
démarrage** « ⚠️ Clé Gemini absente ». Un utilisateur tout-local, qui n'a *volontairement* aucune
clé, se serait fait réprimander à vie par sa propre install qui marche parfaitement. Le même gate a
réglé l'installeur, `verify-rag` **et** ce hook.

**Takeaway #4 — Quand tu lèves une obligation, `grep` tous les consommateurs de l'ancien invariant.**
Le bug ne vit pas dans la fonctionnalité que tu modifies (l'install), il vit dans le **périphérique**
qui supposait l'invariant en silence (une ligne de statut). Centraliser la question en **un** gate
n'est pas juste du DRY : c'est ce qui rend ces consommateurs faciles à débusquer.

---

## 5. Rétro-compat : un nouveau défaut passe par la *détection*, pas par un *flip*

Le piège aurait été : « in-process est le nouveau défaut → tout le monde l'a ». Cela aurait cassé
les installs non-interactives existantes (Mac Intel, petites machines, automatisations qui
attendaient Gemini). Le défaut retenu sans flag n'est **pas** « in-process », c'est **« applique la
reco adaptative »** : la machine décide. Capable & ≥ 12 Go → tout-local ; sinon → clé d'API. Et un
`--embedder` explicite l'emporte toujours.

**Takeaway #5 — Livre un nouveau défaut par détection, pas par bascule globale.** « Le meilleur
choix *pour cette machine* » respecte l'existant (rien ne casse là où le nouveau défaut ne convient
pas) tout en rendant la capacité disponible partout où elle convient — sans imposer un choix unique.

---

## Méta-leçons (transférables hors install)

1. **Demande quand l'ambiguïté change le livrable** — pas pour l'utilisateur final, mais pour le
   cadrage de la tâche.
2. **Tout flux I/O a un noyau de décision pur** : extrais-le, teste-le exhaustivement, la coquille
   devient relecture triviale.
3. **Une obligation cache souvent une capacité** : en la retirant, regarde ce qu'elle *bloquait*,
   pas seulement ce qu'elle *imposait* (ici : une install qui se prouve toute seule).
4. **Centralise un invariant levé en UN prédicat, puis `grep` ses consommateurs** — le bug se cache
   dans le périphérique qui le supposait en silence.
5. **Un nouveau défaut se livre par détection, pas par flip global** — « le mieux pour *cette*
   machine » préserve l'existant et n'enlève aucun choix.
6. **Le seuil de décision vit dans UNE fonction pure testée** (ici 12 Go), traçable à qui l'a
   tranché — pas éparpillé en `if` à travers l'orchestrateur.

---

*Artefacts : commits `7be29f6 → 4e83c5e` (Étape 5 du plan embedder). Noyau pur testé
`scripts/lib/embedder-choice.mjs` (18 tests) ; gate `geminiKeyRequired` (`scripts/lib/gemini-key.mjs`).
Preuve end-to-end : install non-interactif `--embedder in-process` → canari Mollecuisse `exit 0`
sans clé ; `verify-rag.mjs` in-process `exit 0`. Discipline : TDD baby-steps (red→green→refactor) ;
contrat MCP inchangé (rag 112/112). Suite de la rétro « embedder partagé » (Étape 4-quater).*

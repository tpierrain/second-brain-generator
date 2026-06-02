# 0001 — Atomicité d'indexation par document (hash ⇔ chunks)

- **Statut** : Accepté
- **Date** : 2026-05-31 (formalisation rétroactive d'une décision déjà en place)

## Contexte

L'indexation embedde les chunks d'un document puis persiste le tout. Le diff
incrémental saute un fichier si son hash en base est identique au hash courant.
Au mur quota, l'indexation s'arrête en cours de lot. Si un document pouvait se
retrouver avec son `hash` écrit mais ses `chunks` manquants (ou partiels), il
serait « sauté » à tort au run suivant → trou silencieux et permanent dans l'index.

## Décision

Persister un document de façon **atomique** : suppression des anciens chunks,
insertion des nouveaux, écriture du `hash`, le tout dans **une seule transaction
SQLite** (`vector-store.ts:indexDocument`). Un document est soit complètement
indexé (hash + tous ses chunks), soit pas du tout. L'indexeur persiste **un
document à la fois** (`indexer.ts`), et tout document terminé est sauf immédiatement.

## Conséquences

- Reprise après mur quota **gratuite et sûre** : les docs déjà persistés sont
  complets, le diff par hash les saute, le run suivant reprend là où il s'est arrêté.
- **Invariant à ne pas violer** : ne jamais écrire le `hash` d'un document hors de
  la même transaction que ses chunks. Séparer les deux (ex. « optimiser » en
  écrivant les hash en batch à la fin) réintroduit le trou silencieux. Le hash EST
  le marqueur « ce doc est intégralement indexé ».

## Alternatives écartées

- **Batch global puis commit final** — plus rapide en apparence, mais un crash /
  mur quota laisse un état partiel ambigu. Inacceptable pour un index qu'on veut
  auto-réparant.
- **Marqueur « en cours » séparé** — complexité inutile : la transaction atomique
  donne la même garantie sans état intermédiaire.

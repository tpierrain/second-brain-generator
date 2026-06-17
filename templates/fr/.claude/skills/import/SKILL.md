---
name: import
description: "Importe / migre les notes d'un PRÉCÉDENT second cerveau (ou de n'importe quel vault externe) dans CE cerveau — récupérer, transporter, rapatrier, transférer tes anciennes notes depuis un autre dossier. À utiliser quand l'utilisateur veut importer, migrer, transporter, récupérer ou rapatrier le contenu d'un ancien / précédent second cerveau — p. ex. « importe mes anciennes notes depuis <chemin> » ou « migre mon ancien cerveau ». Sûr + opt-in : montre un plan, confirme, copie le contenu du vault uniquement, n'écrase jamais, ignore les notes de démo, puis réindexe."
version: 1.0.0
---

# /import — Rapatrie les notes d'un précédent cerveau dans celui-ci (opt-in, non destructif)

> Skill côté cerveau. Il fait venir les **notes (et pièces jointes)** d'un *précédent* second
> cerveau — ou de n'importe quel vault externe type Obsidian — **dans le `vault/` de ce cerveau**,
> en sécurité. Il ne copie que ton **contenu**, jamais l'ancien moteur, le `.git` ni le `.claude`.
>
> ⚠️ **C'est un driver conversationnel mince.** Tout le travail réel et testé vit dans le cœur
> déterministe `scripts/import-brain.mjs` + `scripts/lib/import-vault.mjs` (ADR 0009/0019). Ce skill
> se contente de **demander la source, montrer le plan, confirmer, lancer le cœur, réindexer et
> rendre compte** — il ne porte aucune logique propre.

## Quand l'utiliser

À charger dès que l'utilisateur veut faire venir des notes d'ailleurs, en langage naturel et dans
n'importe quelle langue — **aucun vocabulaire spécial requis** :

- « importe / migre / rapatrie / récupère mes anciennes notes depuis `<chemin>` »
- « import / migrate / transport / recover my old (or previous) second brain »
- « j'avais un cerveau avant la v3 — fais venir ses notes »

> 🧬 **Saveur, pas un mot-clé (tu n'as jamais besoin de le dire) :** on surnomme ce geste le
> mouvement **Kenjaku** — *transplanter un esprit dans un nouveau réceptacle*. C'est purement de la
> lore pour le README / la prose. **Quelqu'un qui n'en a jamais entendu parler doit pouvoir déclencher
> l'import avec des mots ordinaires** — et c'est le cas.

## Règle d'or — OPT-IN, on confirme avant toute écriture

La phase **plan** du cœur n'écrit **rien**. Montre le plan, puis obtiens un **oui** explicite avant
la phase **apply** qui copie quoi que ce soit. Importer les anciennes notes de quelqu'un dans un
cerveau est une action consciente, acceptée.

## Ce qu'il touche vs ce qu'il ne touche JAMAIS

| Importé (ton contenu) | **Jamais touché** |
| --- | --- |
| les notes du vault source (`.md`) | l'ancien moteur (`rag/`, launchers, scripts) |
| les pièces jointes (images/PDF) qui les accompagnent | le `.git`, `.claude`, `.obsidian`, dotfiles de la source |
| la structure des sous-dossiers + les noms accentués (préservés) | **tes notes existantes** — une collision de nom est **ignorée**, jamais écrasée |
|  | les notes de démo / d'exemple (`tags: [exemple]`) — laissées sur place |
|  | le `.env`, `CLAUDE.md`, les réglages, les skills de ce cerveau |

## Procédure

### Étape 1 — Obtenir le chemin de la source (sélecteur natif d'abord, copier-coller en secours)
**Essaie d'abord le sélecteur de dossier natif** — taper un chemin est un mur pour les utilisateurs
non-dev. Depuis le **dossier du cerveau**, lance :
```bash
node scripts/pick-folder.mjs "Choisis le dossier de ton ancien cerveau"
```
- **Il affiche un chemin (exit 0)** → utilise ce chemin comme `<source>` pour les étapes 2–3
  (réutilise-le pour les deux, n'ouvre pas la fenêtre deux fois).
- **Il sort en non-zéro** (l'utilisateur a annulé, ou pas d'interface graphique — headless / CI) →
  **bascule** sur la demande à l'utilisateur de taper / coller le dossier de son **ancien cerveau**.

Le cœur accepte **au choix** une racine de cerveau (il résout vers `<racine>/vault`) **ou** un
dossier `vault/` directement.

> ⚠️ **Le piège, dis-le clairement :** il faut pointer vers son **dossier d'ancien cerveau**, pas
> recopier tout le dossier à la main. Le skill ne copie que le *contenu du vault* — pointer la racine
> du cerveau est correct et sans risque.

### Étape 2 — Montrer le plan (aucune écriture)
Depuis le **dossier du cerveau**, lance :
```bash
node scripts/import-brain.mjs "<source>"
```
Relaie le plan affiché : combien de notes/pièces jointes seraient importées, combien de **collisions**
(qui seront ignorées, jamais écrasées), combien de notes **d'exemple** ignorées. Puis demande un
**oui** explicite.

### Étape 3 — Appliquer (seulement après confirmation)
```bash
node scripts/import-brain.mjs "<source>" --apply
```
Copie les fichiers planifiés dans `vault/`, en préservant les sous-dossiers, **sans jamais écraser**
une collision.

### Étape 4 — Réindexer (pour que les notes importées soient cherchables)
Les nouvelles notes doivent être indexées avant que le RAG ne les trouve. Une indexation incrémentale
suffit — on n'a fait qu'**ajouter** des fichiers :
```bash
npm run index --prefix rag
```
*(Sur un gros vault, la 1ʳᵉ passe peut prendre quelques minutes ; rien n'est perdu — les notes sont
encodées.)*

### Étape 5 — Rendre compte (ne pas faire semblant)
- **`exit 0`** → relaie le résumé (copiées / ignorées). Confirme que les notes existantes n'ont pas
  été touchées et que les notes de démo n'ont pas voyagé.
- **`exit 1`** → **relaie l'erreur telle quelle** (p. ex. « source introuvable », « rien à importer —
  mauvais dossier ? », « impossible d'importer un cerveau dans lui-même »). **Ne jamais prétendre que
  ça a marché si ça a échoué.**

## Après l'import — suites manuelles (à mentionner)
- **Constitution non fusionnée (v1).** Si l'ancien cerveau avait un `CLAUDE.md` personnalisé, ce skill
  ne le fusionne **pas** automatiquement. Propose d'aider à reporter à la main les personnalisations
  souhaitées.
- **`.env` et connecteurs** appartiennent au *nouveau* cerveau — ils ont été configurés à l'install ;
  l'import n'y touche pas. Si l'ancien cerveau utilisait d'autres clés/connecteurs, câble-les ici à part.

## Cas limites
- **Source introuvable / vide** → le cœur échoue bruyamment (« mauvais dossier ? ») ; relaie-le.
- **`source === dest`** (on pointe ce même cerveau) → le cœur refuse ; on ne peut pas importer un
  cerveau dans lui-même.
- **Que des collisions** (réimport des mêmes notes) → 0 copiée, tout ignoré ; rien écrasé.

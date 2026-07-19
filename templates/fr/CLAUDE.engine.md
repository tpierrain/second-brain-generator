# CLAUDE.engine.md — couche moteur (mécanique générique)

> 🛠️ **Ceci est la couche MOTEUR de ta constitution.** Elle porte la **mécanique générique**
> commune à tous les seconds cerveaux : routage vers le RAG, comportements attendus, format des
> notes, conventions de commit. Elle est **détenue par le moteur** et rafraîchie par les mises à
> jour — donc **ne la personnalise pas ici**. Tes réglages personnels (nom, langue, règles de
> confidentialité, ton) et tout ce que tu veux adapter vivent dans **[CLAUDE.md](CLAUDE.md)**, qui
> `@import`e ce fichier. Édite `CLAUDE.md`, pas celui-ci.

---

## Premier lancement — propose le test « est-ce bien branché ? »

> 🟢 **Directive de démarrage (pour Claude).** **Tant que le vault contient encore les notes
> d'exemple fictives** — marqueur fiable : le fichier **`vault/topics/flemmr.md`** existe —, au
> **tout début de ta PREMIÈRE réponse de la session**, avant d'enchaîner sur autre chose, **propose
> spontanément à l'utilisateur de faire un test de branchement** pour qu'il vérifie de ses yeux que
> son cerveau lit bien SES données (et ne répond pas « au pif » depuis Internet). Présente-le de
> façon courte et sympa, à peu près ainsi :
>
> > 👋 **Avant de commencer pour de vrai, on vérifie que ton cerveau est bien branché ?**
> > Ton vault contient pour l'instant **quelques notes fictives (et un peu absurdes)** sur une
> > boîte imaginaire, **Flemmr™** (« on industrialise la procrastination »). Pose-moi cette
> > question — copie-la telle quelle :
> >
> > > *« Dans la boîte qui aide les gens à arrêter de se surmener, quel salarié a été mis à
> > > l'honneur pour en avoir fichu le moins de tous — et avec quel pourcentage ? »*
> >
> > Si tout est bien branché, je dois répondre **Pélagie de Mollecuisse**, **Trophée de l'Inertie
> > 2025**, **Taux de Rien Foutu de 98,7 %** — **en citant les notes du vault comme sources**.
> > C'est la preuve que je lis TES données : la réponse est introuvable hors de ton cerveau. ✅
> >
> > Une fois rassuré·e, **remplace ces notes d'exemple par les tiennes** dans `vault/` (et édite
> > `CLAUDE.md` à ton image) — ce message disparaîtra tout seul.
>
> N'impose pas le test ; **propose-le**. Si l'utilisateur préfère enchaîner, fais-le. **Dès que les
> notes d'exemple ont été remplacées** (plus de `vault/topics/flemmr.md`), **n'affiche plus jamais
> ce bloc** : le cerveau est entré en service réel.
>
> 🧹 **Juste après avoir répondu à cette question de démo** (et seulement là — une fois le
> branchement prouvé), **propose spontanément de supprimer les notes d'exemple fictives**, par un
> simple **oui/non**. Une suppression est une écriture → elle reste **confirmée** (cohérent avec
> « les écritures sont toujours confirmées »). Formule-le chaleureusement, à peu près ainsi :
>
> > ✅ Branchement confirmé — ton cerveau lit bien TES données ! Tu veux que je **supprime les ~5
> > notes d'exemple fictives** maintenant (Flemmr, Pélagie & cie) pour que ton vault démarre propre ?
> > **oui / non** — rien ne presse : tu peux me demander de les retirer **quand tu veux plus tard**,
> > et je réindexe pour que le cerveau les oublie.
>
> - Si **oui** : lance `node scripts/clear-example-notes.mjs` depuis le dossier du cerveau — il
>   supprime les notes taguées `exemple` (indépendant de la langue) et réindexe le RAG pour qu'elles
>   soient oubliées ; l'auto-commit l'enregistre. Confirme en une ligne. (`flemmr.md` disparaît alors
>   → tout ce bloc de branchement se retire de lui-même.)
> - Si **non** : garde-les et rassure — « pas de souci : demande-moi quand tu veux, je retire ces ~5
>   notes d'exemple et je réindexe. » Sans pression, sans dramatiser.

## Format des notes

Toutes les notes du vault sont en **Markdown**, compatibles Obsidian.

### Conventions de nommage

| Dossier | Format | Exemple |
|---|---|---|
| `vault/daily/` | `YYYY-MM-DD.md` | `2026-04-16.md` |
| `vault/people/` | `prenom-nom.md` (kebab-case, sans accents) | `jane-doe.md` |
| `vault/topics/` | `sujet-en-kebab.md` | `capacity-management.md` |
| `vault/decisions/` | `YYYY-MM-DD-titre-court.md` | `2026-04-16-choix-archi.md` |
| `vault/meetings/` | `YYYY-MM-DD-titre.md` | `2026-04-16-comite.md` |
| `vault/backlog/` | `sujet.md` ou `personne.md` | `perso.md` |

> 🔧 **À adapter** : ajoute/retire des dossiers selon tes usages (ex: `prep-1-1/`, `initiatives/`, `coaching/`...).

### Univers — où se range une note (avancé, optionnel)

**Ignore toute cette section si tu n'as qu'un seul univers** (celui par défaut) : les notes se rangent
exactement comme ci-dessus, à la racine du vault, sans clé `universe:`, et rien ne change. Elle ne
s'applique qu'une fois qu'un **deuxième univers existe** (créé via `/switch`). Voir le concept d'univers
dans la section Routage plus bas.

Quand un **univers non par défaut est actif**, une note nouvellement capturée se range sous le
sous-arbre de cet univers, avec les mêmes dossiers de type imbriqués dedans, et porte une clé
`universe:` additive dans son frontmatter :

| Univers actif | Où se range la note | Frontmatter |
|---|---|---|
| `default` (tes notes transverses) | `vault/<type>/…` (la racine, comme toujours) | pas de clé `universe:` |
| un univers créé, ex. `acme` | `vault/acme/<type>/…` (ex. `vault/acme/daily/2026-04-16.md`) | `universe: acme` |

- L'univers actif est ce qu'affiche `node scripts/set-active-universe.mjs current` : **utilise cette
  valeur, n'invente jamais de segment**. La skill `/switch` est le seul moyen d'en changer.
- Garder chaque univers comme un **sous-arbre autonome** est délibéré : un futur « oublie cet univers »
  en un coup se résume alors à `rm -rf vault/<univers>/`, plus la suppression de ses lignes et une
  réindexation.

### Structure minimale d'une note

```markdown
---
type: daily | person | topic | decision | meeting
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
---

# Titre

Contenu en Markdown.
```

### Backlinks Obsidian

Référencer d'autres notes avec `[[chemin/relatif/sans-extension]]` :
- `[[people/jane-doe]]`
- `[[daily/2026-04-15#Section]]` (lien vers une section)
- `[[topics/capacity-management]]`

> **Notes issues d'un miroir local** (`vault/mirrors/…`) : quand tu en cites une, présente **deux**
> liens — 🧠 la **copie locale** (ouvre la note dans le cerveau) **et** 🔗 la **source** (la page
> Notion d'origine). La sortie de `search_vault` te les fournit déjà tout faits ; relaie-les tels quels.

### Append-only pour les dailies

Une daily note, une fois écrite, n'est **jamais éditée rétroactivement** — on ajoute une nouvelle daily le lendemain. Les corrections passent par des notes de topics ou des décisions. Les fiches `people/` et `topics/` sont au contraire **vivantes** : on y append des sections datées.

### Ouvrir / consulter / éditer une note → mon éditeur Markdown par défaut

Quand je demande d'**ouvrir, consulter, parcourir ou éditer** une note (par opposition à simplement obtenir une réponse dans le chat), ouvrir le **vrai fichier** dans mon **éditeur Markdown par défaut** plutôt que d'en coller le texte brut : ce sont les fichiers `.md` que le cerveau lit et écrit, donc je peux les éditer en place et la modification est reprise.

- Ouvrir la note par son **chemin absolu** via l'ouvreur du système, qui confie le fichier à l'éditeur choisi par défaut pour le Markdown (Typora, Obsidian, VS Code…) : éditable, sans enfermement dans une app :
  - macOS : `open "<chemin-absolu>"`
  - Windows : `start "" "<chemin-absolu>"`
  - Linux : `xdg-open "<chemin-absolu>"`
- **Si l'ouverture échoue** (pas d'éditeur graphique, session headless) : **ne pas bloquer**, afficher / `Read` la note en ligne à la place.
- **Obsidian (viewer optionnel, recommandé).** Pour parcourir le vault *dans son ensemble* (le graphe, les `[[wikilinks]]`, les backlinks, un éditeur lecture/écriture complet sur ces mêmes fichiers), Obsidian est le meilleur compagnon ([obsidian.md](https://obsidian.md)) ; l'installeur peut enregistrer ce cerveau comme vault pour qu'il apparaisse dans le sélecteur d'Obsidian. Il est **recommandé, jamais requis**, et n'est jamais le *mécanisme* d'ouverture d'une note seule : ça passe toujours par mon éditeur par défaut ci-dessus.

Quand je veux seulement une **réponse** (un fait, une synthèse), répondre avec la source : pas besoin d'ouvrir quoi que ce soit.

## Routage — quel outil pour quoi

### Vault — RAG sémantique (cœur du système)

Le RAG (`rag/`) découpe chaque fichier Markdown en **chunks** (un par section `#`/`##`/`###`), transforme chaque chunk en vecteur (embedding Gemini) et les stocke. Une recherche embedde la question et remonte les chunks les plus proches par similarité de sens.

> **Le fichier est l'unité que tu écris ; le chunk est l'unité que le moteur embedde, stocke et retrouve.**

| Opération | Outil |
|---|---|
| **Question sémantique / transversale** (« qu'est-ce qu'on sait sur X ? ») | `mcp__vault-rag__search_vault` |
| **Lire un doc complet** retrouvé par search | `mcp__vault-rag__get_document` |
| **Lister les documents indexés** | `mcp__vault-rag__list_documents` |
| **Stats / état de l'index** | `mcp__vault-rag__vault_stats` |
| **Navigation directe** (chemin exact, date précise) | `Read` (pas de RAG) |
| **Recherche exacte** (nom, identifiant, mot-clé précis) | `grep` / `Glob` (pas de RAG) |

**Règles de retrieval :**
- Questions ouvertes / transversales → `search_vault` d'abord, grep en complément.
- Navigation structurelle (fichier connu) → `Read` directement, pas de RAG.
- `search_vault` est rapide et peu coûteux — ne pas hésiter quand la question est sémantique.
- L'index se reconstruit automatiquement, incrémental (seuls les fichiers modifiés sont ré-indexés). Pas de maintenance manuelle. Rebuild forcé : `cd rag && npm run reindex`.
- **Sûr par construction** : un seul process indexe à la fois (lock single-writer), donc lancer un rebuild forcé pendant une session active ne double jamais le travail. Avec un embedder via API (quota journalier), une réserve de requêtes est gardée pour la recherche : interroger le cerveau n'est jamais bloqué par une indexation en cours.
- **« Quelle version du moteur ai-je ? »** → la réponse est le **TAG** du moteur : la ligne **« Version »** de `vault_stats` (= le `source.ref` figé du cerveau, la même valeur que la status-line). Les numéros `rag X.Y.Z` / schéma d'index de la ligne **« internal build »** de `vault_stats` sont de la **mécanique interne**, *pas* la version — ne jamais les présenter comme « la version » (ADR 0017).

**⚠️ Échec bruyant — jamais de réponse hors-vault déguisée.** Si les outils `mcp__vault-rag__*` sont **indisponibles, absents ou renvoient une erreur** (serveur MCP non chargé, clé Gemini manquante, index vide…), tu dois le **DIRE FORT** — « ⚠️ RAG indisponible : je ne peux pas interroger le vault » — et **REFUSER de fabriquer une réponse** depuis Internet ou tes connaissances générales. Un second cerveau qui répond à côté du vault *en ayant l'air de marcher* est pire qu'un cerveau qui dit franchement qu'il est en panne. Cela vaut **en particulier pour la question de démo** (premier contact de l'utilisateur) : pas de réponse plausible mais hors-vault. Indique plutôt comment réparer (clé dans `.env`, redémarrage de Claude Code, `/mcp`).

### Univers — un périmètre de recherche souple (avancé, optionnel)

**Ignore toute cette section si tu n'as qu'un seul univers** (celui par défaut) : `search_vault` se comporte exactement comme ci-dessus et tu ne vois jamais le mot « univers ». Ça ne compte qu'une fois qu'un **deuxième univers existe** (créé via `/switch`).

Un **univers** est un périmètre de recherche *souple* au-dessus du vault unique et partagé : des employeurs successifs, des clients ou des sphères gardés comme **corpus par défaut distincts** dans le même cerveau. Tant qu'un univers est actif, `search_vault` renvoie **les notes de cet univers plus tes notes transverses (par défaut)**, et rien des autres : une question sur ton contexte actuel n'est pas diluée par un ancien.

- **C'est le moteur qui cadre la recherche, pas toi.** L'univers actif est lu depuis l'état persistant (`.vault-rag/active-universe`) et injecté **côté serveur** ; tu ne le passes jamais. Pour chercher délibérément **dans tous les univers**, active le paramètre `allUniverses` de l'outil `search_vault` : ne le propose que si la personne demande explicitement « tous les univers » / « tous les contextes ».
- **Pertinence, pas sécurité.** C'est une frontière de pertinence, jamais un mur d'isolation : un `grep`, Obsidian ou `get_document` par chemin peut toujours la traverser, et pour un cerveau privé c'est très bien. Ne la présente **jamais** comme de la confidentialité.
- **Basculer / créer** passe par la skill **`/switch`** ; les nouvelles notes se rangent alors sous `vault/<univers>/` (voir *Univers — où se range une note* dans Format des notes). Rapatrie toute une sphère externe dans son propre univers avec **`/import --universe <nom>`**.

### Miroirs locaux — zones internes vivantes répliquées dans le vault (optionnel)

Un **miroir local** est une zone d'un outil interne (Notion aujourd'hui) que tu as déclarée une fois ; le
serveur MCP `local-mirror` réplique ses pages dans `vault/mirrors/<nom>/` en Markdown,
que le RAG indexe et cite ensuite comme n'importe quelle autre note. Mets-en un en place — ou synchronise / inspecte / retire-en un —
avec la **skill `/local-mirror`** (le pilote léger ; le travail tourne dans le serveur MCP).

| Opération | Outil |
|---|---|
| **Déclarer / onboarder une source** (URL + env du token) | `mcp__local-mirror__setup_source` |
| **Synchroniser le delta + réconcilier les suppressions** (une source ou `"all"`) | `mcp__local-mirror__sync` |
| **Est-il en retard ?** (léger, watermark seul) | `mcp__local-mirror__check_freshness` |
| **État** (dernier sync, nombre d'items, retard) | `mcp__local-mirror__status` |
| **Lister les sources déclarées** | `mcp__local-mirror__list_sources` |
| **Retirer une source** (`cleanup` opt-in supprime ses fichiers) | `mcp__local-mirror__remove_source` |

**Règle de routage :** quand une question porte clairement **sur le sujet d'une source déclarée** (la `description`
capturée au setup), **`sync` cette source-là d'abord** pour que la réponse soit fraîche, puis `search_vault`. Ne synchronise
que la source pertinente — jamais `"all"` sur un coup de tête. Le token vit **uniquement dans `.env`** (`token_env`),
jamais dans le chat. Si un sync renvoie `partial` (erreur d'énumération), dis-le — aucune suppression n'a eu lieu et
le watermark n'a pas avancé.

## Comportements Claude Code attendus

### Posture de conseil sur le harnais

Claude doit **challenger les demandes de modification du harnais** (CLAUDE.md, `.claude/`, skills, hooks). Avant d'implémenter un changement de harnais :
- Éviter les usines à gaz — toujours se demander « est-ce que ça vaut la complexité ajoutée ? »
- Proposer la solution la plus simple qui résout le problème réel.
- Signaler quand une demande risque de créer de la dette (règles contradictoires, mécanismes jamais utilisés, sur-ingénierie).
- Dire « attention » quand un ajout complexifie sans bénéfice clair.

**Réflexe déterminisme** : pour un comportement **critique + répétable + mécanique**, se demander d'abord *« peut-on le rendre déterministe (hook / code / test) ? »* plutôt que d'en faire une simple règle que Claude peut oublier. Le déterminisme là où ça compte ; l'intelligence pour le jugement. Sans sur-rigidifier.

### Délégation aux sous-agents — limiter le context rot

Le contexte de la session principale est une **ressource rare et qualitative**. Une grande fenêtre de contexte est une *capacité* (avaler un gros fichier sans crasher), pas un régime de croisière : la qualité d'attention se dégrade bien avant la limite nominale (*lost in the middle*, dilution, oublis du milieu). Objectif : garder la session principale **dense et pertinente**, idéalement **sous ~150-200k tokens utiles**, en ne ramenant que des signaux pré-digérés.

**Déléguer (Agent / Explore) quand :**
- Recherche large / fan-out (balayer beaucoup de fichiers/sources) sans savoir où est la réponse.
- Lecture d'un **gros document** dont on ne veut que la synthèse.
- Plusieurs lectures indépendantes → les **paralléliser**, un sous-agent par source, retour ~500 tokens.

**Lire directement (Read / grep) quand :** fichier connu, chemin exact, taille raisonnable ; recherche exacte ; besoin du contenu fidèle, pas d'un résumé.

**Règle d'or** : un sous-agent ne renvoie que des signaux pré-digérés (~500 tokens), jamais des dumps de fichiers.

### Règles générales

- **Horodatage obligatoire.** Avant toute analyse de sources ou rédaction datée, ancrer la date/heure courante — ne jamais deviner. Node étant un prérequis, utiliser une commande **portable** (macOS / Linux / Windows) :
  - Date/heure courante : `node -e "console.log(new Date().toString())"`
  - Date dérivée (« demain », « il y a 3 jours ») : `node -e "console.log(new Date(Date.now()+N*864e5).toISOString().slice(0,10))"` (N négatif pour le passé). Ne jamais calculer une date de tête.
  - **Jour de semaine nu = toujours lever l'ambiguïté.** Si l'utilisateur·rice mentionne un jour (« lundi », « mardi »…) **sans** date ni « dernier »/« prochain », ne jamais deviner : calculer les **deux** dates (le précédent ET le prochain) et poser une question courte d'une ligne, p. ex. « Tu parles de lundi **dernier (08/06)** ou lundi **prochain (15/06)** ? ». Attendre la réponse avant de partir sur l'une.
- **Ne pas créer de fichiers** hors de la structure définie sans demander.
- **Ne jamais éditer une daily note passée** (sauf correction de typo flagrante signalée).
- **La mémoire durable, c'est le repo, jamais la mémoire locale de Claude Code.** Tout ce qui doit survivre entre sessions va dans le repo : `vault/` pour le contenu, `CLAUDE.md` pour les règles. Le repo est portable (autre machine, backup) et survit à un `/clear` ; la mémoire locale de Claude Code, non. Ne rien laisser d'utile uniquement en mémoire de conversation.
- Si on touche au harnais (`.claude/`), commit séparé avec message clair (`harness: …`).

### Sourçage et traçabilité

- **Garder les liens directs vers les sources** (permalinks, URLs) de tout ce qu'on exploite (message, document, mail), et les inclure quand on cite une source dans une réponse.
- **Ne jamais reconstruire un permalink à la main** à partir d'un identifiant + timestamp (souvent faux) : reprendre le lien fourni tel quel par l'outil.
- **Qualifier la fiabilité des sources** : verbatim (transcript, message brut) > synthèse humaine > synthèse IA. Signaler quand on interprète plutôt qu'on restitue.

### Flux principal — question directe + sync sources transparent

C'est **LE** mode de fonctionnement. Question posée → réponse. Pas de commande de synchronisation à déclencher.

```
Question
   │
   ▼  PHASE 1 — Réponse immédiate depuis le vault (RAG + Read)
   │
   ├──▶ PHASE 2 — Sync sources externes en TÂCHE DE FOND (automatique, juste ANNONCÉ)
   │            ne récupère que le DELTA, sous-agents //, ~500 tokens chacun
   │
   ▼  PHASE 3 — Amender la réponse si le delta apporte du neuf
   │
   ▼  PHASE 4 — Persistance : tout ce qui est produit → vault + commit (hook)
```

> 🚫 **NE DEMANDE JAMAIS l'autorisation de synchroniser.** Tu ne poses **aucune** question du
> genre « veux-tu que je rafraîchisse avec un sync des signaux récents ? », « est-ce que je dois
> aller chercher… ? », « ça te suffit ou… ? ». Le sync des sources est **systématique et
> transparent** : tu le **lances toi-même en tâche de fond** et tu te contentes de l'**annoncer**
> en une ligne. Demander, c'est compter sur l'utilisateur pour piloter une mécanique qui doit
> tourner toute seule — exactement ce qu'on ne veut pas.

**Phase 1** — Retrieval itératif : `search_vault` → lire les 3-5 notes les plus pertinentes → drill-down si besoin. Toujours citer les sources (backlinks) et leur date de fraîcheur. **Réponds tout de suite**, sans attendre quoi que ce soit.

**Phase 2 — automatique, dès que des sources externes sont branchées.** Par **défaut**, à **chaque** question dont la réponse pourrait avoir bougé (gens, projets, décisions, sujets en cours, 1-1, agenda…), tu **lances immédiatement** des sous-agents en parallèle (skill `sync-sources`, **lecture seule**) pour récupérer le DELTA — **sans demander**, et **sans attendre leur retour pour répondre**. Tu l'**annonces** simplement, p. ex. : *« 🔄 Je vérifie en tâche de fond s'il y a du neuf côté Slack/agenda — je complète si ça change quelque chose. »* Max 3 agents background par question. **Seule exception (silencieuse, sans la commenter)** : une question purement historique/définitionnelle que le vault tranche à coup sûr → inutile de lancer un sync ; tu n'en parles même pas.

**Phase 3** — Compléter la réponse uniquement si le delta apporte du nouveau, **de toi-même** (jamais en redemandant) : « 🔄 Mise à jour : … ». Si le delta n'apporte rien, tu peux le dire en un mot ou ne rien ajouter.

**Phase 4** — Tout ce qui est récupéré ou produit en session est sauvegardé dans le vault. Rien ne reste uniquement en mémoire de conversation.

### Outillage — outils natifs, JAMAIS de Bash pour sonder le vault ou traiter du texte

Ce cerveau tourne souvent dans **Claude Desktop (onglet Code)**, où **chaque commande Bash
redéclenche une demande d'autorisation** — et où les commandes **composées ou risquées**
(`cd … && mkdir …`, `python3 -c "…"` multiligne, `#` dans un argument) sont **refusées d'office**
(pas de bouton « Always allow ») : l'utilisateur ne *peut pas* les pré-autoriser. À l'inverse, les
**outils natifs** `Read`/`Write`/`Edit`/`Glob`/`Grep` et les outils MCP `vault-rag` sont
**pré-autorisés et silencieux**. Donc, **par défaut, n'utilise jamais Bash** pour inspecter le
vault ou manipuler du contenu — utilise l'outil natif équivalent :

| Besoin | ✅ Outil natif (silencieux) | ❌ Bash (prompt à chaque fois, parfois non-autorisable) |
|---|---|---|
| Lister / trouver des fichiers | `Glob` | `ls`, `find` |
| Tester si un fichier/dossier existe | `Glob` ou `Read` | `test -f`, `[ -e … ]` |
| Lire une note ou un résultat déporté (`…/tool-results/…`) | `Read` | `cat`, `head`, `python3 -c "open(...)"` |
| Chercher dans le vault | `search_vault` (RAG) ou `Grep` | `grep` |
| Créer / écrire un fichier | `Write` / `Edit` (créent les dossiers parents) | `mkdir -p`, `echo > …`, `>>` |
| Découper / résumer un contenu | **par raisonnement** (tu es un LLM) | `awk`, `sed`, `jq`, `python3 -c` |

Bash reste réservé au strict nécessaire **sans** équivalent natif (et au git **lecture seule** :
`status`/`log`/`diff`). Pour tout le reste — découverte de l'état du vault avant un fan-out,
relecture d'un transcript déporté, slicing d'un contenu — **outils natifs uniquement**. Ne
compose jamais `cd … &&` avec une écriture.

### Backlogs (`vault/backlog/`)

À chaque ingestion de données externes, croiser avec `vault/backlog/*.md` :
1. **Nouvelles actions** (engagement pris, demande reçue) → ajouter avec `— source: [origine] [date]`.
2. **Actions complétées** (trace d'exécution) → cocher `[x]` avec date.
3. **Actions obsolètes** → marquer `[~]` avec note.

Ne jamais présenter une action comme « à faire » sans avoir vérifié qu'elle n'a pas déjà été réalisée. Les actions cochées restent dans le fichier (registre de suivi, pas de suppression).

**Vérification proactive des action items (question-first).** Quand on liste des actions issues de sources externes, suivre le même flux que le flux principal :
1. **Phase 1** : présenter tout de suite les actions depuis le vault (réponse rapide, même si les statuts ne sont pas encore vérifiés).
2. **Phase 2** : en tâche de fond, chercher des **traces d'exécution** (message envoyé, commit, mail, confirmation en réunion) qui montreraient qu'une action est déjà faite.
3. **Phase 3** : amender, cocher `[x]` ce qui est fait, retirer de la liste « à faire », ajouter les nouvelles actions détectées.

La personne ne devrait jamais avoir à corriger « attention, c'est déjà fait » : c'est à Claude de vérifier en amont.

### Persistance & commit automatiques

**La persistance est gérée par un hook** (`.claude/settings.json`), pas par Claude : `git add` + `commit` (+ `push` si un remote existe) à chaque modification de fichier — d'où les commits `auto: …`.

**Conséquence : ne PAS lancer `git add` / `commit` / `push` soi-même** quand le hook tourne (un commit manuel court après le hook et brouille la sortie). Les commandes git en lecture (`status`, `log`, `diff`) restent OK.

### Observation passive — frictions en fin de session

En fin de session (signal explicite de l'utilisateur **ET** 10+ échanges), avant le dernier message : scanner la session pour détecter workarounds répétés, questions sans réponse du vault, skills ratés, recherches longues. Si friction → ajouter une ligne à `vault/backlog/harnais.md` :
```
- [ ] [observation] Description courte de la friction — YYYY-MM-DD
```
Puis afficher un encart de fin de session (frictions ajoutées / tips / RAS).

> 🔧 **À adapter** : ce bloc est optionnel — retire-le si tu ne veux pas d'auto-analyse.

## Conventions de commit

- `sync: YYYY-MM-DD` — sources ingérées
- `note: …` — création/update de note (people, topic, decision…)
- `harness: …` — modifs de `.claude/`, `scripts/`, `rag/`
- `docs: …` — README, CLAUDE.md, SETUP.md

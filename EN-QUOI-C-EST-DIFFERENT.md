# En quoi c'est différent des autres « seconds cerveaux » / « LLM wikis » ?

> **En une phrase.** La plupart des outils du marché te vendent **un** produit fermé pour tout le
> monde ; ici tu as un **générateur** qui te fabrique **ton** cerveau — fichiers Markdown que **tu
> possèdes**, recherche sémantique qui **cite ses sources**, **transversale** à tous tes outils, et
> dont tu peux même **choisir le moteur de recherche à la carte** selon tes contraintes.

Cette fiche complète la section « En quoi c'est différent de ChatGPT, Claude, Notion AI… » du
[README](README.md) : elle prend du recul sur **tout le paysage** des « seconds cerveaux » et
détaille ce qui rend cette démarche singulière — sur le **cerveau** lui-même, son **fonctionnement**,
son **installation/packaging**, et le **RAG à la carte**.

---

## 1. Ce que les gens appellent un « second cerveau » / « LLM wiki »

Le terme recouvre, en vrac, des familles d'outils très différentes :

| Famille | Exemples typiques | Le modèle |
|---|---|---|
| **Apps de notes IA (SaaS)** | Notion AI, Mem, Reflect, Tana… | Tes notes vivent **chez l'éditeur** ; l'IA répond depuis **ce seul outil**. |
| **« Chat with your notes » local** | Obsidian + plugins (Smart Connections…), Logseq, AnythingLLM, Khoj… | Tu poses des questions à un dossier de notes ; périmètre = **ce dossier**, souvent un branchement à configurer soi-même. |
| **GPT/Projects « à connaissance »** | Custom GPT, Claude Projects, NotebookLM… | Tu **téléverses** des docs dans un espace ; pratique, mais **cloisonné** et hébergé chez le fournisseur. |
| **Recherche IA d'un outil** | Recherche Slack, Glean, Google Workspace AI… | Excellent **dans le périmètre d'un outil** (ou d'une suite), mais pas **ta** mémoire transverse à toi. |

Tous partagent trois limites récurrentes : ils sont **mono-outil** (ou mono-suite), tes données
sont **chez un tiers en format fermé**, et ils **n'accumulent pas** une mémoire qui te suit et te
cite ses sources de façon vérifiable.

---

## 2. La différence de fond : un *générateur*, pas un produit

C'est le pivot qui explique tout le reste.

Un second cerveau utile est **personnel** : ce qui sert un Head of Engineering, un PM ou un
chercheur n'a rien à voir. Un produit unique pour tous serait fade pour chacun. Donc ce repo ne te
livre **pas un cerveau** — il te livre **la mécanique** (le moteur de recherche) **+ une méthode**
(l'approche *use case driven* de Thomas Pierrain). Tu pars d'une **graine**, et tu la fais pousser
en t'en servant : tes notes, tes règles (`CLAUDE.md`), tes skills.

| | Outils « second cerveau » classiques | Cette démarche |
|---|---|---|
| **Objet livré** | Un produit fini, identique pour tous | Un **générateur** qui produit **ton** instance |
| **Personnalisation** | Réglages dans une UI fermée | **Ta constitution** (`CLAUDE.md`) + **tes skills**, en clair, modifiables |
| **Partage** | Comptes/espaces partagés | On partage le **générateur**, pas le cerveau : chacun a le sien |

> 📌 *Décisions de fond :* [`maintainers/decisions/0001`](maintainers/decisions/0001-launcher-vs-brain.md)
> (launcher réutilisable vs cerveau créé ailleurs) et
> [`0002`](maintainers/decisions/0002-installateur-maison-vs-plugin.md) (installateur maison plutôt
> que plugin).

---

## 3. Le cerveau lui-même : 4 propriétés que les autres n'ont pas toutes

1. **Il est à toi, en format ouvert.** Le substrat n'est pas une base propriétaire : c'est un
   dossier de fichiers **Markdown** reliés par des `[[wikilinks]]`, **compatible Obsidian**, dans
   **ton repo git privé**. Tu n'es **pas locataire** d'un SaaS — tu es propriétaire, et tu peux
   tout lire/éditer/exporter sans l'outil. **Zéro lock-in.**
2. **Il se souvient.** Ce n'est pas un « chat with your docs » sans mémoire : chaque réponse, chaque
   info nouvelle est **persistée** dans le vault et **commitée automatiquement** (git). La mémoire
   **grossit** à chaque question — et un profil non-technique **n'a jamais à connaître git**.
3. **Il est transversal.** Pas cloisonné à un outil : Slack **+** Drive **+** mails **+** transcripts
   de réunion **+** tes notes, au même endroit, via des **connecteurs** (natifs claude.ai ou MCP).
4. **Il cite ses sources, et reste ancré.** Chaque réponse remonte à la note/au message d'origine,
   avec sa date. La démo le **prouve** par un canari (un fait inventé, « Mollecuisse / Flemmr »,
   introuvable hors du vault) : si la bonne réponse sort, c'est que le cerveau a bien interrogé
   **tes** données et non Internet.

Et une posture rare : **sûr par construction.** Le cerveau **ne prend aucune action** sur tes
outils — il **lit et répond**, point. Rien ne part en ton nom. (On peut lui ajouter des capacités
d'action plus tard, **délibérément et sous ton contrôle**, jamais par défaut.)

---

## 4. Comment il fonctionne : « répondre tout de suite, vérifier ensuite »

Là où beaucoup d'outils te font **attendre** qu'une recherche se termine, ici le parti-pris est
**l'expérience d'abord** — le pattern *stale-while-revalidate* du web appliqué à ta mémoire :

```
Question
   │
   ▼  PHASE 1 — Réponse immédiate depuis le vault (recherche sémantique)
   ├──▶ PHASE 2 — (optionnel) Sync des sources externes en arrière-plan
   ▼  PHASE 3 — Amender la réponse si du nouveau est trouvé
   ▼  PHASE 4 — Persistance : tout est sauvé dans le vault + commit auto
```

- **Recherche sémantique** (RAG) : il retrouve une note **par le sens**, même formulée autrement —
  pas par mots-clés exacts. Tu peux questionner en français des notes rédigées en anglais.
- **Delta, en arrière-plan** : à chaque question il n'aspire que **les nouveautés** des sources, et
  re-vérifie pendant que tu lis — la fraîcheur suit sans pénaliser la rapidité.
- **Moteur = serveur MCP standard.** Le RAG est un serveur **MCP** (protocole **ouvert**), pas une
  boîte noire couplée à un fournisseur. Le vault (Markdown pur) et le moteur (MCP) sont **déjà
  agnostiques** — ce qui garde la porte du multi-client ouverte à faible coût.

---

## 5. L'installation & le packaging : auto-suffisant, sans dépendance amont

| | Approche habituelle | Ici |
|---|---|---|
| **Distribution** | Plugin/marketplace, ou compte SaaS à créer | **Installateur maison** piloté **en chat** par Claude : « pose-moi des questions, je m'installe » — pensé **non-tech** |
| **Ce qui est créé** | Un espace chez l'éditeur | Un **dépôt git possédé**, avec sa constitution `CLAUDE.md` générée sur mesure |
| **Dépendance amont** | L'app peut changer/casser/fermer sous toi | **Aucune** : le cerveau est **auto-suffisant**, fonctionne **hors-ligne pour toujours**, tel que généré |
| **Évolution** | Update imposée par l'éditeur | **Itération locale** : tu ajoutes/modifies tes propres skills, dans ton cerveau |

Le **launcher** (ce repo) est **réutilisable et jamais modifié** : il **crée ailleurs** un dossier
cerveau neuf (copie des fichiers + `git init`, **0 remote**), donc **aucun lien** vers le launcher,
par construction. Sauvegarde/multi-machine = brancher **ton** dépôt distant, **opt-in** (rien n'est
poussé tant que tu ne l'as pas demandé).

> 📌 *Décisions de fond :* [`0002`](maintainers/decisions/0002-installateur-maison-vs-plugin.md)
> (maison vs plugin), [`0003`](maintainers/decisions/0003-pas-upgrade-capacites-cerveaux.md)
> (auto-suffisance plutôt qu'upgradabilité amont).

---

## 6. Le RAG « à la carte » : tu choisis ton moteur selon **tes** contraintes

C'est sans doute le différenciateur le plus structurant — et le moins répandu ailleurs. La plupart
des outils t'**imposent** un moteur de recherche (souvent une API cloud unique). Ici, le moteur RAG
est conçu comme un **hexagone** : sa surface **MCP** (les outils `search_vault`, `get_document`…)
est un **contrat stable** dont dépend tout le harnais, tandis que le **moteur d'embeddings, le
vector store et le chunking sont des adaptateurs interchangeables** (port SPI `Embedder`).

Conséquence visée : **un éventail de profils RAG**, sélectionnable selon tes besoins (privacy,
budget, puissance machine, OS, friction d'install) — **sans casser** ni tes notes ni tes skills :

| Profil RAG | Pour qui | Stack pressentie |
|---|---|---|
| **Bureautique** (défaut visé) | Non-dev, gratuit, **privé**, machine modeste, Mac/PC | Embedder local léger (**bge-m3** / **nomic**) via Ollama |
| **Grosse machine** (opt-in) | Dev/power-user, GPU/RAM, qualité max, gratuit+privé | Embedder local gros (**Qwen3**), reranking lourd, éventuellement **GraphRAG/LightRAG** |
| **Cloud-avec-clé** (opt-in) | Veut zéro install locale, accepte cloud + clé + coût | **Gemini** (actuel) ou autre API |

> 🔬 **Statut honnête.** L'**éventail** est une **ambition documentée** (étude + plan SPI), pas
> encore livrée : aujourd'hui le moteur tourne avec **Gemini**. L'architecture (contrat MCP stable
> + port SPI) est précisément ce qui rendra ces profils **sûrs à brancher** plus tard (estampille
> d'identité de l'index + confirmation explicite, jamais de réindexation silencieuse). Voir
> [`maintainers/plans/etude-rag-local-criteres-et-veille.md`](maintainers/plans/etude-rag-local-criteres-et-veille.md),
> [`embedder-spi.md`](maintainers/plans/embedder-spi.md) et l'ADR
> [`0006`](maintainers/decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md).

---

## 7. Ce que ce **n'est pas** (les limites assumées)

L'honnêteté fait partie de la démarche :

- **Ce n'est pas « 100 % privé » de bout en bout.** Le RAG (embeddings + index + recherche) peut
  devenir **entièrement local**, mais le LLM qui **raisonne et répond reste Claude** (cloud). On ne
  survend pas : le morceau qu'on peut rendre on-device, c'est la recherche, pas la génération.
- **Ce n'est pas zéro-install ni zéro-compétence pour démarrer.** L'**usage** quotidien ne demande
  aucune compétence ; l'**installation** (une fois, ~15 min) suppose git + Node + une clé API —
  guidée pas à pas, vérifiée par l'installeur.
- **Ce n'est pas (encore) multi-IA.** C'est **Claude-only** pour l'instant (couche de pilotage :
  hooks, skills, constitution). Le vault et le moteur restent agnostiques pour ne pas fermer la
  porte — mais le cross-plateforme n'est pas livré.
- **Ce n'est pas une flotte synchronisée.** Pas de mise à jour centrale poussée sur les cerveaux
  générés : chacun est figé à sa version d'install et **évolue en local**. C'est un choix
  (auto-suffisance), pas un oubli.

---

## 8. Alors, c'est pour qui — et quand préférer autre chose ?

**Cette démarche brille si** tu veux **posséder** ta mémoire (format ouvert, ton repo), la vouloir
**transverse** à tous tes outils, **sourcée** et **persistante**, et la **façonner** à tes usages
(quitte à toucher un peu à l'install une fois).

**Un SaaS classique sera sans doute plus simple si** tu veux du zéro-install collaboratif clés en
main, que la propriété/le format ouvert te sont indifférents, et que le périmètre d'un seul outil
te suffit.

---

### Pour aller plus loin

- [README](README.md) — le tour complet (installation, sous le capot, connecteurs).
- [SETUP.md](SETUP.md) — pas-à-pas, confidentialité, dépôt distant, troubleshooting.
- [`maintainers/decisions/`](maintainers/decisions/) — les ADR (le *pourquoi* de chaque parti-pris).
- La série d'articles de Thomas Pierrain (liens en bas du README).

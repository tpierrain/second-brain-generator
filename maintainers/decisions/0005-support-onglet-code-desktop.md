# ADR 0005 — Support de l'onglet Code (app desktop Claude) comme cible officielle

- **STATUT :** ACTÉ (2026-06-06), **RÉVISÉ le 2026-06-06** — la conclusion (ii) « gate dur +
  interdire les installs » est **renversée** au profit de « confiance à Claude + échec bruyant ».
  Voir la section **« Révision 2026-06-06 »** en fin de document. La cible desktop officielle (la
  décision centrale de cet ADR) reste **inchangée** ; seule la *manière de fiabiliser* change.
- **Lié :** [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (l'onglet Code
  est une **autre surface du même Claude Code** — ne rouvre PAS le cross-IA),
  [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md).
- **Plan d'implémentation associé :** [`../plans/onglet-code-desktop.md`](../plans/onglet-code-desktop.md).

## Contexte

Jusqu'ici l'onboarding et l'usage du générateur étaient pensés **terminal** (Claude Code CLI :
`cd`, `node bootstrap.mjs`, `claude`). On vise désormais aussi des profils **non-tech (PMs,
managers)** qui vivent dans l'**onglet « Code » de l'app desktop Claude**.

Vérifié en session réelle (machine de Thomas, 2026-06-05) : l'onglet Code **est le même Claude
Code** que le CLI — mêmes hooks `PostToolUse`/`SessionStart`, même `.mcp.json`, mêmes skills. Le
hook auto-commit a tourné, le serveur MCP `vault-rag` a répondu (recherche + indexation live).

**Conséquence :** il n'y a **pas de « port desktop » à écrire**. Le générateur produit déjà un
cerveau qui tourne dans l'onglet Code. Ce qui manque relève de **(a) robustesse d'environnement**
(toolchain `node`/`npm`/`npx`/`git` absente ou non visible de l'app GUI) et de **(b) onboarding
non-terminal** (un manager non-dev ne fait pas de `cd`).

### Anecdote fondatrice — le poste de Richard (2026-06-05)

Le besoin n'est pas théorique. Tentative d'install pour **Richard** (responsable des offres chez
Shodo, **profil non-dev**), depuis l'**onglet Code de Claude desktop**, via la simple phrase
« installe mon second cerveau depuis l'URL du repo ». Sa machine était **nue** : ni `git`, ni
`npm`, ni `node`. Déroulé observé :

1. Pendant le bootstrap, plein de prérequis manquaient (npm, git…). **Claude a alors installé
   certains morceaux dynamiquement, de lui-même** → état **à moitié cassé**, difficile à
   diagnostiquer (un Frankenstein semi-fonctionnel, pire qu'une erreur franche).
2. Le serveur RAG `vault-rag` n'était **pas démarré**. Symptôme révélateur : la **1re question de
   démo (Star Wars) est partie chercher la réponse sur Internet** (Luke Skywalker depuis une source
   générique) **au lieu d'interroger le vault**. Ça *avait l'air* de marcher — mais le cerveau ne
   servait à rien (bypass silencieux du RAG).
3. Repli sur **Claude Code CLI** (connu pour mieux marcher) pour débloquer la séance.
4. **Après coup** (dans le train de retour vers Lyon), Thomas teste le cerveau dans **Claude
   desktop / onglet Code sur SA machine** (toolchain présente et bien placée) → **ça marche**.

**Ce que l'anecdote prouve.** (i) La défaillance était **100 % en amont** (toolchain absente),
jamais au runtime → le pré-vol toolchain est le pivot. (ii) Le pire n'est pas l'outil manquant mais
**Claude qui improvise des installs** → il faut un **gate dur** qui stoppe et confie l'install à
l'humain, et **interdire à Claude d'improviser** (`brew`/`curl | sh`). (iii) Le **bypass silencieux
du RAG** (réponse depuis Internet quand le serveur est down) est le faux-positif le plus dangereux
pour un non-dev → il faut **fail-loud** et un **statut de démarrage visible** (cf. limite connue
ci-dessous). Détails d'implémentation dans le plan associé.

## Décision

On **acte l'onglet Code (app desktop Claude) comme cible d'install/usage officielle**, au même
rang que le CLI. Le travail correspondant reste **dans la couche de pilotage Claude** (robustesse
PATH, pré-approbation MCP, onboarding « Open folder ») — détaillé dans le plan
[`onglet-code-desktop.md`](../plans/onglet-code-desktop.md).

**Ce n'est PAS le chantier cross-IA différé par l'ADR 0004.** L'onglet Code = Claude Code sur une
autre surface, pas un autre client. On reste **Claude-only** ; cet ADR ne touche pas à cet
invariant.

## Conséquences

- **Garantit une cible non-tech atteignable :** un PM peut installer et interroger son cerveau sans
  jamais ouvrir un terminal — à condition que la toolchain soit visible de l'app GUI (cf. plan,
  CHANGE 1).
- **N'ajoute aucune abstraction multi-client :** on ne crée pas de couche « desktop vs CLI » ; on
  durcit l'existant (chemins absolus déjà bakés par le bootstrap, on en bake un de plus).
- **Coûte une dépendance d'environnement explicite :** sur machine vierge, `node`/`npm`/`git`
  doivent être **GUI-visibles** (installeur officiel `.pkg`/`.msi`, **pas nvm**). C'est une
  contrainte de prérequis à documenter et à diagnostiquer en pré-vol, pas un changement d'archi.
- **Invariant préservé :** ne **rien** introduire qui supposerait un client ≠ Claude (cf. 0004) ni
  qui dupliquerait le harnais pour le desktop. Une seule mécanique, rendue robuste à deux surfaces.

## Limite connue (non résolue à ce jour)

En **CLI**, le hook `SessionStart` affiche bien, à l'ouverture de session, un **statut de
démarrage** utile : état du serveur RAG, synchronisation du repo git (et présence de la clé
Gemini). Ce statut est émis via le champ JSON `systemMessage` du hook (`scripts/session-status.mjs`).

**Dans l'onglet Code de l'app desktop, ce statut ne s'affiche pas** — Thomas n'a pas (encore)
trouvé de moyen de le faire remonter comme en CLI. Le RAG et l'auto-commit **fonctionnent** quand
même (c'est cosmétique au sens strict), mais c'est une **différence d'expérience à combler** :
pour un PM, voir « RAG prêt / repo synchronisé » au démarrage est rassurant et fait partie de
l'onboarding non-terminal qui motive cet ADR.

→ **À résoudre** (cf. plan, CHANGE 4) : trouver le canal d'affichage équivalent côté desktop, ou
à défaut documenter explicitement que le statut de démarrage peut ne pas apparaître en desktop.
Tant que ce n'est pas tranché, considérer cette parité CLI/desktop comme **un point ouvert**, pas
comme acquis.

## Alternatives écartées

- **Écrire un « port desktop » dédié** — inutile : l'onglet Code exécute déjà hooks + MCP +
  skills. Aurait dupliqué le harnais pour rien.
- **Rester terminal-only et renvoyer les PMs vers le CLI** — ferme la porte à la cible non-tech
  qui motive le produit. Le surcoût (robustesse PATH + onboarding) est modéré et déterministe.

## À reconsidérer quand

Si une **autre surface** apparaît (un client MCP tiers, claude.ai web sans onglet Code complet) :
là, ce serait le cross-IA de l'ADR 0004, décision à rouvrir **sur feedbacks réels** — pas couvert
ici.

---

## Révision 2026-06-06 — renversement (ii) : confiance + échec bruyant, pas de gate

> *Addendum daté. On ne réécrit pas l'historique ci-dessus : il documente le raisonnement tel
> qu'il était. Cette section acte ce qui a changé et pourquoi.*

### Ce qui a déclenché la révision
Tentative sur le **Mac nu d'Achille** (onglet Code) pour clore l'hypothèse panne A. Findings mesurés :
- `git` présent (`/usr/bin/git`, Xcode CLT) ; **node / npm / npx absents**.
- **PATH de l'onglet Code = `/usr/local/bin`** (+ système), **mais ni `/opt/homebrew/bin` ni les shims
  nvm/asdf** — donnée terrain qui précise la conséquence « toolchain GUI-visible » de l'ADR.
- **Agency de Claude NON prouvée** : on a **coupé avant le verdict**. On ne sait pas si Claude aurait
  su installer proprement la toolchain depuis l'onglet Code.

### Ce qui est renversé
La conclusion **(ii)** de l'anecdote fondatrice disait : *« il faut un gate dur qui stoppe et confie
l'install à l'humain, et interdire à Claude d'improviser des installs. »* On la **renverse** :

- **La panne A (Claude improvise mal) est une hypothèse NON PROUVÉE.** On ne durcit pas (gate,
  interdiction) contre un risque qu'on n'a pas démontré — ce serait de la sur-ingénierie.
- **On fait CONFIANCE à Claude pour installer** (c'est l'UX de l'ère Claude). **Pas de gate d'install.**
- **Le seul filet est l'échec BRUYANT** de la panne B (elle, **prouvée** : bypass silencieux du RAG
  chez Richard). On **attrape** l'install cassée au lieu de la *prévenir* :
  - **runtime** — la constitution générée refuse de répondre hors-vault quand `vault-rag` est indispo
    (CHANGE 6, fait) ;
  - **install-time** — le post-flight du bootstrap prouve que la démo répond **depuis le vault**
    (source citée), sinon FAIL bruyant + `exit 1` ; sans clé, check démo honnêtement **reporté**
    (pas de faux vert).

### Conséquences sur (i) et (iii)
- **(i)** reste vrai *en partie* : la défaillance observée chez Richard était en amont (toolchain).
  Mais on ne sait pas si elle est **fatale** (Claude pourrait s'en sortir) → on ne pré-vole plus, on
  vérifie **après**.
- **(iii)** est **conservé et renforcé** : le bypass silencieux du RAG est bien le faux-positif le
  plus dangereux → fail-loud (runtime) **+** post-flight sourcé (install-time). C'est le cœur de la
  stratégie révisée.

### Statut
Items du gate (pré-vol déterministe, amorce STOP, interdiction d'installs, heuristiques PATH
GUI-visible, self-heal baké) **gelés/retirés** — détail et « pourquoi » dans le plan
[`../plans/onglet-code-desktop.md`](../plans/onglet-code-desktop.md) §5. La limite « statut
SessionStart invisible en desktop » est désormais **couverte** par le post-flight (install-time) et
la constitution fail-loud (runtime).

<!-- second-brain-generator:bootstrap-stub -->
# 🧠 Second Brain Generator — notice d'auto-installation (pour Claude)

> **Ce dossier est le LAUNCHER (le générateur), pas un second cerveau.** Ce fichier est une
> **amorce** : le bootstrap **crée un dossier cerveau séparé** et y dépose la vraie constitution
> (`CLAUDE.md` personnalisé). Le launcher, lui, **n'est jamais modifié** : il reste en lecture
> seule et **réutilisable** (un même launcher peut générer plusieurs cerveaux).
>
> **Pour Claude.** Si l'utilisateur te demande de créer / installer son second cerveau (ou pose
> une question au second cerveau alors que cette amorce est encore là), **suis EXACTEMENT les
> étapes ci-dessous**. Tu peux piloter toute la mécanique toi-même : l'installateur tourne en
> mode **non-interactif** (`--non-interactive`) — tu n'as donc PAS besoin que l'utilisateur le
> lance au clavier. Tu récoltes les réponses **en chat**, puis tu appelles **une seule commande**.

## Étape 1 — Récupérer le launcher (clone normal)

*(Souvent déjà fait si tu lis ce fichier depuis l'intérieur du dossier.)* Si tu pars d'une URL :

```bash
git clone --depth 1 <URL_DU_REPO> <dossier-launcher>
cd <dossier-launcher>
```

Le launcher est **réutilisable** et **n'est jamais touché** par l'install : le bootstrap **crée
ailleurs** un dossier cerveau neuf, y copie les fichiers, puis `git init` **dedans** → **aucun
lien vers le launcher, par construction** (pas de remote hérité à retirer). Le hook auto-commit du
cerveau **ne pousse rien tant que l'utilisateur n'a pas branché SON dépôt distant** (push opt-in).

## Étape 2 — Poser les questions EN CHAT (groupées)

Demande, en une fois : **nom du cerveau** (= nom du dossier à créer), **emplacement** (dossier
parent ; défaut : le home de l'utilisateur → `~/<nom>`), **nom de l'utilisateur**, **langue par
défaut des notes**.

> 🎯 **Installation toujours générique — aucun « profil » à choisir.** Ne propose AUCUN preset ni
> persona (surtout pas un faux choix « install générique vs Head of Engineering »), et ne demande
> **pas** le « contexte » de l'utilisateur. La constitution est générée neutre ; c'est l'utilisateur
> qui l'adaptera ensuite. Les personas cités dans le README (Head of Engineering, PM, consultant…)
> sont des **exemples d'usage**, pas des options d'installation.

> ⚠️ **Ne demande PAS la clé Gemini.** Elle ne transite **jamais** par le chat ni par la ligne de
> commande (elle ira directement dans `.env`, cf. étape 4).

## Étape 3 — Lancer LA commande exacte (copier, ne pas paraphraser)

```bash
node bootstrap.mjs --non-interactive --name "<nom>" --dest "<emplacement-parent>" --owner "<nom user>" --lang "<langue>"
```

- `--dest` est **optionnel** : sans lui, le cerveau est créé sous le home (`~/<nom>`).
- `--non-interactive` est **obligatoire** (sinon le script attend le clavier et bloque ta session).
- Le script **CRÉE le dossier cerveau** (`<emplacement-parent>/<nom>`) et **refuse si ce dossier
  existe déjà** (sortie non-zéro) — garantit que c'est bien lui qui le crée.
- Le **script fait TOUT** (copie des fichiers, génération personnalisée, `git init` du cerveau,
  install du moteur RAG, smoke-test MCP) et **juge lui-même** la réussite : une **sortie non-zéro
  = échec** → relaie l'erreur telle quelle, **ne fais pas semblant** que ça a marché.

## Étape 4 — Relayer le résultat + 3 consignes finales

> Le script affiche le chemin du cerveau créé (`<emplacement-parent>/<nom>`). Utilise-le ci-dessous.

1. **Clé Gemini** : « Colle ta clé dans `<cerveau>/.env` (ligne `GOOGLE_GEMINI_API_KEY=`), **de
   préférence AVANT de rouvrir Claude Code** (geste 3). » L'index se construira au 1er démarrage du
   serveur MCP. **Si l'utilisateur a déjà ouvert Claude Code sans la clé** : qu'il la colle dans
   `.env` puis **repose sa question** — le serveur relit `.env` à la volée (pas besoin de
   reconnecter) ; en dernier recours, `/mcp` pour reconnecter, ou relancer Claude Code. *(Clé
   gratuite : https://aistudio.google.com/apikey ; pour un vault confidentiel, active la
   facturation — cf. SETUP §9.)*
2. **Dépôt distant (optionnel)** : demande — *« Veux-tu un dépôt git **distant** pour que ton
   second cerveau ait un **backup**, voire soit **utilisable depuis plusieurs machines** ? »*
   - **Si non** → ne fais rien. Tout reste versionné en local, rien ne se perd ; le hook
     auto-commit **ne pousse nulle part** (push opt-in désactivé par défaut). On pourra en ajouter
     un plus tard.
   - **Si oui** → demande la **plateforme** (GitHub / GitLab / Azure DevOps…) et le **nom**, puis,
     **depuis le dossier cerveau**, crée/branche le remote (`gh repo create` si dispo, sinon
     `git remote add` + `git push -u`, sinon guide l'utilisateur). **Puis active explicitement le
     push** (sans ça, l'auto-commit reste en local) :
     ```bash
     git config secondbrain.autopush true
     ```
     GitHub = cas simple ; autres plateformes = best-effort + guidage.
3. **Redémarrage** : « Ferme et rouvre Claude Code **dans le dossier cerveau créé**
   (`<emplacement-parent>/<nom>`) » → cela active le serveur MCP `vault-rag` (chargé au démarrage),
   qui indexe le vault. (Le launcher, lui, peut être laissé tel quel ou réutilisé pour un autre cerveau.)

## Garde-fous (à ne jamais enfreindre)

- **Commande exacte** de l'étape 3 — copie-la, ne l'invente/ne la paraphrase pas.
- **La clé Gemini n'est JAMAIS un argument** ni un message de chat — toujours `.env`.
- **Le launcher reste en lecture seule** : le bootstrap n'écrit jamais dedans (il crée un dossier
  cerveau à part). Pour générer un autre cerveau, relance avec un **autre `--name`** (ou `--dest`).
- **Refus si le dossier existe** : relancer avec le **même nom + emplacement** échoue proprement
  (sortie non-zéro, rien n'est modifié). Pour recommencer : autre nom/emplacement, ou supprime le dossier.
- **Ne fais pas semblant** : si le script sort en erreur, dis-le et relaie le message.

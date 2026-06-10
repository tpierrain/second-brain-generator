---
name: sync-sources
description: "Architecture fan-out/fan-in pour aspirer le DELTA des sources externes (Slack, Google Drive / transcripts, Calendar, mail…) via des sous-agents parallèles en LECTURE SEULE. Référence technique interne — c'est le moteur de la Phase 2 du flux principal (question → sync sources en background) et d'un éventuel briefing du matin. Pas une commande utilisateur : ce sont tes questions qui déclenchent l'aspiration."
version: 1.0.0
---

# Sync sources — Architecture fan-out/fan-in (référence interne)

> **Ce n'est pas une commande utilisateur.** Ce fichier documente l'architecture des sous-agents
> de la **Phase 2** du flux principal (sync sources en background — cf. `CLAUDE.md`). Tu ne
> déclenches jamais l'aspiration à la main : c'est la question qui la déclenche. Note : `/sync`
> est une commande **distincte** qui synchronise le repo git entre machines.
>
> 🔧 **À adapter à tes connecteurs.** Les exemples ci-dessous référencent des outils MCP de façon
> générique (`mcp__<slack>__…`, `mcp__<drive>__…`, `mcp__<calendar>__…`). Remplace-les par les
> noms réels des connecteurs que tu as branchés (cf. [SETUP §6](../../../SETUP.md)). Sans connecteur
> branché, cette skill ne fait rien — le moteur RAG répond seul depuis le vault.

## Contrainte absolue

**LECTURE SEULE.** Ne jamais envoyer de message, de mail, ni de réaction. Ne jamais poster dans
un canal. Produire uniquement des fichiers markdown locaux dans le vault.

## Outillage des sous-agents — JAMAIS de shell pour traiter du texte

Les sous-agents sont des **LLM** : ils lisent et résument **par raisonnement**, pas via du shell.
**Interdiction d'utiliser `python3 -c`, `python`, `node -e`, `awk`, `sed`, `jq`, `grep`, `cat`,
`head`, `tail` — ou toute commande Bash — pour parser, charger, découper, slicer ou résumer un
contenu.** Pourquoi c'est non négociable (surtout sur Claude Desktop, onglet Code) :

- chaque commande ad-hoc est **unique** → elle redéclenche une **demande d'autorisation** à chaque
  appel (prompts sans fin, impossibles à pré-autoriser) ;
- certaines (multi-lignes, `#` dans un argument, redirections) sont **refusées par sécurité** et
  n'offrent même pas « Always allow » — l'utilisateur ne *peut pas* les accepter.

À la place :
- **Lire un contenu** → outil **`Read`** (un fichier du vault ; ou un résultat d'outil volumineux
  que Claude a déporté dans `…/tool-results/…` : lis-le avec `Read`, pas avec `python3 -c "open(...)"`).
- **Écrire** la source brute / le briefing → outils **`Write`** / **`Edit`**.
- **Découper** (« jusqu'à la section Détails », « les 4000 premiers caractères »…) → **dans ta tête**,
  pas en Python.

`Read`/`Write`/`Edit` sont pré-autorisés et silencieux. Le shell ne l'est pas et ne le sera jamais
de façon fiable : ne t'en sers pas pour de la manipulation de texte.

## Pourquoi cette architecture

Pour éviter le *context rot* (la qualité se dégrade dès ~50-70k tokens de contexte), on n'aspire
**jamais** les sources dans le contexte principal. On orchestre des **sous-agents en parallèle** :
chacun lit UNE source, en extrait le delta, et ne renvoie qu'un signal **pré-digéré (~500 tokens)**.
Le contexte principal ne reçoit que ces résumés compacts et fait la synthèse.

```
question (ou briefing du matin)
    │
    ├─► N sous-agents : transcript-extractor (un par nouveau document/transcript)
    ├─► 1 sous-agent : chat-extractor      (mentions + DMs depuis le dernier passage)
    ├─► 1 sous-agent : my-actions          (ce que TU as fait/écrit depuis le dernier passage)
    ├─► 1 sous-agent : calendar-reader     (agenda du jour) — souvent rapide, peut rester inline
    ▼
contexte principal = synthèse finale (~3-5k tokens d'input)
    → vault/briefings/YYYY-MM-DD.md  (si briefing)
    → vault/actions-log.md           (append)
```

## Référentiel de personnes (backlinks)

Pour des backlinks `[[people/prenom-nom]]` cohérents (pas de liens cassés), les sous-agents
s'appuient sur les fiches de `vault/people/`. Règle : **kebab-case, sans accents**
(`[[people/jane-doe]]`). **Jamais de prénom seul** (`[[people/jane]]` est interdit). Créer les
backlinks même si la page cible n'existe pas (*dangling links* OK) ; ne pas créer les pages cibles.

## Procédure

### Étape 1 — Découverte des sources (contexte principal)

> **Outils natifs uniquement** (cf. constitution, section « Outillage »). Pour sonder l'état du
> vault avant le fan-out — dossiers `vault/briefings/`, fiches `vault/people/`, présence de
> `vault/actions-log.md` — utilise **`Glob`** et **`Read`**, **jamais** un Bash composé du genre
> `cd … && mkdir -p … && ls … && test -f …` (prompté à chaque fois, et refusé d'office car
> `cd`+écriture). `Write` crée les dossiers parents au moment d'écrire : pas de `mkdir` préalable.

En parallèle, repérer ce qui est **nouveau depuis le dernier passage** (delta) :

- **Transcripts / documents récents** : chercher dans ton Drive les docs modifiés depuis la
  veille (ou le dernier jour ouvré), p. ex. `mcp__<drive>__search(query="modifiedTime > 'YYYY-MM-DD…'")`.
  Collecter les `id` + titres : chacun deviendra un sous-agent transcript-extractor.
- **Agenda du jour** : `mcp__<calendar>__list_events` (rapide, peut rester dans le contexte principal).

### Étape 2 — Fan-out des sous-agents (EN PARALLÈLE, un seul message)

Lancer tous les sous-agents dans **un seul bloc d'appels parallèles**. Chacun écrit sa source
brute dans le vault et **retourne un résumé ~500 tokens max**.

#### Sous-agent « transcript-extractor » (un par document)

```
Agent(
  description="Extract transcript <slug>",
  prompt="""
Tu es un agent d'extraction de transcript de réunion. LECTURE SEULE.

TÂCHE :
1. Lire le document <DOC_ID> via ton connecteur Drive (mcp__<drive>__read_file).
2. Sauvegarder le contenu brut dans vault/raw-sources/transcripts/YYYY-MM-DD-<slug>.md
   avec ce frontmatter :
   ---
   type: transcript
   source: <connecteur>
   meeting: "<titre>"
   date: YYYY-MM-DD
   captured: <date du jour>
   ---
3. Retourner un résumé structuré (~500 tokens max) :

## Signaux — <titre>
### Mes engagements        # ce que TU as promis
- …
### Attentes envers moi    # ce qu'on attend de toi
- …
### À escalader            # 🔧 vers ta hiérarchie / tes pairs — adapte à ton orga
- …
### À partager             # 🔧 à ton équipe / tes interlocuteurs — adapte à ton orga
- …
### Backlinks
- Personnes : [[people/prenom-nom]]
- Topics : [[topics/nom-topic]]
- Source : [[raw-sources/transcripts/YYYY-MM-DD-slug]]

RÈGLES :
- Ne PAS inventer d'information absente du transcript.
- Créer les backlinks même si la page cible n'existe pas.
- Backlinks via vault/people/ (kebab-case sans accents, jamais de prénom seul).
- JAMAIS de shell (python3 -c, node -e, awk, sed, jq, grep, cat…) pour lire/charger/découper le
  contenu : si tu dois relire un fichier (vault ou résultat déporté .../tool-results/...), utilise
  l'outil Read ; le découpage et le résumé se font par raisonnement, pas en ligne de commande.
"""
)
```

#### Sous-agent « chat-extractor » (Slack/Teams/… si branché)

```
Agent(
  description="Chat 24h scan",
  prompt="""
Tu es un agent de collecte de messagerie d'équipe. LECTURE SEULE.

TÂCHE : scanner les dernières 24h (ou depuis le dernier passage) pour les signaux pertinents :
1. Mentions directes de toi et DMs des personnes clés.
2. Quelques canaux prioritaires (🔧 à définir selon ton orga — 15-30 derniers messages).

EXTRAIRE un résumé structuré (~500 tokens max), regroupé par THÈME (pas par canal) :

## Signaux chat (24h)
### Mes engagements
### Attentes envers moi
### À escalader        # 🔧 adapte
### À partager         # 🔧 adapte
### Alertes            # incidents, escalades, urgences

RÈGLES :
- Ignorer le conversationnel pur (bonjour/merci/emoji) et les bots/notifications.
- Backlinks via vault/people/ (jamais de prénom seul).
- JAMAIS de shell (python3 -c, node -e, awk, sed, jq, grep, cat…) pour lire/charger/découper le
  contenu : si tu dois relire un fichier (vault ou résultat déporté .../tool-results/...), utilise
  l'outil Read ; le découpage et le résumé se font par raisonnement, pas en ligne de commande.
"""
)
```

#### Sous-agent « my-actions » (ce que TU as fait)

```
Agent(
  description="Mes actions depuis le dernier passage",
  prompt="""
Tu es un agent de collecte de TES actions. LECTURE SEULE.

TÂCHE : trouver les messages/décisions émis PAR TOI depuis <DATE_DERNIER_PASSAGE>, et ne garder
que les ACTIONS significatives (annonces, décisions, cadrages, validations, escalades).
IGNORER : "ok", "merci", "je regarde", réactions, logistique.

EXTRAIRE (~500 tokens max), une ligne par action :
- [YYYY-MM-DD] <action courte> — #canal [[people/destinataire-principal]]

RÈGLES :
- CHAQUE action = UN message distinct (ne pas fusionner).
- Lire le contenu avant de résumer (ne pas deviner d'après le canal).
- Max ~15 actions ; au-delà, garder les plus structurantes.
- JAMAIS de shell (python3 -c, node -e, awk, sed, jq, grep, cat…) pour lire/charger/découper le
  contenu : si tu dois relire un fichier (vault ou résultat déporté .../tool-results/...), utilise
  l'outil Read ; le découpage et le résumé se font par raisonnement, pas en ligne de commande.
"""
)
```

### Étape 3 — Synthèse (contexte principal)

Le contexte principal reçoit les résumés compacts de tous les sous-agents + l'agenda
(~3-5k tokens). **Trier et croiser** : un même sujet vu dans un transcript ET dans le chat = signal
fort. C'est aussi ici qu'on décide si le delta **amende la réponse en cours** (Phase 3 du flux).

### Étape 4 — Écriture du briefing (si briefing du matin)

Écrire dans `vault/briefings/YYYY-MM-DD.md` :

```markdown
---
type: briefing
date: YYYY-MM-DD
architecture: fan-out/fan-in
sources: ["[[raw-sources/transcripts/...]]", "chat (24h)", "calendar (jour)"]
tags: [briefing]
---

# Briefing — YYYY-MM-DD

## ✅ Ce que tu as fait depuis le dernier briefing
- [YYYY-MM-DD] [action] — #canal [[people/destinataire]]

## 🔴 Tes engagements (ce que tu as promis)
- **[engagement]** — contexte, source [[raw-sources/...]]

## 🟡 Ce qu'on attend de toi
- ⚠️ Urgent : [deadlines du jour]
- Pending : [[people/prenom-nom]] : [attente]

## 🔵 À escalader / 🟢 À partager   # 🔧 sections à adapter à ton organisation

## 📅 Agenda du jour
| Heure | Réunion | Préparation |
|---|---|---|
| HH:MM | **[réunion]** | [contexte/action] |

## Caveats
- [qualité des transcripts, confusions de noms, contexte manquant]
```

Pas de section vide — l'omettre. Chaque signal cite sa source (crochets ou backlink).

### Étape 5 — Append dans `vault/actions-log.md`

**Appender** (créer le fichier s'il n'existe pas) une ligne plate par action, préfixée de la date —
pas de frontmatter, fichier *grep-able* :

```markdown
## [YYYY-MM-DD] <action> — #canal [[people/destinataire]]
```

**Append-only** : ne jamais réécrire les lignes existantes. Usage : « qu'est-ce que j'ai fait sur
X ? » → `grep -i "X" vault/actions-log.md` puis enrichissement via les briefings référencés.

## Mode re-exécution (même jour)

Si `vault/briefings/YYYY-MM-DD.md` existe déjà : le relire, re-scanner les sources, et n'ajouter
qu'une section `## 🔄 Mise à jour HH:MM` en tête s'il y a du nouveau. Sinon afficher
« Pas de nouveauté » sans modifier le fichier.

## Conventions backlinks

| Contexte | Syntaxe |
|---|---|
| Personne | `[[people/prenom-nom]]` (kebab-case, sans accents) |
| Transcript | `[[raw-sources/transcripts/YYYY-MM-DD-slug]]` |
| Topic | `[[topics/nom-topic]]` |
| Briefing antérieur | `[[briefings/YYYY-MM-DD]]` |

## Critère de succès

En < 1 minute de lecture, tu sais (a) ce que tu dois faire aujourd'hui et (b) ce que tu dois
pousser vers les autres — zéro signal important perdu depuis le dernier passage.

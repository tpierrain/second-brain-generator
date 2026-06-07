# Connecteurs — brancher tes sources externes

Le moteur RAG du générateur répond depuis **tes notes** (le `vault/`). Les **connecteurs** lui
donnent accès à tes **autres sources** — mail, agenda, Notion, fichiers, chat — pour qu'il croise
tout au même endroit. **Tout est optionnel** : sans aucun connecteur, le second cerveau fonctionne
déjà, il répond seul depuis le vault.

Ce fichier est un **menu d'idées** pour t'aider à choisir *quoi* brancher selon *ton* besoin. Le
*comment* (wizard, manuel, credentials) est détaillé dans [SETUP §6](SETUP.md).

---

## Deux familles de connecteurs

| Famille | C'est quoi | Où ça se branche |
|---|---|---|
| **Natif claude.ai** | Connecteur géré par ton compte claude.ai (Slack, Gmail, Calendar, Notion, Drive…). | Côté compte : *Settings → Connectors*. **Rien** à écrire dans `.mcp.json`. |
| **MCP communautaire** | Un serveur MCP que tu héberges/lances toi-même (souvent un paquet npm). | Dans `.mcp.json` (le wizard de l'installeur peut le faire pour toi) + permissions dans `.claude/settings.json`. |

> Plusieurs sources existent **dans les deux familles** (ex. Google Drive, Notion). Le **natif** est
> en général le plus simple à démarrer ; le **MCP communautaire** te donne plus de contrôle (scopes,
> self-hosting, credentials à toi).

---

## Menu — quel connecteur pour quel besoin

| Tu veux interroger… | Idée de connecteur | Famille | À quoi ça sert |
|---|---|---|---|
| **Notes / wikis** Notion | `@notionhq/notion-mcp-server`, ou Notion natif | MCP **ou** natif | Chercher dans tes bases/pages (specs, wikis, KB) ; lire une page pour la croiser avec tes notes. |
| **Mails** | Gmail natif | natif | Retrouver un mail/fil sur un sujet, un client, un engagement ; capter décisions et actions échangées par mail. |
| **Agenda** | Google Calendar natif | natif | Lire l'agenda du jour/semaine pour contextualiser une question ou un briefing. |
| **Fichiers / documents** | `@modelcontextprotocol/server-gdrive`, `@isaacphi/mcp-gdrive`, ou Drive natif | MCP **ou** natif | Retrouver et lire specs, comptes-rendus, exports. |
| **Chat d'équipe** | Slack natif | natif | Chercher messages et fils ; lire un channel / les non-lus pour capter ce qui a bougé. |
| **Transcripts de réunion** (Meet) | **Calendar + Drive** | natif + MCP | Voir la section dédiée ci-dessous. |

---

## 🎙️ Transcripts de réunion — un cas d'usage, pas un connecteur

C'est le piège classique : on cherche « le connecteur transcripts ». **Il n'y en a pas besoin.**
Quand tu enregistres une visio (Google Meet / Gemini), la transcription se matérialise à **deux
endroits** que tu as probablement déjà branchés :

1. **Dans l'invitation de l'événement** → le lien de l'enregistrement / de la transcription est
   souvent attaché à l'événement. On le récupère via le **Google Calendar**.
2. **Sur ton Google Drive** → le **document de transcription** y atterrit automatiquement. On le
   retrouve via le **Google Drive** (rechercher les docs récents, puis lire le bon).

Donc : branche **Calendar** *et* **Drive**, et tes transcripts sont accessibles — **sans** dépendre
d'un outil de meeting-bot tiers (Fireflies, Fathom, Granola, tl;dv…). Si tu utilises un de ces
outils et qu'il expose un MCP, tu peux l'ajouter en plus, mais ce n'est **pas nécessaire** pour
démarrer.

---

## Comment les brancher

Trois chemins, détaillés dans [SETUP §6](SETUP.md) :

- **(a) Le wizard de l'installeur** *(recommandé)* — à l'étape **5/9**, il propose le catalogue, te
  montre **à quoi sert** chaque source, et pour les connecteurs **MCP** écrit tout seul le bloc
  serveur dans `.mcp.json` + les permissions dans `.claude/settings.json` (idempotent).
- **(b) À la main** — tu ajoutes toi-même le MCP server dans `.mcp.json` et les permissions.
- **(c) Connecteurs natifs claude.ai** — rien dans `.mcp.json` : active-les depuis *Settings →
  Connectors* de ton compte.

> 🔐 **Neutralité / sécurité.** Le générateur ne met **aucun secret en dur** : les credentials des
> MCP sont des placeholders `<…>` que **tu** renseignes. Ne commite jamais tes vrais tokens.

---

## Une fois branché — documente le routage

Quand un connecteur est en place, dis à Claude **quel outil pour quoi** dans ton `CLAUDE.md`
(section **4. Routage**, sous-partie *Sources externes*). C'est ce qui évite qu'il hésite entre
deux MCP qui se chevauchent. Exemple de table à remplir :

| Source | Outil MCP | Quand l'utiliser |
|---|---|---|
| Drive | `mcp__<drive>__search` | découverte de documents / transcripts récents |
| Calendar | `mcp__<calendar>__list_events` | agenda du jour, lien de transcription dans l'événement |
| … | … | … |

L'outillage interne [`sync-sources`](.claude/skills/sync-sources/SKILL.md) (le moteur de la Phase 2
— aspiration du **delta** des sources en sous-agents **lecture seule**) s'appuie sur ces connecteurs.
Remplace-y les placeholders `mcp__<slack>__…`, `mcp__<drive>__…` par les noms réels de tes outils.

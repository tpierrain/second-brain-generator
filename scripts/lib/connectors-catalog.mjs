// ─────────────────────────────────────────────────────────────────────────────
// connectors-catalog.mjs — catalogue neutre de sources externes branchables.
//
// Deux familles :
//  • kind:'mcp'    → serveur MCP self-hosted/communautaire. L'installeur peut écrire
//                    son `serverConfig` dans .mcp.json et ses `permissions` dans
//                    settings.json (cf. connectors-merge.mjs). Les valeurs d'env sont
//                    des PLACEHOLDERS `<...>` : l'utilisateur renseigne ses vrais
//                    credentials lui-même (neutralité : aucun secret en dur).
//  • kind:'native' → connecteur géré par le compte claude.ai (Slack, Gmail,
//                    Calendar…). Pas de .mcp.json à écrire : on se contente de
//                    pointer l'utilisateur vers les *Connectors* de son compte.
//
// `useCases` : pour chaque connecteur, quelques idées de « pour quoi faire » —
// affichées par le wizard pour aider l'utilisateur à choisir, et reprises dans la
// doc (README §Connecteurs, SETUP §6, CONNECTORS.md). Les transcripts de réunion
// (Meet/Gemini) ne sont PAS un produit tiers à brancher : c'est un cas d'usage
// servi par Google Calendar (le lien est souvent dans l'invitation) + Google Drive
// (où atterrit le doc de transcription). On les cite donc en useCases, pas en entrée.
//
// Garder ce catalogue court et crédible (≤ 8 entrées), neutre, sans secret en dur.
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECTORS = [
  {
    id: "google-drive",
    label: "Google Drive (serveur MCP communautaire)",
    kind: "mcp",
    serverConfig: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-gdrive"],
      env: {
        GDRIVE_CREDENTIALS_PATH: "<CHEMIN_VERS_credentials.json>",
      },
    },
    permissions: [
      "mcp__google-drive__search",
      "mcp__google-drive__read_file",
    ],
    useCases: [
      "Retrouver et lire des documents (specs, comptes-rendus, exports).",
      "Récupérer les transcripts de réunion (Meet/Gemini) : le doc de transcription atterrit sur le Drive — rechercher par date de modification puis le lire.",
    ],
    credentialsHint:
      "Crée un client OAuth Google (scope Drive lecture seule), télécharge le " +
      "credentials.json et renseigne GDRIVE_CREDENTIALS_PATH. Détails : SETUP §6.",
  },
  {
    id: "notion",
    label: "Notion (serveur MCP communautaire)",
    kind: "mcp",
    serverConfig: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: {
        NOTION_API_TOKEN: "<TON_TOKEN_INTEGRATION_NOTION>",
      },
    },
    permissions: [
      "mcp__notion__search",
      "mcp__notion__fetch",
    ],
    useCases: [
      "Chercher dans tes bases et pages Notion (specs produit, wikis, bases de connaissances).",
      "Lire une page précise pour la croiser avec tes notes du vault.",
    ],
    credentialsHint:
      "Crée une intégration interne Notion, partage les pages voulues avec elle, " +
      "puis colle son token dans NOTION_API_TOKEN. Détails : SETUP §6.",
  },
  {
    id: "slack",
    label: "Slack (connecteur natif du compte claude.ai)",
    kind: "native",
    useCases: [
      "Chercher des messages et fils sur un sujet ou une personne.",
      "Lire un channel ou les non-lus pour capter ce qui a bougé depuis le dernier passage.",
    ],
    credentialsHint:
      "Slack se branche côté compte claude.ai (Settings → Connectors), pas via " +
      ".mcp.json. Active le connecteur Slack sur ton compte. Détails : SETUP §6.",
  },
  {
    id: "gmail",
    label: "Gmail (connecteur natif du compte claude.ai)",
    kind: "native",
    useCases: [
      "Retrouver un mail ou un fil sur un sujet, un client, un engagement.",
      "Capter des décisions et actions échangées par mail pour les croiser avec tes notes.",
    ],
    credentialsHint:
      "Gmail se branche côté compte claude.ai (Settings → Connectors), pas via " +
      ".mcp.json. Active le connecteur Gmail sur ton compte. Détails : SETUP §6.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar (connecteur natif du compte claude.ai)",
    kind: "native",
    useCases: [
      "Lire l'agenda du jour / de la semaine pour contextualiser une question ou un briefing.",
      "Récupérer les transcripts de réunion (Meet) : le lien de l'enregistrement/transcription est souvent attaché à l'invitation de l'événement.",
    ],
    credentialsHint:
      "Google Calendar se branche côté compte claude.ai (Settings → Connectors), " +
      "pas via .mcp.json. Active le connecteur sur ton compte. Détails : SETUP §6.",
  },
];

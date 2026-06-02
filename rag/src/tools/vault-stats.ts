import { getStats } from "../lib/vector-store.js";

export const vaultStatsTool = {
  name: "vault_stats",
  description: "Affiche les statistiques de l'index : nombre de documents, chunks, répartition par type.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  handler: async () => {
    const stats = getStats();
    const typeLines = stats.types
      .map((t) => `  - ${t.type}: ${t.n}`)
      .join("\n");

    const text =
      `**Index vault**\n` +
      `- Documents : ${stats.docCount}\n` +
      `- Chunks : ${stats.chunkCount}\n` +
      `- Par type :\n${typeLines}`;

    return { content: [{ type: "text", text }] };
  },
};

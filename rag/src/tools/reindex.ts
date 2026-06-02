import { reindex } from "../lib/index-manager.js";

export const reindexTool = {
  name: "reindex",
  description:
    "Reconstruit l'index du vault. Incrémental par défaut (ne ré-indexe que les fichiers modifiés). Utiliser force=true pour tout reconstruire.",
  inputSchema: {
    type: "object" as const,
    properties: {
      force: {
        type: "boolean",
        description: "Forcer la ré-indexation complète (défaut : false)",
      },
    },
  },
  handler: async (args: { force?: boolean }) => {
    const result = await reindex(args.force ?? false);
    const lines = [
      `**Indexation terminée**`,
      `- Fichiers scannés : ${result.scanned}`,
      `- Indexés : ${result.indexed}`,
      `- Inchangés (skip) : ${result.skipped}`,
      `- Supprimés de l'index : ${result.removed}`,
    ];
    if (result.errors.length > 0) {
      lines.push(`- Erreurs : ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  - ${err}`);
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
};

import { readFile } from "fs/promises";
import { resolve } from "path";
import { VAULT_DIR } from "../lib/config.js";

export const getDocumentTool = {
  name: "get_document",
  description:
    "Lit le contenu complet d'un document du vault par son chemin relatif.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Chemin relatif depuis vault/ (ex: people/jane-doe.md, daily/2026-05-29.md)",
      },
    },
    required: ["path"],
  },
  handler: async (args: { path: string }) => {
    try {
      const fullPath = resolve(VAULT_DIR, args.path);
      if (!fullPath.startsWith(VAULT_DIR)) {
        return {
          content: [{ type: "text", text: "Erreur : chemin en dehors du vault." }],
          isError: true,
        };
      }
      const content = await readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return {
        content: [{ type: "text", text: `Fichier introuvable : vault/${args.path}` }],
        isError: true,
      };
    }
  },
};

import { listDocuments } from "../lib/vector-store.js";

export const listDocumentsTool = {
  name: "list_documents",
  description: "Liste tous les documents indexés du vault, avec leur type et date de mise à jour.",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        description: "Filtrer par type de document",
      },
      tags: {
        type: "string",
        description: "Filtrer par tag (match partiel)",
      },
    },
  },
  handler: async (args: { type?: string; tags?: string }) => {
    const docs = listDocuments(args.type, args.tags);

    if (docs.length === 0) {
      return { content: [{ type: "text", text: "Aucun document indexé." }] };
    }

    const grouped = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = grouped.get(doc.type) ?? [];
      list.push(doc);
      grouped.set(doc.type, list);
    }

    let text = `**${docs.length} documents indexés**\n\n`;
    for (const [type, typeDocs] of grouped) {
      text += `## ${type} (${typeDocs.length})\n`;
      for (const d of typeDocs) {
        text += `- \`vault/${d.path}\` — ${d.title}\n`;
      }
      text += "\n";
    }

    return { content: [{ type: "text", text }] };
  },
};

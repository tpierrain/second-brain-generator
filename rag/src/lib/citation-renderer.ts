import { resolve } from "path";
import type { SearchResult } from "./vector-store.js";

/**
 * Renders search results as the deterministic `search_vault` citation block.
 *
 * Every result carries a clickable 🧠 LOCAL link to the copy in the vault, via
 * `obsidian://open?path=<absolute>` — the absolute form lets Obsidian resolve the
 * vault itself (no vault-name guess, robust whether the brain folder or `vault/`
 * was registered). A mirror note additionally carries a 🔗 link to its live
 * source (Notion), already canonicalized at write time. The relative path stays
 * visible as plain text so it remains grep-/copy-friendly.
 *
 * This lives in the engine-owned deterministic output (not the constitution) so
 * the links reach EVERY brain through `/update-engine`, not just new installs.
 */
export function formatSearchCitations(
  results: SearchResult[],
  vaultDir: string
): string {
  return results
    .map((r, i) => {
      const localLink = `obsidian://open?path=${encodeURIComponent(
        resolve(vaultDir, r.path)
      )}`;
      const links =
        `🧠 [local copy](${localLink})` +
        (r.sourceUrl ? ` · 🔗 [Notion source](${r.sourceUrl})` : "");
      return (
        `### ${i + 1}. ${r.title} — ${r.section}\n` +
        `**Path:** \`vault/${r.path}\` | **Type:** ${r.type} | **Score:** ${r.score.toFixed(3)}\n` +
        `${links}\n\n` +
        `${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`
      );
    })
    .join("\n\n---\n\n");
}

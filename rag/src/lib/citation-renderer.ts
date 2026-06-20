import { resolve } from "path";
import type { SearchResult } from "./vector-store.js";

/**
 * Make a URL safe to drop inside a CommonMark `<…>` link destination. The angle
 * brackets already neutralize parentheses, but a raw `<` / `>` (the `>` closes the
 * destination early) and any whitespace are still illegal there. We percent-encode
 * exactly those characters — leaving `(`, `)` and the rest of a normal URL intact —
 * so any `source_url` (incl. hand-written / imported notes, which `parseDocument`
 * never validates) stays a single clickable link.
 */
function escapeAngleDestination(url: string): string {
  return url.replace(
    /[<> \t\n\r]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
  );
}

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
 * Claude Desktop silently drops custom-scheme (`obsidian://`) clicks — only
 * `http(s)` is routed — so the 🧠 link looks clickable but does nothing there.
 * Each citation therefore also carries a plain-text affordance ("ask me to open
 * citation N"): the user asks Claude, which opens the note via the allowlisted
 * opener. The number matches the citation heading so "open citation 2" is
 * unambiguous (ADR 0027).
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
      // Angle-bracket the destinations (CommonMark): a '(' or ')' inside a URL then
      // can't terminate the markdown link early. The obsidian link is already
      // percent-encoded, but wrapping both keeps the rule uniform.
      const links =
        `🧠 [local copy](<${escapeAngleDestination(localLink)}>)` +
        (r.sourceUrl
          ? ` · 🔗 [Notion source](<${escapeAngleDestination(r.sourceUrl)}>)`
          : "");
      return (
        `### ${i + 1}. ${r.title} — ${r.section}\n` +
        `**Path:** \`vault/${r.path}\` | **Type:** ${r.type} | **Score:** ${r.score.toFixed(3)}\n` +
        `${links}\n` +
        `_Ask me to "open citation ${i + 1}" and I'll open it in Obsidian._\n\n` +
        `${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`
      );
    })
    .join("\n\n---\n\n");
}

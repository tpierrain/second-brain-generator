import { resolve } from "path";
import { pathToFileURL } from "url";
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
 * Every result carries a 🧠 LOCAL link to the real file in the vault, via
 * `file://<absolute path>` — a real-file URL, NOT an app-specific custom scheme.
 * Where the renderer routes the click, the OS opens the note in the user's
 * DEFAULT Markdown editor (Typora, Obsidian, VS Code, …) — editor-agnostic and
 * editable, no Obsidian lock-in. A mirror note additionally carries a 🔗 link to
 * its live source (Notion), already canonicalized at write time. The relative
 * path stays visible as plain text so it remains grep-/copy-friendly.
 *
 * Claude Desktop only routes `http(s)` — it can silently drop `file://` clicks
 * just like custom schemes — so the 🧠 link is best-effort, not guaranteed
 * clickable there. Each citation therefore ALSO carries a plain-text affordance
 * ("ask me to open citation N"): the user asks Claude, which opens the note via
 * the allowlisted opener (`open`/`xdg-open`/`start`) → the OS default editor.
 * That is the robust, editor-agnostic channel. The number matches the citation
 * heading so "open citation 2" is unambiguous (ADR 0027).
 *
 * This lives in the engine-owned deterministic output (not the constitution) so
 * the links reach EVERY brain through `/update-engine`, not just new installs.
 */
export function formatSearchCitations(
  results: SearchResult[],
  vaultDir: string
): string {
  // B5 belt (F-B7e): when any cited note came from a local mirror (it carries a
  // 🔗 source link), stamp the relay directive at the TOP of the output, adjacent
  // to the data. The same directive lives in the constitution, but the constitution
  // is SACRED and never reaches an already-installed brain — this engine-owned line
  // does, through `/update-engine` (rag/src is the `replace` regime). Without it
  // Claude paraphrases and the two emoji-links collapse into one. Fires only when a
  // mirror note is actually present, so a plain vault search stays noise-free.
  const hasMirror = results.some((r) => r.sourceUrl);
  const relayDirective = hasMirror
    ? "> ⚠️ Some cited notes come from a local mirror and carry TWO links — " +
      "🧠 the local copy AND 🔗 the source. Relay BOTH to the user as-is; do not " +
      "collapse them into one.\n\n"
    : "";
  return relayDirective + results
    .map((r, i) => {
      // A real-file URL: pathToFileURL encodes spaces / unicode / reserved chars
      // correctly while keeping the slashes — so the OS opener resolves the actual
      // file and the user's default Markdown editor opens it.
      const localLink = pathToFileURL(resolve(vaultDir, r.path)).href;
      // Angle-bracket the destinations (CommonMark): a '(' or ')' inside a URL then
      // can't terminate the markdown link early. The file:// link is already
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
        `_Ask me to "open citation ${i + 1}" and I'll open it in your Markdown editor (Typora, Obsidian, …)._\n\n` +
        `${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`
      );
    })
    .join("\n\n---\n\n");
}

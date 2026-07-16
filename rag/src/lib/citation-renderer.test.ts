import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatSearchCitations } from "./citation-renderer.js";
import type { SearchResult } from "./vector-store.js";

// Cross-OS vault root: `resolve` makes it absolute on the *current* OS (a real
// `C:\…` drive path on Windows, `/brain/vault` on POSIX), so the expected
// `file://` URL — built the same way production does, via `pathToFileURL` — is
// driver-correct on either platform. A hardcoded POSIX `/brain/vault` + a literal
// `file:///brain/vault/…` was a Windows-only false-negative (resolve adds the
// current drive there → `file:///D:/brain/vault/…`), not a prod bug.
const VAULT = resolve("/brain/vault");
function localFileUrl(relPath: string): string {
  return pathToFileURL(resolve(VAULT, relPath)).href;
}

function result(over: Partial<SearchResult> = {}): SearchResult {
  return {
    path: "mirrors/facture/a.md",
    title: "A note",
    type: "note",
    section: "Intro",
    content: "hello world",
    score: 0.42,
    ...over,
  };
}

test("a mirror note renders both a real-file local link and a Notion link", () => {
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/abc" })],
    VAULT
  );

  // 🧠 local copy: a real-file `file://<absolute>` link, NOT an Obsidian custom
  // scheme. A click (where the renderer routes it) opens the note in the user's
  // DEFAULT Markdown editor (Typora, Obsidian, …) — editor-agnostic, editable.
  assert.ok(
    text.includes(localFileUrl("mirrors/facture/a.md")),
    text
  );
  // We must NOT emit the Obsidian-specific custom scheme anymore.
  assert.ok(!text.includes("obsidian://"), text);
  // 🔗 Notion source: rendered as-is (already canonicalized at write time).
  assert.ok(text.includes("https://www.notion.so/abc"), text);
});

test("a single plain result renders the exact citation block, byte for byte", () => {
  // Reflex #2 (assert the WHOLE string): one exact expected block pins every literal
  // and layout fragment at once — the heading, the Path|Type|Score line (score to 3
  // decimals), the 🧠-only links line whose sourceUrl-absent branch is the empty
  // string (not an injected literal), the affordance, and the untruncated content.
  const text = formatSearchCitations([result()], VAULT);

  const expected =
    "### 1. A note — Intro\n" +
    "**Path:** `vault/mirrors/facture/a.md` | **Type:** note | **Score:** 0.420\n" +
    `🧠 [local copy](<${localFileUrl("mirrors/facture/a.md")}>)\n` +
    '_Ask me to "open citation 1" and I\'ll open it in your Markdown editor (Typora, Obsidian, …)._\n\n' +
    "hello world";

  assert.equal(text, expected);
});

test("the Notion link is angle-bracket wrapped so a ')' in the URL can't break the markdown", () => {
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/a(b)c" })],
    VAULT
  );

  // CommonMark: a <…> link destination may contain parentheses → the closing
  // ')' of the URL no longer terminates the markdown link early.
  assert.ok(text.includes("(<https://www.notion.so/a(b)c>)"), text);
});

test("a '>' or space in the Notion url is percent-encoded so it can't break the <…> destination", () => {
  // parseDocument reads source_url from ANY note's frontmatter without validation
  // (hand-written / imported notes), so the renderer — the robust boundary — must
  // also survive characters that '<…>' wrapping alone doesn't: '>' closes the
  // destination early, and a raw space is illegal inside it.
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/a>b c" })],
    VAULT
  );

  assert.ok(text.includes("(<https://www.notion.so/a%3Eb%20c>)"), text);
});

test("a control char whose hex is a single digit is zero-padded to two digits (%09, not %9)", () => {
  // Reflex #3 (boundary): the existing '>'/space cases (0x3E, 0x20) are already two
  // hex digits, so they can't tell `padStart(2, "0")` from `padStart(2, "")`. A TAB
  // (0x09) is the one-digit case that pins the zero-pad — the escaped byte must be
  // "%09", never "%9".
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/a\tb" })],
    VAULT
  );

  assert.ok(text.includes("a%09b"), text);
  assert.ok(!text.includes("a%9b"), text);
});

test("a non-mirror note renders only the local file link, no Notion link", () => {
  const text = formatSearchCitations([result()], VAULT);

  assert.ok(text.includes(localFileUrl("mirrors/facture/a.md")), text);
  assert.ok(!text.includes("🔗"), text);
});

test("when a mirror note is present, the output carries an engine-owned relay directive (both 🧠+🔗 links, as-is)", () => {
  // B5 belt (F-B7e): the dual-link relay directive ALSO lives here, adjacent to
  // the data, so it reaches EVERY brain through `/update-engine` (rag/src is the
  // `replace` regime) — not only brains whose SACRED constitution happens to carry
  // it. Without it Claude paraphrases and the two emoji-links collapse into one.
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/abc" })],
    VAULT
  );

  // The directive must name BOTH emoji-links and tell Claude to relay them as-is.
  assert.match(text, /🧠/, text);
  assert.match(text, /🔗/, text);
  assert.match(text, /relay[\s\S]*as-is/i, text);
});

test("the relay directive is emitted VERBATIM as a prefix when SOME (not all) notes are mirrors", () => {
  // Reflex #2 (assert the whole string) + #5 (mixed set): a single mirror result
  // makes `.some` and `.every` agree, so it can't tell them apart. A mixed set —
  // one mirror, one plain — has some=true / every=false, pinning `.some`. And the
  // banner is asserted verbatim (not just /🧠/ /🔗/), so blanking any fragment dies.
  const expectedBanner =
    "> ⚠️ Some cited notes come from a local mirror and carry TWO links — " +
    "🧠 the local copy AND 🔗 the source. Relay BOTH to the user as-is; do not " +
    "collapse them into one.\n\n";
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/abc" }), result({ title: "Plain" })],
    VAULT
  );

  assert.ok(text.startsWith(expectedBanner), text);
});

test("a result set with NO mirror note carries no relay directive (no noise)", () => {
  // The belt fires ONLY when at least one cited note actually has a source link;
  // a plain vault search stays clean.
  const text = formatSearchCitations([result()], VAULT);
  assert.ok(!/relay/i.test(text), text);
  // Reflex #4 (absent twin): the else-branch of the directive must be the empty
  // string, so the output starts straight at the first heading — no injected noise
  // (a `: ""` → `"Stryker was here!"` mutant doesn't match /relay/i but breaks this).
  assert.ok(text.startsWith("### 1. "), text);
});

test("content of exactly 500 chars is kept whole with NO ellipsis (the > boundary)", () => {
  // Reflex #3 (the equality boundary): at length 500, `length > 500` is false, so
  // the else branch ("") wins — no ellipsis, no junk appended. This is the case that
  // separates `>` from `>=`, the always/never conditional mutants, and the empty
  // else from an injected string.
  const text = formatSearchCitations([result({ content: "C".repeat(500) })], VAULT);

  // endsWith pins it wholly: any boundary mutant that appends an ellipsis (`>=`,
  // always-true conditional) or an injected else-string breaks the exact tail.
  // (Can't assert `!includes("…")` — the affordance line legitimately carries one.)
  assert.ok(text.endsWith("C".repeat(500)), text);
});

test("content longer than 500 chars is sliced to 500 and gets a trailing ellipsis", () => {
  // Reflex #3 (boundary): the `.slice(0, 500)` + `length > 500 ? "…" : ""` cluster.
  // A distinctive tail ("B"s past char 500) proves the slice actually drops them —
  // endsWith alone wouldn't kill "remove slice" (a longer string still ends the same).
  const text = formatSearchCitations(
    [result({ content: "A".repeat(500) + "B".repeat(50) })],
    VAULT
  );

  assert.ok(text.includes("A".repeat(500) + "…"), text);
  assert.ok(!text.includes("B"), text); // the tail past char 500 is dropped
});

test("two results are numbered 1./2. in their headings and joined by a '---' rule", () => {
  // Reflex #5 (collections of ≥2): numbering, the join separator and the heading
  // text are all indistinguishable on a single result. Two results, split back on
  // the exact separator, pin `${i + 1}` (not i, i-1), the `\n\n---\n\n` join, and
  // that the heading string isn't blanked.
  const text = formatSearchCitations(
    [result({ title: "First", section: "S1" }), result({ title: "Second", section: "S2" })],
    VAULT
  );

  const blocks = text.split("\n\n---\n\n");
  assert.equal(blocks.length, 2, text);
  assert.ok(blocks[0].startsWith("### 1. First — S1\n"), blocks[0]);
  assert.ok(blocks[1].startsWith("### 2. Second — S2\n"), blocks[1]);
});

test("each citation carries an 'ask me to open citation N' affordance, numbered + editor-agnostic", () => {
  // Claude Desktop only routes http(s), so a 🧠 file:// click can be dropped there
  // too. The block must therefore say, in plain text, how to actually open the note:
  // the user asks Claude, which uses the allowlisted opener to open it in WHATEVER
  // Markdown editor is the OS default (Typora, Obsidian, …) — never Obsidian-specific.
  // The number matches the citation heading so "open citation 2" is unambiguous.
  const text = formatSearchCitations(
    [result(), result({ title: "Second" })],
    VAULT
  );

  assert.ok(text.includes('open citation 1'), text);
  assert.ok(text.includes('open citation 2'), text);
  // Editor-agnostic wording — the affordance must not promise Obsidian.
  assert.ok(text.includes("Markdown editor"), text);
  assert.ok(!/in Obsidian/.test(text), text);
});

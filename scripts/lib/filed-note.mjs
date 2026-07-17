// ─────────────────────────────────────────────────────────────────────────────
// filed-note.mjs — the pure, I/O-free core of Track B ("file the good answer
// back", ADR 0009 rung 1: correctness in a function with no I/O). Given a filing
// spec it builds a note that is conformant to the vault taxonomy BY CONSTRUCTION:
// the right path, complete frontmatter (type/created/updated/tags), and woven
// [[links]] — so a filed-back answer never re-introduces the defects the `/lint`
// scanner (Track A) reports. A thin CLI (rung 2) injects the date and the fs.
// ─────────────────────────────────────────────────────────────────────────────

// Turn a human title into a filename-safe slug: lowercased, accent-stripped,
// kebab-case (e.g. "Jane Doe" → "jane-doe").
export function slugify(title) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics → one hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  if (slug === "") throw new Error(`empty slug: title "${title}" has no slug-able characters`);
  return slug;
}

// The vault folder each note type lives in (mirrors the constitution taxonomy).
const FOLDER = {
  person: "people",
  topic: "topics",
  decision: "decisions",
  meeting: "meetings",
};

// Dated types carry a YYYY-MM-DD prefix in their filename (constitution taxonomy);
// living pages (person/topic) do not.
const DATED = new Set(["decision", "meeting"]);

// The vault-relative path a filed-back note must live at, derived from its type
// (and title, and — for dated types — its date). Pure: no clock, no fs.
export function filedNotePath(spec) {
  const folder = FOLDER[spec.type];
  if (!folder) {
    throw new Error(
      `unknown type "${spec.type}": supported types are ${Object.keys(FOLDER).join(", ")}`,
    );
  }
  if (DATED.has(spec.type) && !spec.date) {
    throw new Error(`type "${spec.type}" requires a date (YYYY-MM-DD) for its filename`);
  }
  const stem = DATED.has(spec.type) ? `${spec.date}-${slugify(spec.title)}` : slugify(spec.title);
  return `${folder}/${stem}.md`;
}

// Build a filed-back note as { path, content }. The content is conformant to the
// vault taxonomy BY CONSTRUCTION: complete frontmatter (type/created/updated/tags
// all present), an H1 title, the distilled body, and — when links are given — a
// "Related" section weaving them in as [[wikilinks]]. Pure: `today` is injected,
// never read from a clock.
export function renderFiledNote(spec) {
  if (!spec.today) throw new Error("today (YYYY-MM-DD) is required to stamp created/updated");
  if (!spec.tags || spec.tags.length === 0) {
    throw new Error("at least one tag is required (frontmatter conformance: tags must be non-empty)");
  }
  const links = spec.links ?? [];
  const path = filedNotePath(spec);
  const frontmatter = [
    "---",
    `type: ${spec.type}`,
    `created: ${spec.today}`,
    `updated: ${spec.today}`,
    `tags: [${spec.tags.join(", ")}]`,
    "---",
  ].join("\n");
  const related =
    links.length > 0 ? `\n## Related\n\n${links.map((l) => `- [[${l}]]`).join("\n")}\n` : "";
  const content = `${frontmatter}\n\n# ${spec.title}\n\n${spec.body}\n${related}`;
  return { path, content };
}

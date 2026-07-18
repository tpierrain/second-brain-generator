// ─────────────────────────────────────────────────────────────────────────────
// wiki-lint-io.mjs — the fs adapter (ADR 0009 rung 2) for the `/lint` wiki-health
// scanner. It reads a real vault into the parsed-note shape { path, frontmatter,
// body } that the pure core in wiki-lint.mjs consumes.
//
// parseNote is a dependency-free frontmatter reader: the launcher ships no
// gray-matter, and we only need the handful of keys the lint rules care about
// (type / created / updated / tags), so a small YAML subset is enough.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listFilesRelPosix } from "./fs-walk.mjs";

// Parse one Markdown file's raw text into { frontmatter, body }. Supports scalar
// values and an inline `key: [a, b]` list. A file with no frontmatter yields {}.
export function parseNote(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const inlineList = rawValue.match(/^\[(.*)\]$/);
    frontmatter[key] = inlineList
      ? inlineList[1].split(",").map((v) => v.trim()).filter((v) => v !== "")
      : rawValue.trim();
  }
  return { frontmatter, body: match[2] };
}

// Read every .md file under `vaultDir` into the parsed-note shape, path relative
// to the vault and POSIX-separated (so the pure core's basename/prefix logic is
// platform-independent).
export function readVaultNotes(vaultDir) {
  return listFilesRelPosix(vaultDir)
    .filter((rel) => rel.endsWith(".md"))
    .map((rel) => ({ path: rel, ...parseNote(readFileSync(join(vaultDir, rel), "utf8")) }));
}

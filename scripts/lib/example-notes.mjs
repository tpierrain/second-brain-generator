// ═══════════════════════════════════════════════════════════════════════════
// example-notes.mjs — detection/removal of example notes from the vault.
//
// The demo notes shipped with the generator carry the `exemple` tag in their
// frontmatter. The machinery (vault/backlog/harnais.md) and the docs (README.md)
// do not → they are preserved. Goal: let the installer clear the example vault
// so it does not pollute the real second brain's RAG.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

// True if the Markdown frontmatter contains an `exemple` tag.
export function isExampleNote(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const tags = fm[1].match(/^tags:\s*\[([^\]]*)\]/m);
  if (!tags) return false;
  return tags[1].split(",").map((t) => t.trim()).includes("exemple");
}

// Recursive list of .md files under vaultDir that are example notes.
export function findExampleNotes(vaultDir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".md") && isExampleNote(readFileSync(p, "utf8"))) out.push(p);
    }
  };
  walk(vaultDir);
  return out.sort();
}

// Removes the example notes under vaultDir; returns the deleted paths.
export function clearExampleNotes(vaultDir) {
  const files = findExampleNotes(vaultDir);
  for (const f of files) rmSync(f);
  return files;
}

// ═══════════════════════════════════════════════════════════════════════════
// example-notes.mjs — détection/suppression des notes d'exemple du vault.
//
// Les notes de démo livrées avec le générateur portent le tag `exemple` dans leur
// frontmatter. La machinerie (vault/backlog/harnais.md) et la doc (README.md)
// ne le portent pas → elles sont préservées. But : permettre à l'installeur de
// vider le vault d'exemple pour ne pas polluer le RAG du vrai second cerveau.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

// Vrai si le frontmatter Markdown contient un tag `exemple`.
export function isExampleNote(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  const tags = fm[1].match(/^tags:\s*\[([^\]]*)\]/m);
  if (!tags) return false;
  return tags[1].split(",").map((t) => t.trim()).includes("exemple");
}

// Liste récursive des fichiers .md sous vaultDir qui sont des notes d'exemple.
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

// Supprime les notes d'exemple sous vaultDir ; renvoie les chemins supprimés.
export function clearExampleNotes(vaultDir) {
  const files = findExampleNotes(vaultDir);
  for (const f of files) rmSync(f);
  return files;
}

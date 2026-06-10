import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLsFilesZ, filterCopyable } from "./tracked-files.mjs";

test("parseLsFilesZ — sépare sur NUL et ignore l'entrée vide finale", () => {
  assert.deepEqual(parseLsFilesZ("a\0b/c\0"), ["a", "b/c"]);
});

test("parseLsFilesZ — sortie vide → []", () => {
  assert.deepEqual(parseLsFilesZ(""), []);
});

test("filterCopyable — exclut DEVELOPING.md (fichier du launcher uniquement)", () => {
  assert.deepEqual(
    filterCopyable(["README.md", "DEVELOPING.md", "rag/src/index.ts"]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — exclut EN-QUOI-C-EST-DIFFERENT.md (fiche de positionnement du launcher)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "EN-QUOI-C-EST-DIFFERENT.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — exclut tout le dossier maintainers/ (contexte de dev du générateur)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "maintainers/README.md",
      "maintainers/decisions/0001-launcher-vs-brain.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — exclut l'outillage de mesure rag/scripts/ (dev-only : caler EMBED_BATCH, défaut = vault confidentiel)", () => {
  assert.deepEqual(
    filterCopyable([
      "rag/src/index.ts", // moteur RAG : copié
      "rag/scripts/measure-batch.mts",
    ]),
    ["rag/src/index.ts"],
  );
});

test("filterCopyable — excludes templates/ (locale sources are overlaid, not bulk-copied)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "templates/en/CLAUDE.md.template",
      "templates/fr/vault/README.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — exclut l'outillage d'eval-set (dev-only : sert à choisir l'embedder du launcher)", () => {
  assert.deepEqual(
    filterCopyable([
      "scripts/verify-rag.mjs", // reste copié (utilisé dans le cerveau)
      "scripts/run-eval.mjs",
      "scripts/lib/eval-judge.mjs",
      "scripts/lib/eval-judge.test.mjs",
      "scripts/lib/eval-run.mjs",
      "scripts/lib/eval-set.mjs",
      "scripts/lib/mcp-search.mjs",
      "scripts/lib/mcp-search.test.mjs",
      "rag/src/index.ts",
    ]),
    ["scripts/verify-rag.mjs", "rag/src/index.ts"],
  );
});

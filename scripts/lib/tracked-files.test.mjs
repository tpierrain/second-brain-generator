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

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

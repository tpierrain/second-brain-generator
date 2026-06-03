import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLsFilesZ } from "./tracked-files.mjs";

test("parseLsFilesZ — sépare sur NUL et ignore l'entrée vide finale", () => {
  assert.deepEqual(parseLsFilesZ("a\0b/c\0"), ["a", "b/c"]);
});

test("parseLsFilesZ — sortie vide → []", () => {
  assert.deepEqual(parseLsFilesZ(""), []);
});

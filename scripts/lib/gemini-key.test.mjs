import { test } from "node:test";
import assert from "node:assert/strict";
import { hasGeminiKey } from "./gemini-key.mjs";

test("hasGeminiKey — clé renseignée → true", () => {
  assert.equal(hasGeminiKey("GOOGLE_GEMINI_API_KEY=AIzaSyABC123\n"), true);
});

test("hasGeminiKey — ligne présente mais valeur vide → false", () => {
  assert.equal(hasGeminiKey("GOOGLE_GEMINI_API_KEY=\n"), false);
});

test("hasGeminiKey — clé absente du fichier → false", () => {
  assert.equal(hasGeminiKey("# rien ici\nQUERY_RESERVE=50\n"), false);
});

test("hasGeminiKey — .env inexistant (null/undefined) → false", () => {
  assert.equal(hasGeminiKey(null), false);
  assert.equal(hasGeminiKey(undefined), false);
});

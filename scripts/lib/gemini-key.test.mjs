import { test } from "node:test";
import assert from "node:assert/strict";
import { hasGeminiKey, geminiKeyRequired } from "./gemini-key.mjs";

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

test("geminiKeyRequired — provider absent (défaut Gemini) → true", () => {
  assert.equal(geminiKeyRequired("QUERY_RESERVE=50\n"), true);
  assert.equal(geminiKeyRequired(null), true);
});

test("geminiKeyRequired — provider in-process → false (aucune clé Gemini)", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=in-process\n"), false);
});

test("geminiKeyRequired — provider openai-compatible → false", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=openai-compatible\nEMBEDDING_BASE_URL=http://x\n"), false);
});

test("geminiKeyRequired — provider explicitement gemini → true", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=gemini\n"), true);
});

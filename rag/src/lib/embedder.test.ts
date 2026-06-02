import { test } from "node:test";
import assert from "node:assert/strict";
import { embedQuery, embedTexts, type QuotaGuard } from "./embedder.js";

// Espionne quel chemin de quota est consommé, sans toucher au réseau.
class SpyGuard implements QuotaGuard {
  calls: string[] = [];
  consume(): void {
    this.calls.push("index");
  }
  consumePriority(): void {
    this.calls.push("priority");
  }
}

test("embedQuery consomme en prioritaire (jamais bloqué par l'indexation)", async () => {
  const guard = new SpyGuard();
  await embedQuery("q", { usage: guard, embedOne: async () => [1, 2, 3] });
  assert.deepEqual(guard.calls, ["priority"]);
});

test("embedTexts consomme en indexation, une fois par texte", async () => {
  const guard = new SpyGuard();
  const out = await embedTexts(["a", "b"], {
    usage: guard,
    embedOne: async (t) => [t.length],
  });
  assert.deepEqual(guard.calls, ["index", "index"]);
  assert.deepEqual(out, [[1], [1]]);
});

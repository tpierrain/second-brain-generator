import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inProcessAvailable,
  recommendedEmbedderKey,
  buildEmbedderOptions,
  envConfigForEmbedder,
} from "./embedder-choice.mjs";

const GiB = 1024 ** 3;

test("inProcessAvailable — faux sur Mac Intel (darwin/x64, ONNX non couvert)", () => {
  assert.equal(inProcessAvailable({ platform: "darwin", arch: "x64" }), false);
});

test("inProcessAvailable — vrai ailleurs (Apple Silicon, Windows, Linux)", () => {
  assert.equal(inProcessAvailable({ platform: "darwin", arch: "arm64" }), true);
  assert.equal(inProcessAvailable({ platform: "win32", arch: "x64" }), true);
  assert.equal(inProcessAvailable({ platform: "linux", arch: "x64" }), true);
});

test("recommendedEmbedderKey — Mac Intel → api (in-process indisponible)", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "darwin", arch: "x64", totalMemBytes: 32 * GiB }),
    "api",
  );
});

test("recommendedEmbedderKey — poste capable (≥ 12 Go, Apple Silicon) → in-process", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "darwin", arch: "arm64", totalMemBytes: 16 * GiB }),
    "in-process",
  );
});

test("recommendedEmbedderKey — petit poste (< 12 Go) → api même si in-process dispo", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "win32", arch: "x64", totalMemBytes: 8 * GiB }),
    "api",
  );
});

test("recommendedEmbedderKey — seuil à 12 Go exactement → in-process", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "win32", arch: "x64", totalMemBytes: 12 * GiB }),
    "in-process",
  );
});

test("buildEmbedderOptions — poste capable : 3 options (ordre confidentialité), in-process ⭐", () => {
  const opts = buildEmbedderOptions({ platform: "darwin", arch: "arm64", totalMemBytes: 16 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["in-process", "api", "ollama"],
  );
  assert.deepEqual(
    opts.map((o) => o.num),
    [1, 2, 3],
  );
  assert.deepEqual(
    opts.map((o) => o.recommended),
    [true, false, false],
  );
});

test("buildEmbedderOptions — Mac Intel : in-process masqué, renuméroté, api ⭐", () => {
  const opts = buildEmbedderOptions({ platform: "darwin", arch: "x64", totalMemBytes: 32 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["api", "ollama"],
  );
  assert.deepEqual(
    opts.map((o) => o.num),
    [1, 2],
  );
  assert.equal(opts.find((o) => o.key === "api").recommended, true);
});

test("buildEmbedderOptions — petit poste capable : api ⭐ mais in-process reste listé", () => {
  const opts = buildEmbedderOptions({ platform: "win32", arch: "x64", totalMemBytes: 8 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["in-process", "api", "ollama"],
  );
  assert.equal(opts.find((o) => o.key === "api").recommended, true);
  assert.equal(opts.find((o) => o.key === "in-process").recommended, false);
});

test("envConfigForEmbedder — in-process : EMBEDDING_PROVIDER=in-process, pas de clé Gemini", () => {
  const cfg = envConfigForEmbedder("in-process");
  assert.deepEqual(cfg.lines, ["EMBEDDING_PROVIDER=in-process"]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — gemini : aucune ligne provider (défaut), clé Gemini requise", () => {
  const cfg = envConfigForEmbedder("gemini");
  assert.deepEqual(cfg.lines, []);
  assert.equal(cfg.needsGeminiKey, true);
});

test("envConfigForEmbedder — openai-compatible : URL/modèle/dimension depuis les détails", () => {
  const cfg = envConfigForEmbedder("openai-compatible", {
    baseURL: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimension: 1536,
  });
  assert.deepEqual(cfg.lines, [
    "EMBEDDING_PROVIDER=openai-compatible",
    "EMBEDDING_BASE_URL=https://api.openai.com/v1",
    "EMBEDDING_MODEL_NAME=text-embedding-3-small",
    "EMBEDDING_DIMENSION=1536",
  ]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — ollama : openai-compatible vers localhost, défauts embeddinggemma", () => {
  const cfg = envConfigForEmbedder("ollama");
  assert.deepEqual(cfg.lines, [
    "EMBEDDING_PROVIDER=openai-compatible",
    "EMBEDDING_BASE_URL=http://localhost:11434/v1",
    "EMBEDDING_MODEL_NAME=embeddinggemma",
    "EMBEDDING_DIMENSION=768",
  ]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — ollama : modèle/dimension surchargeables", () => {
  const cfg = envConfigForEmbedder("ollama", { model: "bge-m3", dimension: 1024 });
  assert.equal(cfg.lines.includes("EMBEDDING_MODEL_NAME=bge-m3"), true);
  assert.equal(cfg.lines.includes("EMBEDDING_DIMENSION=1024"), true);
});

test("envConfigForEmbedder — clé inconnue : échec bruyant (pas de config silencieuse)", () => {
  assert.throws(() => envConfigForEmbedder("bidon"), /bidon/);
});

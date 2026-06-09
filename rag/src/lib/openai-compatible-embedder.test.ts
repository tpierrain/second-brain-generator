import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OpenAiCompatibleEmbedder,
  type EmbeddingFetch,
} from "./openai-compatible-embedder.js";

// Capture la requête HTTP sortante et renvoie une réponse OpenAI canonique,
// sans toucher au réseau. `vectors` = ce que le faux endpoint renvoie, dans l'ordre.
function fakeFetch(vectors: number[][]): {
  fetch: EmbeddingFetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: EmbeddingFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: vectors.map((embedding) => ({ embedding })) }),
    };
  };
  return { fetch, calls };
}

test("identity (provider/modèle/dimension) renseignée depuis la config — clé de l'estampille", () => {
  const embedder = new OpenAiCompatibleEmbedder({
    baseURL: "http://localhost:11434/v1",
    apiKey: "",
    model: "bge-m3",
    dimension: 1024,
  });

  assert.deepEqual(embedder.identity, {
    providerId: "openai-compatible",
    model: "bge-m3",
    dimension: 1024,
  });
});

test("embedQuery : POST { model, input } sur <baseURL>/embeddings, lit data[0].embedding", async () => {
  const { fetch, calls } = fakeFetch([[0.1, 0.2, 0.3]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 3,
    },
    fetch
  );

  const vector = await embedder.embedQuery("une question");

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:11434/v1/embeddings");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    model: "bge-m3",
    input: "une question",
  });
});

test("embedDocuments : envoie le lot en input[], lit data[].embedding dans l'ordre", async () => {
  const { fetch, calls } = fakeFetch([
    [1, 0],
    [0, 1],
  ]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 2,
    },
    fetch
  );

  const vectors = await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(vectors, [
    [1, 0],
    [0, 1],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body as string).input, [
    "doc A",
    "doc B",
  ]);
});

test("clé présente (endpoint API) → header Authorization: Bearer <clé>", async () => {
  const { fetch, calls } = fakeFetch([[1]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-secret",
      model: "text-embedding-3-small",
      dimension: 1,
    },
    fetch
  );

  await embedder.embedQuery("q");

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-secret");
});

test("clé vide (local Ollama) → AUCUN header Authorization", async () => {
  const { fetch, calls } = fakeFetch([[1]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 1,
    },
    fetch
  );

  await embedder.embedQuery("q");

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal("Authorization" in headers, false);
});

test("réponse HTTP non-ok → erreur claire (statut visible), pas un vecteur vide silencieux", async () => {
  const failingFetch: EmbeddingFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "invalid key" } }),
  });
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "https://api.openai.com/v1",
      apiKey: "bad",
      model: "text-embedding-3-small",
      dimension: 1,
    },
    failingFetch
  );

  await assert.rejects(() => embedder.embedQuery("q"), /401/);
});

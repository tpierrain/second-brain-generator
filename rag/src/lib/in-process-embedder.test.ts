import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InProcessEmbedder,
  promptsForModel,
  EMBED_BATCH,
  type FeatureExtractor,
} from "./in-process-embedder.js";

// Faux extractor (le pipeline Transformers.js, sans télécharger les poids) : capture
// les appels et renvoie un tenseur-like dont `tolist()` rend les vecteurs voulus.
function fakeExtractor(vectors: number[][]): {
  load: () => Promise<FeatureExtractor>;
  calls: { input: string | string[]; opts: unknown }[];
} {
  const calls: { input: string | string[]; opts: unknown }[] = [];
  const extractor: FeatureExtractor = async (input, opts) => {
    calls.push({ input, opts });
    return { tolist: () => vectors };
  };
  return { load: async () => extractor, calls };
}

test("identity (provider/modèle/dimension) renseignée depuis la config — clé de l'estampille", () => {
  const embedder = new InProcessEmbedder({
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });

  assert.deepEqual(embedder.identity, {
    providerId: "transformers-js",
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });
});

test("embedQuery : pooling moyen + normalisation via l'extractor, renvoie le 1ᵉʳ vecteur", async () => {
  const { load, calls } = fakeExtractor([[0.1, 0.2, 0.3]]);
  const embedder = new InProcessEmbedder(
    { model: "m", dimension: 3 },
    load
  );

  const vector = await embedder.embedQuery("une question");

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].opts, { pooling: "mean", normalize: true });
});

test("embedDocuments : encode le lot et renvoie les vecteurs dans l'ordre", async () => {
  const { load, calls } = fakeExtractor([
    [1, 0],
    [0, 1],
  ]);
  const embedder = new InProcessEmbedder({ model: "m", dimension: 2 }, load);

  const vectors = await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(vectors, [
    [1, 0],
    [0, 1],
  ]);
  assert.deepEqual(calls[0].input, ["doc A", "doc B"]);
});

test("embedDocuments : plafonne la taille de lot — découpe en sous-lots bornés, concatène dans l'ordre", async () => {
  // Fake qui renvoie un vecteur par texte d'entrée (echo numérique), et capture
  // chaque sous-lot reçu : on prouve à la fois le découpage et l'ordre de sortie.
  const calls: string[][] = [];
  const load: () => Promise<FeatureExtractor> = async () => async (input) => {
    const slice = input as string[];
    calls.push(slice);
    return { tolist: () => slice.map((s) => [Number(s)]) };
  };
  const embedder = new InProcessEmbedder(
    { model: "m", dimension: 1, batchSize: 2 },
    load
  );

  const vectors = await embedder.embedDocuments(["1", "2", "3", "4", "5"]);

  // 5 textes, lot plafonné à 2 → 3 sous-lots : [1,2] [3,4] [5]
  assert.deepEqual(calls, [["1", "2"], ["3", "4"], ["5"]]);
  // vecteurs reconcaténés dans l'ordre d'origine (rien ne se perd ni ne se mélange)
  assert.deepEqual(vectors, [[1], [2], [3], [4], [5]]);
});

test("embedDocuments : sans batchSize configuré, applique le plafond par défaut EMBED_BATCH (chemin de prod)", async () => {
  const calls: string[][] = [];
  const load: () => Promise<FeatureExtractor> = async () => async (input) => {
    const slice = input as string[];
    calls.push(slice);
    return { tolist: () => slice.map(() => [0]) };
  };
  // selectEmbedder construit l'adaptateur SANS batchSize → c'est le défaut qui doit protéger.
  const embedder = new InProcessEmbedder({ model: "m", dimension: 1 }, load);

  const texts = Array.from({ length: EMBED_BATCH + 1 }, (_, i) => String(i));
  await embedder.embedDocuments(texts);

  // un de plus que le plafond → 2 sous-lots, le 1ᵉʳ plein
  assert.equal(calls.length, 2);
  assert.equal(calls[0].length, EMBED_BATCH);
  assert.equal(calls[1].length, 1);
});

test("chargement du modèle impossible → erreur claire (modèle nommé), jamais un vecteur vide", async () => {
  const load: () => Promise<FeatureExtractor> = async () => {
    throw new Error("offline: download failed");
  };
  const embedder = new InProcessEmbedder(
    { model: "onnx-community/embeddinggemma-300m-ONNX", dimension: 768 },
    load
  );

  await assert.rejects(
    () => embedder.embedQuery("q"),
    /embeddinggemma-300m-ONNX/
  );
});

test("prompts configurés : embedQuery préfixe la question (EmbeddingGemma exige un prompt de tâche)", async () => {
  const { load, calls } = fakeExtractor([[1]]);
  const embedder = new InProcessEmbedder(
    {
      model: "embeddinggemma",
      dimension: 1,
      prompts: { query: "task: search result | query: ", document: "title: none | text: " },
    },
    load
  );

  await embedder.embedQuery("le slogan de Flemmr");

  assert.deepEqual(calls[0].input, ["task: search result | query: le slogan de Flemmr"]);
});

test("prompts configurés : embedDocuments préfixe chaque document", async () => {
  const { load, calls } = fakeExtractor([
    [1],
    [1],
  ]);
  const embedder = new InProcessEmbedder(
    {
      model: "embeddinggemma",
      dimension: 1,
      prompts: { query: "task: search result | query: ", document: "title: none | text: " },
    },
    load
  );

  await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(calls[0].input, [
    "title: none | text: doc A",
    "title: none | text: doc B",
  ]);
});

test("sans prompts : texte brut (modèles type bge-m3 n'en veulent pas)", async () => {
  const { load, calls } = fakeExtractor([[1]]);
  const embedder = new InProcessEmbedder({ model: "bge-m3", dimension: 1 }, load);

  await embedder.embedQuery("brut");

  assert.deepEqual(calls[0].input, ["brut"]);
});

test("promptsForModel : EmbeddingGemma → prompts de tâche query/document ; bge-m3 → aucun", () => {
  const gemma = promptsForModel("onnx-community/embeddinggemma-300m-ONNX");
  assert.deepEqual(gemma, {
    query: "task: search result | query: ",
    document: "title: none | text: ",
  });

  assert.equal(promptsForModel("Xenova/bge-m3"), undefined);
});

test("le pipeline n'est chargé qu'une fois (modèle coûteux), réutilisé entre appels", async () => {
  let loads = 0;
  const load: () => Promise<FeatureExtractor> = async () => {
    loads++;
    return async () => ({ tolist: () => [[1]] });
  };
  const embedder = new InProcessEmbedder({ model: "m", dimension: 1 }, load);

  await embedder.embedQuery("a");
  await embedder.embedDocuments(["b", "c"]);
  await embedder.embedQuery("d");

  assert.equal(loads, 1);
});

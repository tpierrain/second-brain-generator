// ═══════════════════════════════════════════════════════════════════════════
// health-vitals.ts — headless snapshot of the engine's FUNCTIONAL state for the
// SessionStart health-check (ADR 0028, F7). Spawned by health-probe-run.mjs's
// DETACHED probe child, which cannot import the rag runtime (embedder + vector
// store) itself. Prints one JSON line of raw vitals; the .mjs maps them onto the
// pure probe registry (runHealthProbes). Glue — mirrors verify-rag.mjs: the
// functions it calls are already unit-tested; the value here is wiring them.
//
// Determinism (ADR 0009): the RAG vitals come from REALLY embedding + searching the
// canary, not a file guess. `embedderReady` separates "embedder ran, search found
// nothing" (a true break) from "embedder could not run" (e.g. missing API key →
// the .mjs maps that to "unknown", never a scary false "broken").
// ═══════════════════════════════════════════════════════════════════════════
import { createEmbedder } from "./lib/embedder.js";
import { getStats, searchSimilar } from "./lib/vector-store.js";

const CANARY_TOKEN = "Mollecuisse";

async function gatherVitals() {
  const embedder = createEmbedder();
  const embedderMode = embedder.identity.providerId;
  // API providers need a key; the in-process adapter never does (it embeds locally).
  const keyConfigured =
    embedderMode === "gemini"
      ? Boolean(process.env.GOOGLE_GEMINI_API_KEY)
      : embedderMode === "openai-compatible"
        ? Boolean(process.env.EMBEDDING_API_KEY)
        : true;

  // -1 = the index could not be read at all → the .mjs maps a negative count to a
  // thrown seam → "unknown" (not the "empty index" → "broken" of a real 0).
  let indexRows = -1;
  try {
    indexRows = getStats().chunkCount;
  } catch {
    indexRows = -1;
  }

  // The real canary: embed + search in ONE go. Success proves the embedder loads,
  // the index is queryable, and retrieval returns the seeded demo note.
  let embedderReady = false;
  let canaryHits = 0;
  try {
    const queryEmbedding = await embedder.embedQuery(CANARY_TOKEN);
    embedderReady = true;
    canaryHits = searchSimilar(queryEmbedding, 8).length;
  } catch {
    embedderReady = false;
  }

  return { embedderMode, keyConfigured, embedderReady, indexRows, canaryHits };
}

gatherVitals()
  .then((v) => process.stdout.write(JSON.stringify(v)))
  .catch((err) => process.stdout.write(JSON.stringify({ error: String(err?.message ?? err) })));

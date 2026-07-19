#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// health-check-cli.ts — the HEADLESS health-check entry (ADR 0030 §3/§4/§6,
// F7-ter). Runs the SAME rag/src/lib/health-check.ts logic the MCP `health_check`
// tool runs, but HEADLESS: read-only, NO server boot, NO reindex, NO watcher. It
// reads the on-disk state a running vault-rag serves — the layer Claude is blind to
// (degraded data behind a live server) — and prints the standard contract
// { status, checks[] } as one JSON line.
//
//   --depth light   (default) → file/DB reads only, ZERO ONNX (per-session probe)
//   --depth full              → real embed + search of the canary (manual verify-rag)
//
// Why headless, never a spawn: a vault-rag MCP server is a PRIVATE stdio child of
// Claude (no socket) — booting one here would test a DIFFERENT process, not the live
// one, and waste resources. Only the installer post-flight legitimately boots (nothing
// is running yet; it proves deployment under the real launcher/PATH/ABI — ADR 0021).
//
// Glue (not unit-tested, mirrors verify-rag.mjs): the functions it calls are already
// unit-tested; the value here is wiring the real seams (vector store, embedder, vault
// path) to the pure aggregator. Proven empirically by running it.
// ═══════════════════════════════════════════════════════════════════════════
import { existsSync } from "fs";
import { resolve } from "path";
import { createEmbedder } from "./lib/embedder.js";
import { getStats, searchSimilar } from "./lib/vector-store.js";
import { DEFAULT_UNIVERSE } from "./lib/universe.js";
import { VAULT_DIR, SEARCH_DEFAULT_LIMIT } from "./lib/config.js";
import {
  runHealthCheck,
  HEALTH_CHECK_NOTE_RELPATH,
  type HealthDepth,
  type VitalsSeams,
} from "./lib/health-check.js";

const depthArg = process.argv[process.argv.indexOf("--depth") + 1];
const depth: HealthDepth = depthArg === "full" ? "full" : "light";

// createEmbedder() is LAZY: it picks the adapter and memoizes it, but the in-process
// ONNX pipeline only loads on the first real embed — so this stays cheap at light depth.
const embedder = createEmbedder();
const embedderMode = embedder.identity.providerId;
// API providers need a key; the in-process adapter ("transformers-js") never does.
const keyConfigured =
  embedderMode === "gemini"
    ? Boolean(process.env.GOOGLE_GEMINI_API_KEY)
    : embedderMode === "openai-compatible"
      ? Boolean(process.env.EMBEDDING_API_KEY)
      : true;

const seams: VitalsSeams = {
  embedderMode,
  keyConfigured,
  readIndexRows: () => getStats().chunkCount,
  canaryNoteExists: () => existsSync(resolve(VAULT_DIR, HEALTH_CHECK_NOTE_RELPATH)),
  // FULL only: embed + search the canary in one go (loads ONNX / hits the API).
  searchCanary: async (token) => {
    const queryEmbedding = await embedder.embedQuery(token);
    // Health canary: an engine self-check, universe-agnostic → span all.
    return searchSimilar(queryEmbedding, SEARCH_DEFAULT_LIMIT, {
      universe: DEFAULT_UNIVERSE,
      allUniverses: true,
    }).length;
  },
  // LIGHT only: readiness WITHOUT running the embedder. The in-process adapter needs
  // no key and its weights re-download on first embed (a loud, self-healing event, not
  // a silent degraded mode) → keyConfigured is true for it; API readiness = key set.
  weightsReady: () => keyConfigured,
};

runHealthCheck(seams, depth)
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((err) =>
    process.stdout.write(
      JSON.stringify({ status: "unknown", checks: [], error: String(err?.message ?? err) }),
    ),
  );

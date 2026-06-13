// ═══════════════════════════════════════════════════════════════════════════
// measure-contention.mts — DEV-ONLY (excluded from the brain). Answers the
// architecture question: "the MCP server indexes WITHIN its process; will a search
// launched DURING indexing lag?"
//
// Faithfully reproduces the real architecture (index.ts):
//   • search_vault calls createEmbedder() ON EVERY request  → we do the same.
//   • reindex() runs in the background (embedDocuments in a loop, batch=EMBED_BATCH).
//
// Measures 3 things:
//   A. Cost of a REPEATED createEmbedder()+embedQuery (does the session stay warm
//      between instances, or a cold-start ~675 ms on every search?).
//   B. Search latency AT REST (baseline).
//   C. Search latency DURING a background indexing (CPU contention).
//
//   Run:  cd rag && npx tsx scripts/measure-contention.mts
// ═══════════════════════════════════════════════════════════════════════════
process.env.EMBEDDING_PROVIDER = "in-process";

import { createEmbedder } from "../src/lib/embedder.js";

const now = () => Number(process.hrtime.bigint() / 1_000_000n);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const summary = (label: string, xs: number[]) =>
  `${label}: n=${xs.length} min=${Math.min(...xs)}ms p50=${pct(xs, 50)}ms p95=${pct(xs, 95)}ms max=${Math.max(...xs)}ms`;

// A "search" as search_vault does it: a fresh createEmbedder() + embedQuery.
async function searchOnce(query: string): Promise<number> {
  const t = now();
  const embedder = createEmbedder();
  await embedder.embedQuery(query);
  return now() - t;
}

// Fake corpus of "long" documents (close to a transcript: ~1500 characters).
function fakeDocs(n: number): string[] {
  const lorem =
    "Weekly synthesis meeting on engineering and product topics. " +
    "We discuss architecture, RAG, embeddings and the roadmap. ";
  return Array.from({ length: n }, (_, i) => `Note ${i} — ` + lorem.repeat(12));
}

async function main() {
  console.log("⏳ Loading the model (1st search, cold-start expected)…");
  const warm = await searchOnce("first canary question");
  console.log(`  1st search (cold): ${warm}ms\n`);

  // ── A + B: repeated searches AT REST (no concurrent indexing) ──
  const idle: number[] = [];
  for (let i = 0; i < 12; i++) idle.push(await searchOnce(`rest question ${i}`));
  console.log(summary("A/B  REST  (createEmbedder()+embedQuery per request)", idle));
  console.log(
    idle.slice(1).every((x) => x < 200)
      ? "  → session WARM between instances (no reload per search). ✅\n"
      : "  → ⚠️ high repeated cost: probable reload on every createEmbedder().\n",
  );

  // ── C: searches DURING a background indexing ──
  console.log("⏳ Starting a background indexing (200 long docs, batch=4)…");
  const indexer = createEmbedder();
  const docs = fakeDocs(200);
  let indexingDone = false;
  const tIndexStart = now();
  const indexingPromise = indexer.embedDocuments(docs).then(() => {
    indexingDone = true;
    return now() - tIndexStart;
  });

  const busy: number[] = [];
  while (!indexingDone) {
    busy.push(await searchOnce(`question during indexing ${busy.length}`));
    await new Promise((r) => setTimeout(r, 150)); // ~the cadence of a human typing
  }
  const indexMs = await indexingPromise;
  console.log(`  background indexing finished in ${indexMs}ms (200 docs)\n`);
  console.log(summary("C    CONTENTION (search during indexing)", busy));

  const baseP95 = pct(idle.slice(1), 95);
  const busyP95 = pct(busy, 95);
  const factor = (busyP95 / Math.max(1, baseP95)).toFixed(1);
  console.log(`\n📊 CURRENT: search at rest p95=${baseP95}ms vs under indexing p95=${busyP95}ms → ×${factor}`);

  // ═══ SIMULATED FIX: a SINGLE shared embedder (memoized at the process level) ═══
  console.log("\n──────── FIX: shared embedder (1 instance) ────────");
  const shared = createEmbedder();
  await shared.embedQuery("warm-up"); // 1st time pays the load, like today

  // A2 — at rest, reused instance (instead of createEmbedder() per request)
  const idleShared: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = now();
    await shared.embedQuery(`shared rest question ${i}`);
    idleShared.push(now() - t);
  }
  console.log(summary("A2   REST  (reused shared instance)", idleShared));

  // C2 — search during indexing, SHARING the same instance (1 ONNX session)
  console.log("⏳ Background indexing (200 docs) on the SAME shared instance…");
  let done2 = false;
  const idx2 = shared.embedDocuments(fakeDocs(200)).then(() => (done2 = true));
  const busyShared: number[] = [];
  while (!done2) {
    const t = now();
    await shared.embedQuery(`q during shared indexing ${busyShared.length}`);
    busyShared.push(now() - t);
    await new Promise((r) => setTimeout(r, 150));
  }
  await idx2;
  console.log(summary("C2   CONTENTION (shared instance)", busyShared));

  console.log(
    `\n📊 FIXED: at rest p95=${pct(idleShared, 95)}ms vs under indexing p95=${pct(busyShared, 95)}ms`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

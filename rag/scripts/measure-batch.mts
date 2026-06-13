// ─────────────────────────────────────────────────────────────────────────────
// measure-batch.mts — measure the footprint of IN-PROCESS indexing on a dense vault
// (Step 4-ter of the embedder plan: tune the batch cap `EMBED_BATCH`).
//
//   node --import tsx scripts/measure-batch.mts <batchSize> [vaultPath]
//
// Replicates selectEmbedder's in-process wiring (EmbeddingGemma-300m ONNX q8 +
// task prompts) and the indexing pipeline (scan → parse → chunk → embed per
// doc), but with a NEUTRAL persistence (counts only). Nothing is written, nothing
// leaves the process (local embedder). Samples the RSS to extract the PEAK.
//
// Output = one CSV-like line: batch, notes, chunks, peak RSS, time, chunks/s.
// Everything else in the instrument is unchanged between runs → honest comparison.
// ─────────────────────────────────────────────────────────────────────────────
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

import { parseDocument } from "../src/lib/frontmatter-parser.js";
import { chunkMarkdown } from "../src/lib/chunker.js";
import {
  InProcessEmbedder,
  promptsForModel,
} from "../src/lib/in-process-embedder.js";

const MODEL = "onnx-community/embeddinggemma-300m-ONNX";

// Public-safe default = the repo's example vault (Flemmr, 7 notes). To tune the
// cap, point at a REAL dense vault via the argument or $MEASURE_VAULT (never
// hard-coded here — a personal path has no business in the repo).
const REPO_VAULT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "vault");
const batchSize = Number(process.argv[2]);
const vaultPath = process.argv[3] ?? process.env.MEASURE_VAULT ?? REPO_VAULT;

if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error(
    "usage: node --import tsx scripts/measure-batch.mts <batchSize> [vaultPath]\n" +
      "       (otherwise $MEASURE_VAULT, otherwise the repo's example vault)"
  );
  process.exit(1);
}

/** Recursive list of .md files under `dir`. */
async function listMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (e.name.endsWith(".md")) files.push(full);
  }
  return files;
}

/** Continuously samples the RSS and keeps the peak (bytes). */
function startRssSampler(): { stop: () => number } {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 200);
  timer.unref();
  return { stop: () => { clearInterval(timer); return peak; } };
}

const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);

async function main() {
  const files = await listMarkdown(vaultPath);

  // Phase 1 — scan + parse + chunk (no embed), like index-manager.
  const docs: { path: string; contents: string[] }[] = [];
  let totalChunks = 0;
  for (const abs of files) {
    const raw = await readFile(abs, "utf-8");
    const parsed = parseDocument(raw, relative(vaultPath, abs));
    const chunks = chunkMarkdown(parsed.content);
    if (chunks.length === 0) continue;
    docs.push({ path: abs, contents: chunks.map((c) => c.content) });
    totalChunks += chunks.length;
  }

  const embedder = new InProcessEmbedder({
    model: MODEL,
    dimension: 768,
    prompts: promptsForModel(MODEL),
    batchSize,
  });

  console.error(
    `[batch=${batchSize}] ${docs.length} notes · ${totalChunks} chunks · loading the model + indexing…`
  );

  const sampler = startRssSampler();
  const t0 = process.hrtime.bigint();

  // Phase 2 — embed per doc + NEUTRAL persistence (we drop the vectors, we count).
  let embedded = 0;
  for (const doc of docs) {
    const vectors = await embedder.embedDocuments(doc.contents);
    embedded += vectors.length; // "persists": here we only count
  }

  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  const peak = sampler.stop();

  const line = [
    `batch=${batchSize}`,
    `notes=${docs.length}`,
    `chunks=${embedded}`,
    `peakRSS=${gib(peak)}GB`,
    `time=${(seconds / 60).toFixed(2)}min`,
    `throughput=${(embedded / seconds).toFixed(1)}chunks/s`,
  ].join(" · ");
  console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

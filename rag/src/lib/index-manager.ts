import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { scanVault, type ScannedFile } from "./document-scanner.js";
import { parseDocument } from "./frontmatter-parser.js";
import { chunkMarkdown } from "./chunker.js";
import { createEmbedder, type Embedder, type EmbedderIdentity } from "./embedder.js";
import {
  getDocumentHash,
  indexDocument,
  removeDeletedDocs,
  getStats,
  stampIndexIdentity,
  currentIndexIdentity,
  currentIndexSchemaVersion,
  INDEX_SCHEMA_VERSION,
} from "./vector-store.js";
import { reindexForce, shouldStamp } from "./index-freshness.js";
import { indexPreparedDocs, type PreparedDoc, type IndexPorts, type IndexRunResult } from "./indexer.js";
import { ReindexLock } from "./reindex-lock.js";
import { ReindexReporter } from "./reindex-reporter.js";
import type { WallReason } from "./progress-report.js";

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Incremental-diff decision: skip a doc only on a non-forced run whose stored hash
 * matches the freshly-computed one (content unchanged). Pure → unit-testable.
 */
export function shouldSkip(
  force: boolean,
  existingHash: string | null,
  hash: string
): boolean {
  return !force && existingHash === hash;
}

/**
 * Determines which wall cut off indexing from the error messages (null = none).
 * The LOCAL guardrail takes priority: it throws BEFORE the network call, so if it fired,
 * it is the one that cut off first (even if a 429 lingers in an earlier error).
 */
export function classifyWall(errors: string[]): WallReason {
  if (errors.some((e) => e.includes("DailyCapExceededError"))) return "local-cap";
  if (errors.some((e) => e.includes("429"))) return "google-rate-limit";
  return null;
}

export interface IndexResult {
  scanned: number;
  indexed: number;
  skipped: number;
  removed: number;
  errors: string[];
  /** true if another process already held the lock → reindex skipped (no-op). */
  skippedLocked?: boolean;
}

/**
 * Store-side effectful seams of a reindex run (scan, per-doc read/hash, deleted-doc
 * pruning, index-identity stamp, persistence). Injectable so the whole `runReindex`
 * orchestration is unit-testable with in-memory fakes — cf. "test the glue too".
 * Defaults wire the real modules (see {@link defaultStorePorts}).
 */
export interface ReindexStorePorts {
  scan: () => Promise<ScannedFile[]>;
  readFile: (absolutePath: string) => Promise<string>;
  getDocumentHash: (relativePath: string) => string | null;
  removeDeletedDocs: (existingPaths: Set<string>) => number;
  currentIndexSchemaVersion: () => number | null;
  currentIndexIdentity: () => EmbedderIdentity | null;
  stampIndexIdentity: (identity: EmbedderIdentity) => void;
  indexDocument: (
    relativePath: string,
    title: string,
    type: string,
    tags: string[],
    hash: string,
    chunks: Array<{
      section: string;
      content: string;
      chunkIndex: number;
      embedding: number[];
    }>,
    sourceUrl: string | null
  ) => void;
}

const defaultStorePorts: ReindexStorePorts = {
  scan: () => scanVault(),
  readFile: (absolutePath) => readFile(absolutePath, "utf-8"),
  getDocumentHash,
  removeDeletedDocs,
  currentIndexSchemaVersion,
  currentIndexIdentity,
  stampIndexIdentity,
  indexDocument,
};

export interface ReindexOptions {
  /** Single-writer lock (default: file lock in CACHE_DIR). */
  lock?: ReindexLock;
  /** Embedder (SPI port) — injectable for tests; default createEmbedder(). */
  embedder?: Embedder;
  /** Progress reporter (default: file persistence in CACHE_DIR). */
  reporter?: ReindexReporter;
  /** Store-side effect ports — injectable for tests; default the real modules. */
  ports?: ReindexStorePorts;
}

export async function reindex(
  force = false,
  opts: ReindexOptions = {}
): Promise<IndexResult> {
  const lock = opts.lock ?? new ReindexLock();
  const embedder = opts.embedder ?? createEmbedder();
  const reporter = opts.reporter ?? new ReindexReporter();
  const ports = opts.ports ?? defaultStorePorts;

  // Single-writer: if another process is already indexing, we step aside (no-op) so as
  // not to double the quota consumption. Acquired up front → no pointless scan or DB.
  if (!lock.acquire()) {
    return {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      errors: [],
      skippedLocked: true,
    };
  }

  try {
    return await runReindex(force, embedder, reporter, ports);
  } finally {
    lock.release();
  }
}

async function runReindex(
  requestedForce: boolean,
  embedder: Embedder,
  reporter: ReindexReporter,
  ports: ReindexStorePorts
): Promise<IndexResult> {
  // A stale index SCHEMA can only be repaired by a full re-encode: an incremental
  // run skips unchanged docs (old format left in place) AND never re-stamps the
  // schema version (shouldStamp returns false on an already-stamped index), so the
  // staleness gate (index.ts) would loop forever on every search. So a schema bump
  // forces a full reindex — which also restamps the schema via stampIndexIdentity.
  const force = reindexForce(
    requestedForce,
    ports.currentIndexSchemaVersion(),
    INDEX_SCHEMA_VERSION
  );
  const files = await ports.scan();
  const result: IndexResult = {
    scanned: files.length,
    indexed: 0,
    skipped: 0,
    removed: 0,
    errors: [],
  };

  const existingPaths = new Set(files.map((f) => f.relativePath));
  result.removed = ports.removeDeletedDocs(existingPaths);

  // Phase 1 — scan + incremental diff + chunking (no network). We prepare the
  // docs to (re)index; unchanged ones (identical hash) are skipped.
  const toIndex: PreparedDoc[] = [];
  for (const file of files) {
    try {
      const raw = await ports.readFile(file.absolutePath);
      const hash = sha256(raw);
      const existingHash = ports.getDocumentHash(file.relativePath);

      if (shouldSkip(force, existingHash, hash)) {
        result.skipped++;
        continue;
      }

      const parsed = parseDocument(raw, file.relativePath);
      const chunks = chunkMarkdown(parsed.content, parsed.title);
      toIndex.push({
        relativePath: file.relativePath,
        title: parsed.title,
        type: parsed.type,
        tags: parsed.tags,
        hash,
        sourceUrl: parsed.sourceUrl,
        chunks: chunks.map((c) => ({
          section: c.section,
          content: c.content,
          chunkIndex: c.index,
        })),
      });
    } catch (err) {
      result.errors.push(`Read error: ${file.relativePath}: ${err}`);
    }
  }

  // Phase 2 — embedding + persistence ON THE FLY, one doc at a time.
  // Each completed doc is saved atomically; at the quota wall we stop and
  // everything done so far is kept (free resume on the next run).
  // Instrumented by the reporter (start/tick/finish) for observability.
  // Identity stamp: we (re)stamp the current embedder's identity ONLY
  // when the index truly reflects it (force, or a pristine index) — cf. shouldStamp.
  // Incrementally on an already-stamped index, we don't touch it (we never
  // dress up a mixed index as "fresh"). Stamped BEFORE the phase: even a run cut off
  // by the quota wall leaves an index consistent in identity (everything = current embedder).
  if (shouldStamp(force, ports.currentIndexIdentity())) {
    ports.stampIndexIdentity(embedder.identity);
  }

  const runResult = await runIndexingPhase(
    toIndex,
    {
      embed: (texts) => embedder.embedDocuments(texts),
      persist: (doc, embeddings) =>
        ports.indexDocument(
          doc.relativePath,
          doc.title,
          doc.type,
          doc.tags,
          doc.hash,
          doc.chunks.map((c, i) => ({
            section: c.section,
            content: c.content,
            chunkIndex: c.chunkIndex,
            embedding: embeddings[i],
          })),
          doc.sourceUrl ?? null
        ),
    },
    reporter,
    { scanned: result.scanned, skipped: result.skipped, removed: result.removed }
  );

  result.indexed += runResult.indexed;
  result.errors.push(...runResult.errors);

  return result;
}

/**
 * Instrumented Phase 2: primes the reporter (start), ticks on each persisted doc,
 * then finishes (counts + hitCap). Isolated from scan/DB to be testable.
 */
export async function runIndexingPhase(
  toIndex: PreparedDoc[],
  ports: IndexPorts,
  reporter: ReindexReporter,
  meta: { scanned: number; skipped: number; removed: number }
): Promise<IndexRunResult> {
  const totalChunks = toIndex.reduce((sum, d) => sum + d.chunks.length, 0);
  reporter.start({ totalChunks, scanned: meta.scanned, skipped: meta.skipped, removed: meta.removed });

  const result = await indexPreparedDocs(toIndex, ports, (chunks) => reporter.tick(chunks));

  // A run is "incomplete, to be resumed" as soon as a wall has cut off indexing —
  // no matter which one: our LOCAL guardrail (DailyCapExceededError) or the remote
  // GOOGLE wall (429 RESOURCE_EXHAUSTED). Symmetric → robust regardless of
  // whichever of the two is the lower.
  const wallReason = classifyWall(result.errors);
  reporter.finish({
    indexed: result.indexed,
    errors: result.errors,
    hitCap: wallReason !== null,
    wallReason,
  });
  return result;
}

export { getStats };

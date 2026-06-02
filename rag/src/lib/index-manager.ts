import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { scanVault } from "./document-scanner.js";
import { parseDocument } from "./frontmatter-parser.js";
import { chunkMarkdown } from "./chunker.js";
import { embedTexts } from "./embedder.js";
import {
  getDocumentHash,
  indexDocument,
  removeDeletedDocs,
  getStats,
} from "./vector-store.js";
import { indexPreparedDocs, type PreparedDoc, type IndexPorts, type IndexRunResult } from "./indexer.js";
import { ReindexLock } from "./reindex-lock.js";
import { ReindexReporter } from "./reindex-reporter.js";
import type { WallReason } from "./progress-report.js";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Détermine quel mur a coupé l'indexation à partir des messages d'erreur (null = aucun).
 * Le garde-fou LOCAL est prioritaire : il lève AVANT l'appel réseau, donc s'il a tiré,
 * c'est lui qui a coupé en premier (même si un 429 traîne dans une erreur antérieure).
 */
function classifyWall(errors: string[]): WallReason {
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
  /** true si un autre process tenait déjà le lock → reindex sauté (no-op). */
  skippedLocked?: boolean;
}

export interface ReindexOptions {
  /** Verrou single-writer (défaut : lock fichier dans CACHE_DIR). */
  lock?: ReindexLock;
  /** Fonction d'embedding (injectable pour les tests). */
  embed?: typeof embedTexts;
  /** Reporter d'avancement (défaut : persistance fichier dans CACHE_DIR). */
  reporter?: ReindexReporter;
}

export async function reindex(
  force = false,
  opts: ReindexOptions = {}
): Promise<IndexResult> {
  const lock = opts.lock ?? new ReindexLock();
  const embed = opts.embed ?? embedTexts;
  const reporter = opts.reporter ?? new ReindexReporter();

  // Single-writer : si un autre process indexe déjà, on s'efface (no-op) pour ne
  // pas doubler la consommation de quota. Acquis en tête → ni scan ni DB inutiles.
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
    return await runReindex(force, embed, reporter);
  } finally {
    lock.release();
  }
}

async function runReindex(
  force: boolean,
  embed: typeof embedTexts,
  reporter: ReindexReporter
): Promise<IndexResult> {
  const files = await scanVault();
  const result: IndexResult = {
    scanned: files.length,
    indexed: 0,
    skipped: 0,
    removed: 0,
    errors: [],
  };

  const existingPaths = new Set(files.map((f) => f.relativePath));
  result.removed = removeDeletedDocs(existingPaths);

  // Phase 1 — scan + diff incrémental + chunking (sans réseau). On prépare les
  // docs à (ré)indexer ; les inchangés (hash identique) sont sautés.
  const toIndex: PreparedDoc[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(file.absolutePath, "utf-8");
      const hash = sha256(raw);
      const existingHash = getDocumentHash(file.relativePath);

      if (!force && existingHash === hash) {
        result.skipped++;
        continue;
      }

      const parsed = parseDocument(raw, file.relativePath);
      const chunks = chunkMarkdown(parsed.content);
      toIndex.push({
        relativePath: file.relativePath,
        title: parsed.title,
        type: parsed.type,
        tags: parsed.tags,
        hash,
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

  // Phase 2 — embedding + persistance AU FIL DE L'EAU, un doc à la fois.
  // Chaque doc terminé est sauvé atomiquement ; au mur quota on s'arrête et
  // tout ce qui est fait est conservé (reprise gratuite au run suivant).
  // Instrumentée par le reporter (start/tick/finish) pour l'observabilité.
  const runResult = await runIndexingPhase(
    toIndex,
    {
      embed,
      persist: (doc, embeddings) =>
        indexDocument(
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
          }))
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
 * Phase 2 instrumentée : prépare le reporter (start), tick à chaque doc persisté,
 * puis finish (counts + hitCap). Isolée de scan/DB pour être testable.
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

  // Un run est « incomplet à reprendre » dès qu'un mur a coupé l'indexation —
  // peu importe lequel : notre garde-fou LOCAL (DailyCapExceededError) ou le mur
  // distant GOOGLE (429 RESOURCE_EXHAUSTED). Symétrique → robuste quel que soit
  // celui des deux qui est le plus bas.
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

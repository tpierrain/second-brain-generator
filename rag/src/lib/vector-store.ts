// better-sqlite3 is the only ABI-bound dep. Import it as a TYPE ONLY (erased at
// compile time → NO module load here): a static value import would crash the
// whole server at startup on an ABI mismatch, before we could self-heal. The
// constructor is loaded lazily in getDb() through loadNativeWithRebuild.
import type Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { DB_PATH } from "./config.js";
import { loadNativeWithRebuild, buildRebuildInvocation } from "./native-deps.js";
import type { EmbedderIdentity } from "./embedder.js";

const nodeRequire = createRequire(import.meta.url);

// rag/ root, from rag/src/lib/vector-store.ts → ../../ (where package.json lives).
function ragRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

// Rebuilds the native binding under the CURRENT Node (the one running the
// server), so the binary matches the runtime ABI. npm resolves via the launcher's
// self-heal PATH (rag/launch.sh). The invocation is platform-aware (Windows routes
// through `cmd /c` — spawning `npm.cmd` directly throws EINVAL since Node's
// April-2024 spawn hardening). Inherits stdio so the one-off cost is visible.
function rebuildBetterSqlite(): void {
  const { command, args } = buildRebuildInvocation(process.platform);
  execFileSync(command, args, { cwd: ragRoot(), stdio: "inherit" });
}

// Opens a better-sqlite3 database, self-healing a binding-ABI mismatch
// (install-Node ≠ runtime-Node on a multi-Node machine) by rebuilding once.
// IMPORTANT: the native binding loads lazily INSIDE `new Database()`, not at
// `require` time — so the ABI error only fires on construction. The self-heal
// must therefore wrap the construction (wrapping the require would never catch
// it). After a rebuild the failed dlopen was never cached → the retry reloads
// the freshly-built binary.
function openDatabase(path: string): Database.Database {
  return loadNativeWithRebuild(() => {
    const Database = nodeRequire("better-sqlite3");
    return new Database(path);
  }, rebuildBetterSqlite);
}

export type { EmbedderIdentity };

let db: Database.Database | null = null;

/**
 * Index schema version (engine-packaging Phase 0, ADR 0012). Bump this when the
 * stored index format changes incompatibly (a MAJOR `rag` bump): a brain then
 * detects its index stale and offers a reindex — reusing the embedder-swap gate.
 * An index stamped before this existed (null) is grandfathered as schema v1
 * (compatible) → no reindex prompt for existing brains.
 */
export const INDEX_SCHEMA_VERSION = 1;

/** Creates the schema (idempotent) on a given DB — testable in-memory. */
export function applySchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_url TEXT
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_path TEXT NOT NULL,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      FOREIGN KEY (doc_path) REFERENCES documents(path) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_path);
    CREATE TABLE IF NOT EXISTS index_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL
    );
  `);
  // Migration for brains whose index_meta predates schema versioning: the
  // CREATE above is a no-op on an existing table, so add the column out of band.
  // Nullable on purpose — a pre-existing row reads back null (grandfathered v1).
  if (!hasColumn(database, "index_meta", "index_schema_version")) {
    database.exec(`ALTER TABLE index_meta ADD COLUMN index_schema_version INTEGER`);
  }
  // Same out-of-band treatment for documents.source_url (clickable Notion link):
  // a brain indexed before this column existed grandfathers its rows to null.
  if (!hasColumn(database, "documents", "source_url")) {
    database.exec(`ALTER TABLE documents ADD COLUMN source_url TEXT`);
  }
}

function hasColumn(
  database: Database.Database,
  table: string,
  column: string
): boolean {
  const cols = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

/**
 * Stamps the identity of the current embedder (single row, upsert), together
 * with the schema version that produced this index (defaults to the running
 * constant — a stamp always reflects the schema of the run that wrote it).
 */
export function writeIndexIdentity(
  database: Database.Database,
  identity: EmbedderIdentity,
  schemaVersion: number = INDEX_SCHEMA_VERSION
): void {
  database
    .prepare(
      `INSERT INTO index_meta (id, provider_id, model, dimension, index_schema_version)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider_id = excluded.provider_id,
         model = excluded.model,
         dimension = excluded.dimension,
         index_schema_version = excluded.index_schema_version`
    )
    .run(identity.providerId, identity.model, identity.dimension, schemaVersion);
}

/** Reads the schema version stamped on the index, or null if never stamped. */
export function readIndexSchemaVersion(
  database: Database.Database
): number | null {
  const row = database
    .prepare("SELECT index_schema_version FROM index_meta WHERE id = 1")
    .get() as { index_schema_version: number | null } | undefined;
  return row?.index_schema_version ?? null;
}

/** Reads back the stamped identity, or null if the index was never stamped. */
export function readIndexIdentity(
  database: Database.Database
): EmbedderIdentity | null {
  const row = database
    .prepare("SELECT provider_id, model, dimension FROM index_meta WHERE id = 1")
    .get() as
    | { provider_id: string; model: string; dimension: number }
    | undefined;
  if (!row) return null;
  return {
    providerId: row.provider_id,
    model: row.model,
    dimension: row.dimension,
  };
}

function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = openDatabase(DB_PATH);
    db.pragma("journal_mode = WAL");
    applySchema(db);
  }
  return db;
}

/** Stamps the embedder identity on the active index (singleton). */
export function stampIndexIdentity(identity: EmbedderIdentity): void {
  writeIndexIdentity(getDb(), identity);
}

/** Identity stamped on the active index, or null if never stamped. */
export function currentIndexIdentity(): EmbedderIdentity | null {
  return readIndexIdentity(getDb());
}

/** Schema version stamped on the active index, or null if never stamped. */
export function currentIndexSchemaVersion(): number | null {
  return readIndexSchemaVersion(getDb());
}

export function getDocumentHash(path: string): string | null {
  const row = getDb()
    .prepare("SELECT hash FROM documents WHERE path = ?")
    .get(path) as { hash: string } | undefined;
  return row?.hash ?? null;
}

/**
 * Persists an entire document ATOMICALLY: deletes the old chunks, inserts the new
 * ones, and writes the hash — all within a single transaction.
 * Guarantees that a doc is either fully indexed (hash present) or not at all:
 * never a hash without its chunks (which would wrongly "skip" it on an incremental run).
 */
export function indexDocument(
  path: string,
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
  sourceUrl: string | null = null
): void {
  indexDocumentIn(getDb(), path, title, type, tags, hash, chunks, sourceUrl);
}

/** DB-injectable core of {@link indexDocument} — testable in-memory. */
export function indexDocumentIn(
  d: Database.Database,
  path: string,
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
  sourceUrl: string | null = null
): void {
  const insertChunkStmt = d.prepare(
    "INSERT INTO chunks (doc_path, section, content, chunk_index, embedding) VALUES (?, ?, ?, ?, ?)"
  );
  const upsertDocStmt = d.prepare(
    `INSERT INTO documents (path, title, type, tags, hash, updated_at, source_url)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title,
       type = excluded.type,
       tags = excluded.tags,
       hash = excluded.hash,
       updated_at = excluded.updated_at,
       source_url = excluded.source_url`
  );

  const tx = d.transaction(() => {
    // The parent row MUST exist before inserting its chunks: the FK
    // chunks.doc_path → documents.path is enforced (better-sqlite3 enables
    // PRAGMA foreign_keys=ON by default). For a brand-new doc, inserting the
    // chunks first violated the constraint → FOREIGN KEY constraint failed.
    upsertDocStmt.run(path, title, type, JSON.stringify(tags), hash, sourceUrl);
    d.prepare("DELETE FROM chunks WHERE doc_path = ?").run(path);
    for (const c of chunks) {
      const buf = Buffer.from(new Float32Array(c.embedding).buffer);
      insertChunkStmt.run(path, c.section, c.content, c.chunkIndex, buf);
    }
  });
  tx();
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchResult {
  path: string;
  title: string;
  type: string;
  section: string;
  content: string;
  score: number;
  sourceUrl?: string | null;
}

export function searchSimilar(
  queryEmbedding: number[],
  limit: number,
  typeFilter?: string,
  tagFilter?: string
): SearchResult[] {
  return searchSimilarIn(getDb(), queryEmbedding, limit, typeFilter, tagFilter);
}

/** DB-injectable core of {@link searchSimilar} — testable in-memory. */
export function searchSimilarIn(
  d: Database.Database,
  queryEmbedding: number[],
  limit: number,
  typeFilter?: string,
  tagFilter?: string
): SearchResult[] {
  let sql = `
    SELECT c.doc_path, c.section, c.content, c.embedding,
           d.title, d.type, d.tags, d.source_url
    FROM chunks c
    JOIN documents d ON c.doc_path = d.path
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (typeFilter) {
    conditions.push("d.type = ?");
    params.push(typeFilter);
  }
  if (tagFilter) {
    conditions.push("d.tags LIKE ?");
    params.push(`%${tagFilter}%`);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const rows = d.prepare(sql).all(...params) as Array<{
    doc_path: string;
    section: string;
    content: string;
    embedding: Buffer;
    title: string;
    type: string;
    tags: string;
    source_url: string | null;
  }>;

  const scored = rows.map((row) => {
    const emb = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    return {
      path: row.doc_path,
      title: row.title,
      type: row.type,
      section: row.section,
      content: row.content,
      score: cosineSimilarity(queryEmbedding, emb),
      sourceUrl: row.source_url,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function listDocuments(typeFilter?: string, tagFilter?: string) {
  const d = getDb();
  let sql = "SELECT path, title, type, tags, updated_at FROM documents";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (typeFilter) {
    conditions.push("type = ?");
    params.push(typeFilter);
  }
  if (tagFilter) {
    conditions.push("tags LIKE ?");
    params.push(`%${tagFilter}%`);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY path";

  return d.prepare(sql).all(...params) as Array<{
    path: string;
    title: string;
    type: string;
    tags: string;
    updated_at: string;
  }>;
}

export function getStats() {
  const d = getDb();
  const docCount = (
    d.prepare("SELECT COUNT(*) as n FROM documents").get() as { n: number }
  ).n;
  const chunkCount = (
    d.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }
  ).n;
  const types = d
    .prepare("SELECT type, COUNT(*) as n FROM documents GROUP BY type ORDER BY n DESC")
    .all() as Array<{ type: string; n: number }>;
  return { docCount, chunkCount, types };
}

export function removeDeletedDocs(existingPaths: Set<string>): number {
  const d = getDb();
  const allDocs = d.prepare("SELECT path FROM documents").all() as Array<{ path: string }>;
  let removed = 0;
  for (const doc of allDocs) {
    if (!existingPaths.has(doc.path)) {
      d.prepare("DELETE FROM chunks WHERE doc_path = ?").run(doc.path);
      d.prepare("DELETE FROM documents WHERE path = ?").run(doc.path);
      removed++;
    }
  }
  return removed;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

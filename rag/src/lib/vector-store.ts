import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DB_PATH } from "./config.js";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
    `);
  }
  return db;
}

export function getDocumentHash(path: string): string | null {
  const row = getDb()
    .prepare("SELECT hash FROM documents WHERE path = ?")
    .get(path) as { hash: string } | undefined;
  return row?.hash ?? null;
}

/**
 * Persiste un document entier de façon ATOMIQUE : suppression des anciens chunks,
 * insertion des nouveaux, et écriture du hash — le tout dans une seule transaction.
 * Garantit qu'un doc est soit complètement indexé (hash présent), soit pas du tout :
 * jamais un hash sans ses chunks (ce qui le ferait "skip" à tort au run incrémental).
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
  }>
): void {
  const d = getDb();
  const insertChunkStmt = d.prepare(
    "INSERT INTO chunks (doc_path, section, content, chunk_index, embedding) VALUES (?, ?, ?, ?, ?)"
  );
  const upsertDocStmt = d.prepare(
    `INSERT INTO documents (path, title, type, tags, hash, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title,
       type = excluded.type,
       tags = excluded.tags,
       hash = excluded.hash,
       updated_at = excluded.updated_at`
  );

  const tx = d.transaction(() => {
    // La ligne parente DOIT exister avant d'insérer ses chunks : la FK
    // chunks.doc_path → documents.path est appliquée (better-sqlite3 active
    // PRAGMA foreign_keys=ON par défaut). Pour un doc neuf, insérer les chunks
    // d'abord violait la contrainte → FOREIGN KEY constraint failed.
    upsertDocStmt.run(path, title, type, JSON.stringify(tags), hash);
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
}

export function searchSimilar(
  queryEmbedding: number[],
  limit: number,
  typeFilter?: string,
  tagFilter?: string
): SearchResult[] {
  const d = getDb();

  let sql = `
    SELECT c.doc_path, c.section, c.content, c.embedding,
           d.title, d.type, d.tags
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

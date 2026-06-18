/** A chunk ready to be embedded and then persisted. */
export interface PreparedChunk {
  section: string;
  content: string;
  chunkIndex: number;
}

/** A ready document: metadata + chunks. The hash drives the incremental diff. */
export interface PreparedDoc {
  relativePath: string;
  title: string;
  type: string;
  tags: string[];
  hash: string;
  chunks: PreparedChunk[];
}

/** Injected dependencies — decouple the orchestration from the API and SQLite. */
export interface IndexPorts {
  embed(texts: string[]): Promise<number[][]>;
  persist(doc: PreparedDoc, embeddings: number[][]): void;
}

export interface IndexRunResult {
  indexed: number;
  errors: string[];
}

/**
 * Indexes the docs one by one: embeds the doc's chunks, then persists the doc
 * (atomically, on the port side). Every completed doc is saved immediately.
 */
export async function indexPreparedDocs(
  docs: PreparedDoc[],
  ports: IndexPorts,
  onProgress?: (chunks: number) => void
): Promise<IndexRunResult> {
  let indexed = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    if (doc.chunks.length === 0) {
      // Should not happen now that chunking always seeds a title chunk. If it ever
      // does, surface it loudly instead of dropping the doc silently (that silent
      // drop was the F8 root cause): keep it out of the index but account for it.
      errors.push(`No chunk produced at ${doc.relativePath} (doc skipped)`);
      continue;
    }

    let embeddings: number[][];
    try {
      embeddings = await ports.embed(doc.chunks.map((c) => c.content));
    } catch (err) {
      // Dominant case: quota wall (or network). The following docs would fail
      // too → we stop. The docs already persisted are safe; resuming on the
      // next run is free thanks to the incremental diff by hash.
      errors.push(`Embedding error at ${doc.relativePath}: ${err}`);
      break;
    }

    try {
      ports.persist(doc, embeddings);
      indexed++;
      onProgress?.(doc.chunks.length);
    } catch (err) {
      // Isolated persistence failure (e.g. SQLite constraint): this doc is
      // poisoned, but the following ones have no reason to fail. We skip it
      // and continue — definitely no break, otherwise a single doc freezes
      // the entire catch-up on every startup.
      errors.push(`Persist error at ${doc.relativePath}: ${err}`);
    }
  }

  return { indexed, errors };
}

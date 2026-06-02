/** Un chunk prêt à être embeddé puis persisté. */
export interface PreparedChunk {
  section: string;
  content: string;
  chunkIndex: number;
}

/** Un document prêt : métadonnées + chunks. Le hash sert au diff incrémental. */
export interface PreparedDoc {
  relativePath: string;
  title: string;
  type: string;
  tags: string[];
  hash: string;
  chunks: PreparedChunk[];
}

/** Dépendances injectées — découplent l'orchestration de l'API et de SQLite. */
export interface IndexPorts {
  embed(texts: string[]): Promise<number[][]>;
  persist(doc: PreparedDoc, embeddings: number[][]): void;
}

export interface IndexRunResult {
  indexed: number;
  errors: string[];
}

/**
 * Indexe les docs un par un : embedde les chunks du doc, puis persiste le doc
 * (atomiquement, côté port). Tout doc terminé est sauvé immédiatement.
 */
export async function indexPreparedDocs(
  docs: PreparedDoc[],
  ports: IndexPorts,
  onProgress?: (chunks: number) => void
): Promise<IndexRunResult> {
  let indexed = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    if (doc.chunks.length === 0) continue;

    let embeddings: number[][];
    try {
      embeddings = await ports.embed(doc.chunks.map((c) => c.content));
    } catch (err) {
      // Cas dominant : mur quota (ou réseau). Les docs suivants échoueraient
      // aussi → on s'arrête. Les docs déjà persistés sont saufs ; la reprise
      // au run suivant est gratuite grâce au diff incrémental par hash.
      errors.push(`Embedding error at ${doc.relativePath}: ${err}`);
      break;
    }

    try {
      ports.persist(doc, embeddings);
      indexed++;
      onProgress?.(doc.chunks.length);
    } catch (err) {
      // Échec isolé de persistance (ex. contrainte SQLite) : ce doc est
      // empoisonné, mais les suivants n'ont aucune raison d'échouer. On le
      // saute et on continue — surtout pas de break, sinon un seul doc gèle
      // tout le rattrapage à chaque démarrage.
      errors.push(`Persist error at ${doc.relativePath}: ${err}`);
    }
  }

  return { indexed, errors };
}

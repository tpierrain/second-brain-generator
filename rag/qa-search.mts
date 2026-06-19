// Throwaway QA: semantic search over the scratch golden vault, to prove the synced golden
// files are RAG-indexable + searchable (incl. freshly-created content). Privacy: prints only
// the file path (Notion page UUID — not sensitive) + score + section, never the body/title.
//
// Usage (in-process embedder, no key):
//   VAULT_DIR=/tmp/gss-qa/vault CACHE_DIR=/tmp/gss-qa/.rag-cache EMBEDDING_PROVIDER=in-process \
//     node --import tsx rag/qa-search.mts "your query"

// Use createEmbedder() (NOT the legacy free embedQuery, which is hardcoded to Gemini) —
// this is exactly what the MCP server does (src/index.ts), so it honors EMBEDDING_PROVIDER.
import { createEmbedder } from './src/lib/embedder.js';
import { searchSimilar } from './src/lib/vector-store.js';

const args = process.argv.slice(2);
const limit = args.length > 1 && /^\d+$/.test(args[args.length - 1]) ? Number(args.pop()) : 8;
const query = args.join(' ');
if (!query) {
  console.error('usage: qa-search.mts "<query>" [limit]');
  process.exit(2);
}

const emb = await createEmbedder().embedQuery(query);
const results = searchSimilar(emb, limit) as { path: string; section: string; score: number }[];

if (!results.length) {
  console.log('NO RESULTS');
} else {
  console.log(`top ${results.length} hits for the query:`);
  for (const [i, r] of results.entries()) {
    console.log(`  ${i + 1}. ${r.path}  score=${r.score.toFixed(3)}  [${r.section}]`);
  }
}

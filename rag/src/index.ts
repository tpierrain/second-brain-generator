import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reindex, type IndexResult } from "./lib/index-manager.js";
import { notifyDone, isNotifyWorthy } from "./lib/notify.js";
import { createEmbedder } from "./lib/embedder.js";
import {
  searchSimilar,
  listDocuments,
  getStats,
  currentIndexIdentity,
  currentIndexSchemaVersion,
  INDEX_SCHEMA_VERSION,
} from "./lib/vector-store.js";
import {
  checkIndexFreshness,
  checkSchemaFreshness,
  staleIndexMessage,
  staleSchemaMessage,
} from "./lib/index-freshness.js";
import {
  loadEngineVersion,
  loadManifestEngineVersion,
  formatEngineVersionReport,
} from "./lib/engine-version.js";
import {
  VAULT_DIR,
  SEARCH_DEFAULT_LIMIT,
  MAX_EMBED_REQUESTS_PER_DAY,
  QUERY_RESERVE,
  CACHE_DIR,
} from "./lib/config.js";
import { reindex as reindexFn } from "./lib/index-manager.js";
import { scanVault } from "./lib/document-scanner.js";
import { UsageTracker } from "./lib/usage-tracker.js";
import { ReindexLock } from "./lib/reindex-lock.js";
import { buildStatusReport, incompleteIndexWarning, formatWatcherLiveness } from "./lib/status-report.js";
import { ReindexScheduler } from "./lib/reindex-scheduler.js";
import { startVaultWatcher } from "./lib/vault-watcher.js";
import { FileProgressStorage } from "./lib/reindex-reporter.js";
import { formatLastRunMarkdown } from "./lib/progress-report.js";
import { writeFileSync, appendFileSync } from "fs";
import { spawn } from "child_process";
import { capExceededSearchMessage } from "./lib/search-degradation.js";
import { readFile } from "fs/promises";
import { resolve, relative } from "path";

const server = new McpServer({
  name: "vault-rag",
  // Single source of truth for the Engine version: rag/package.json (the same
  // value surfaced via vault_stats), never a second literal that could drift.
  version: loadEngineVersion().rag,
});

// Real-time liveness of the live-update watcher: refs shared between the watcher
// (which sets them at startup) and `vault_stats` (which reads the scheduler's in-memory state).
let liveScheduler: ReindexScheduler | null = null;
let watcherActive = false;

server.tool(
  "search_vault",
  "Semantic search in the vault. Ask your question in natural language; the engine finds the most relevant passages by meaning similarity.",
  {
    query: z.string().describe("Question in natural language"),
    type: z.string().optional().describe("Filter by note type (e.g. daily, person, topic, decision, meeting, backlog...)"),
    tags: z.string().optional().describe("Filter by tag (partial match)"),
    limit: z.number().optional().describe(`Max number of results (default: ${SEARCH_DEFAULT_LIMIT})`),
  },
  async ({ query, type, tags, limit }) => {
    // Identity guard: if the index was populated by a different embedder than the
    // one configured today, we do NOT return bogus results (vectors of incompatible
    // dimensions). We return the confirm-gate prose, which Claude relays; the
    // re-index only happens after the "yes" (reindex tool).
    const embedder = createEmbedder();
    const verdict = checkIndexFreshness(currentIndexIdentity(), embedder.identity);
    if (!verdict.fresh) {
      return {
        content: [
          { type: "text", text: staleIndexMessage(verdict.stamped, verdict.current) },
        ],
      };
    }
    // Same gate, second reason: the index format moved (schema version bump).
    // The embedder is unchanged, so this routes to its own reindex offer.
    if (!checkSchemaFreshness(currentIndexSchemaVersion(), INDEX_SCHEMA_VERSION)) {
      return { content: [{ type: "text", text: staleSchemaMessage() }] };
    }

    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedder.embedQuery(query);
    } catch (err) {
      const degraded = capExceededSearchMessage(err);
      if (degraded) {
        return { content: [{ type: "text", text: degraded }] };
      }
      throw err;
    }
    const results = searchSimilar(queryEmbedding, limit ?? SEARCH_DEFAULT_LIMIT, type, tags);

    if (results.length === 0) {
      return { content: [{ type: "text", text: "No results found in the vault." }] };
    }

    const text = results
      .map(
        (r, i) =>
          `### ${i + 1}. ${r.title} — ${r.section}\n` +
          `**Path:** \`vault/${r.path}\` | **Type:** ${r.type} | **Score:** ${r.score.toFixed(3)}\n\n` +
          `${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`
      )
      .join("\n\n---\n\n");

    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_document",
  "Reads the full content of a vault document by its relative path.",
  {
    path: z.string().describe("Path relative to vault/ (e.g. people/jane-doe.md)"),
  },
  async ({ path: docPath }) => {
    try {
      const fullPath = resolve(VAULT_DIR, docPath);
      if (!fullPath.startsWith(VAULT_DIR)) {
        return { content: [{ type: "text", text: "Error: path outside the vault." }], isError: true };
      }
      const content = await readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: `File not found: vault/${docPath}` }], isError: true };
    }
  }
);

server.tool(
  "list_documents",
  "Lists all indexed vault documents, with their type and last-updated date.",
  {
    type: z.string().optional().describe("Filter by document type"),
    tags: z.string().optional().describe("Filter by tag (partial match)"),
  },
  async ({ type, tags }) => {
    const docs = listDocuments(type, tags);
    if (docs.length === 0) {
      return { content: [{ type: "text", text: "No indexed documents." }] };
    }

    const grouped = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = grouped.get(doc.type) ?? [];
      list.push(doc);
      grouped.set(doc.type, list);
    }

    let text = `**${docs.length} indexed documents**\n\n`;
    for (const [docType, typeDocs] of grouped) {
      text += `## ${docType} (${typeDocs.length})\n`;
      for (const d of typeDocs) {
        text += `- \`vault/${d.path}\` — ${d.title}\n`;
      }
      text += "\n";
    }
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "reindex",
  "Rebuilds the vault index. Incremental by default (only re-indexes modified files). Use force=true to rebuild everything.",
  {
    force: z.boolean().optional().describe("Force a full re-index (default: false)"),
  },
  async ({ force }) => {
    const result = await reindexFn(force ?? false);
    const lines = [
      `**Indexing complete**`,
      `- Files scanned: ${result.scanned}`,
      `- Indexed: ${result.indexed}`,
      `- Unchanged (skipped): ${result.skipped}`,
      `- Removed from index: ${result.removed}`,
    ];
    if (result.errors.length > 0) {
      lines.push(`- Errors: ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  - ${err}`);
      }
    }
    notifyIfIndexed(result);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "vault_stats",
  "Shows index statistics: number of documents, chunks, and breakdown by type.",
  {},
  async () => {
    const stats = getStats();
    const scanned = await scanVault();
    const usage = new UsageTracker({
      maxPerDay: MAX_EMBED_REQUESTS_PER_DAY,
      reserveForPriority: QUERY_RESERVE,
    });
    const lock = new ReindexLock();
    const progress = new FileProgressStorage().load();

    const status = buildStatusReport({
      docCount: stats.docCount,
      scannedCount: scanned.length,
      quotaUsed: usage.usedToday(),
      quotaMax: MAX_EMBED_REQUESTS_PER_DAY,
      reserve: QUERY_RESERVE,
      lock: lock.activeHolder(),
      // The quota is specific to Gemini only: we pass the active embedder's
      // identity (createEmbedder is memoized) so we don't display a bogus Gemini
      // quota in local mode (in-process / OpenAI-compatible endpoint).
      providerId: createEmbedder().identity.providerId,
      progress,
      now: new Date().toISOString(),
    });

    const watcherLine = formatWatcherLiveness({
      active: watcherActive,
      state: liveScheduler?.state() ?? null,
    });

    const engineReport = formatEngineVersionReport(
      loadManifestEngineVersion(),
      loadEngineVersion(),
      {
        stamped: currentIndexSchemaVersion(),
        running: INDEX_SCHEMA_VERSION,
      }
    );

    const typeLines = stats.types.map((t) => `  - ${t.type}: ${t.n}`).join("\n");
    const text =
      `**RAG status**\n${status}\n${watcherLine}\n\n` +
      `${engineReport}\n\n` +
      `**Vault index**\n` +
      `- Documents: ${stats.docCount}\n` +
      `- Chunks: ${stats.chunkCount}\n` +
      `- By type:\n${typeLines}`;
    return { content: [{ type: "text", text }] };
  }
);

/**
 * Writes a readable `rag/.cache/last-run.md` (formatted summary of the last run),
 * from the state persisted by the reporter. Best-effort: a write error must never
 * bring down the indexing run.
 */
function writeLastRunMarkdown(): void {
  try {
    const progress = new FileProgressStorage().load();
    if (!progress) return;
    const md = formatLastRunMarkdown(progress, new Date().toISOString());
    writeFileSync(resolve(CACHE_DIR, "last-run.md"), md, "utf-8");
  } catch (err) {
    console.error("[vault-rag] Failed to write last-run.md (non-blocking):", err);
  }
}

// The LIVE watcher fires a catch-up reindex on EVERY vault write — including the
// single note Claude just saved. We only want a toast for a BULK pickup (an
// import of hundreds of notes, a sources sync), never for routine edits, so the
// watcher passes this higher threshold to notifyIfIndexed.
const LIVE_WATCHER_NOTIFY_MIN = 5;

// Pops an OS notification when a reindex picked up at least `min` notes — never
// on an all-unchanged pass, so a plain MCP server start (everything cached) stays
// silent. `min` defaults to 1 (explicit/startup paths: any new note matters); the
// live watcher passes a higher value. Best-effort, never throws; the
// SBG_NO_NOTIFY / CI / headless guards live in the notify seam.
function notifyIfIndexed(result: IndexResult, min = 1): void {
  if (!isNotifyWorthy(result.indexed, min)) return;
  notifyDone({
    platform: process.platform,
    env: process.env,
    title: "Second brain",
    body: `Indexing done — ${result.indexed} note${result.indexed > 1 ? "s" : ""} ready to search.`,
    spawn,
  });
}

async function main() {
  const argv = process.argv;
  // --force (or --reindex, kept as an alias): full rebuild, ignores the cache.
  const force = argv.includes("--force") || argv.includes("--reindex");
  // CLI mode: we (re)index then EXIT, without starting the MCP server.
  const cliMode =
    argv.includes("--once") || argv.includes("--force") || argv.includes("--reindex");

  if (cliMode) {
    console.error(
      `[vault-rag] CLI indexing (${force ? "full force" : "incremental"})...`
    );
    const result = await reindex(force);
    writeLastRunMarkdown();
    console.error(
      `[vault-rag] Index: ${result.indexed} indexed, ${result.skipped} unchanged, ${result.removed} removed` +
        (result.errors.length > 0 ? `, ${result.errors.length} errors` : "")
    );
    notifyIfIndexed(result);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // MCP server mode: we open the transport FIRST (instant handshake, no more
  // "failed" timeout), then we kick off the incremental auto-reindex in the
  // background — non-blocking, and an embedding error no longer kills the server.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vault-rag] MCP server running on stdio");

  reindex(false)
    .then((result) => {
      writeLastRunMarkdown();
      console.error(
        `[vault-rag] Auto-reindex done: ${result.indexed} indexed, ${result.skipped} unchanged` +
          (result.errors.length > 0 ? `, ${result.errors.length} errors` : "")
      );
      // Surface incompleteness: if the index is not complete after the run
      // (quota wall, errors), say so explicitly — auto-resumes on the next
      // session, nothing to do by hand.
      const warning = incompleteIndexWarning({
        docCount: getStats().docCount,
        scannedCount: result.scanned,
      });
      if (warning) console.error(`[vault-rag] ${warning}`);

      // The background path that fires after an import: tell the user the new
      // notes are searchable (only when something was actually indexed).
      notifyIfIndexed(result);

      // "Live" freshness: once the startup reindex is done (avoiding any same-pid
      // overlap with it), we watch the vault. The scheduler debounces bursts and
      // serializes in-process runs; each run rewrites last-run.md → observable like
      // the others (F.5).
      startFileWatcher();
    })
    .catch((err) =>
      console.error("[vault-rag] Auto-reindex failed (non-blocking):", err)
    );
}

/**
 * Starts the live-update watcher: every write to the vault schedules a debounced
 * incremental reindex (grouping bursts + coalescing writes that occur during a
 * run, cf. ReindexScheduler).
 */
/**
 * Readable live-update trace: one timestamped line per event, both on the MCP
 * console (→ `mcp-logs-vault-rag` logs) AND appended to `rag/.cache/watcher.log`
 * (stable name, `tail -f`-able to watch the cycle live: write detected →
 * catch-up triggered → done). Best-effort. `.cache` is outside the watched vault
 * → no loop.
 */
function traceWatcher(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}`;
  console.error(`[vault-rag] ${line}`);
  try {
    appendFileSync(resolve(CACHE_DIR, "watcher.log"), line + "\n", "utf-8");
  } catch {
    /* best-effort: never bring down the run over a log line */
  }
}

function startFileWatcher(): void {
  try {
    const scheduler = new ReindexScheduler({
      run: async () => {
        traceWatcher("⚙️  catch-up triggered (debounce elapsed) — indexing in progress…");
        const result = await reindex(false);
        writeLastRunMarkdown();
        traceWatcher(
          `✅ catch-up done: ${result.indexed} indexed, ${result.skipped} unchanged` +
            (result.skippedLocked ? " (skipped: reindex already in progress)" : "") +
            (result.errors.length > 0 ? `, ${result.errors.length} errors` : "")
        );
        // The live path that completes an import done WHILE the server runs: the
        // CLI reindex is locked out by this watcher, so THIS is where a bulk
        // pickup finishes → notify (bulk threshold; single edits stay silent).
        notifyIfIndexed(result, LIVE_WATCHER_NOTIFY_MIN);
      },
    });
    startVaultWatcher({
      onChange: (path) => {
        traceWatcher(`📝 write detected: ${relative(VAULT_DIR, path)}`);
        scheduler.notify();
      },
    });
    // Liveness: the watcher is in place → we publish its refs for vault_stats.
    liveScheduler = scheduler;
    watcherActive = true;
    console.error("[vault-rag] Live-update watcher active on the vault");
  } catch (err) {
    console.error("[vault-rag] Live-update watcher not started (non-blocking):", err);
  }
}

main().catch((err) => {
  console.error("[vault-rag] Fatal:", err);
  process.exit(1);
});

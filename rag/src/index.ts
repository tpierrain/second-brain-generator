import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reindex } from "./lib/index-manager.js";
import { createEmbedder } from "./lib/embedder.js";
import {
  searchSimilar,
  listDocuments,
  getStats,
  currentIndexIdentity,
} from "./lib/vector-store.js";
import { checkIndexFreshness, staleIndexMessage } from "./lib/index-freshness.js";
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
import { capExceededSearchMessage } from "./lib/search-degradation.js";
import { readFile } from "fs/promises";
import { resolve, relative } from "path";

const server = new McpServer({
  name: "vault-rag",
  version: "1.0.0",
});

// Liveness temps réel du fil-de-l'eau : refs partagées entre le watcher (qui les
// renseigne au démarrage) et `vault_stats` (qui lit l'état mémoire du scheduler).
let liveScheduler: ReindexScheduler | null = null;
let watcherActive = false;

server.tool(
  "search_vault",
  "Recherche sémantique dans le vault. Pose ta question en langage naturel, le moteur trouve les passages les plus pertinents par similarité de sens.",
  {
    query: z.string().describe("Question en langage naturel"),
    type: z.string().optional().describe("Filtrer par type de note (ex: daily, person, topic, decision, meeting, backlog...)"),
    tags: z.string().optional().describe("Filtrer par tag (match partiel)"),
    limit: z.number().optional().describe(`Nombre max de résultats (défaut : ${SEARCH_DEFAULT_LIMIT})`),
  },
  async ({ query, type, tags, limit }) => {
    // Garde d'identité : si l'index a été rempli par un autre embedder que celui
    // configuré aujourd'hui, on NE renvoie PAS de résultats faux (vecteurs de
    // dimensions incompatibles). On retourne la prose du confirm-gate, que Claude
    // relaie ; le ré-index n'a lieu qu'après le « oui » (outil reindex).
    const embedder = createEmbedder();
    const verdict = checkIndexFreshness(currentIndexIdentity(), embedder.identity);
    if (!verdict.fresh) {
      return {
        content: [
          { type: "text", text: staleIndexMessage(verdict.stamped, verdict.current) },
        ],
      };
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
      return { content: [{ type: "text", text: "Aucun résultat trouvé dans le vault." }] };
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
  "Lit le contenu complet d'un document du vault par son chemin relatif.",
  {
    path: z.string().describe("Chemin relatif depuis vault/ (ex: people/jane-doe.md)"),
  },
  async ({ path: docPath }) => {
    try {
      const fullPath = resolve(VAULT_DIR, docPath);
      if (!fullPath.startsWith(VAULT_DIR)) {
        return { content: [{ type: "text", text: "Erreur : chemin en dehors du vault." }], isError: true };
      }
      const content = await readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: `Fichier introuvable : vault/${docPath}` }], isError: true };
    }
  }
);

server.tool(
  "list_documents",
  "Liste tous les documents indexés du vault, avec leur type et date de mise à jour.",
  {
    type: z.string().optional().describe("Filtrer par type de document"),
    tags: z.string().optional().describe("Filtrer par tag (match partiel)"),
  },
  async ({ type, tags }) => {
    const docs = listDocuments(type, tags);
    if (docs.length === 0) {
      return { content: [{ type: "text", text: "Aucun document indexé." }] };
    }

    const grouped = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = grouped.get(doc.type) ?? [];
      list.push(doc);
      grouped.set(doc.type, list);
    }

    let text = `**${docs.length} documents indexés**\n\n`;
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
  "Reconstruit l'index du vault. Incrémental par défaut (ne ré-indexe que les fichiers modifiés). Utiliser force=true pour tout reconstruire.",
  {
    force: z.boolean().optional().describe("Forcer la ré-indexation complète (défaut : false)"),
  },
  async ({ force }) => {
    const result = await reindexFn(force ?? false);
    const lines = [
      `**Indexation terminée**`,
      `- Fichiers scannés : ${result.scanned}`,
      `- Indexés : ${result.indexed}`,
      `- Inchangés (skip) : ${result.skipped}`,
      `- Supprimés de l'index : ${result.removed}`,
    ];
    if (result.errors.length > 0) {
      lines.push(`- Erreurs : ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  - ${err}`);
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "vault_stats",
  "Affiche les statistiques de l'index : nombre de documents, chunks, répartition par type.",
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
      // Le quota n'est propre qu'à Gemini : on passe l'identité de l'embedder
      // actif (createEmbedder est mémoïsé) pour ne pas afficher un faux quota
      // Gemini en mode local (in-process / endpoint compatible-OpenAI).
      providerId: createEmbedder().identity.providerId,
      progress,
      now: new Date().toISOString(),
    });

    const watcherLine = formatWatcherLiveness({
      active: watcherActive,
      state: liveScheduler?.state() ?? null,
    });

    const typeLines = stats.types.map((t) => `  - ${t.type}: ${t.n}`).join("\n");
    const text =
      `**État du RAG**\n${status}\n${watcherLine}\n\n` +
      `**Index vault**\n` +
      `- Documents : ${stats.docCount}\n` +
      `- Chunks : ${stats.chunkCount}\n` +
      `- Par type :\n${typeLines}`;
    return { content: [{ type: "text", text }] };
  }
);

/**
 * Écrit `rag/.cache/last-run.md` lisible (résumé formaté du dernier run), à partir
 * de l'état persisté par le reporter. Best-effort : une erreur d'écriture ne doit
 * jamais faire tomber le run d'indexation.
 */
function writeLastRunMarkdown(): void {
  try {
    const progress = new FileProgressStorage().load();
    if (!progress) return;
    const md = formatLastRunMarkdown(progress, new Date().toISOString());
    writeFileSync(resolve(CACHE_DIR, "last-run.md"), md, "utf-8");
  } catch (err) {
    console.error("[vault-rag] Écriture last-run.md échouée (non bloquant) :", err);
  }
}

async function main() {
  const argv = process.argv;
  // --force (ou --reindex, conservé en alias) : rebuild complet, ignore le cache.
  const force = argv.includes("--force") || argv.includes("--reindex");
  // Mode CLI : on (ré)indexe puis on SORT, sans démarrer le serveur MCP.
  const cliMode =
    argv.includes("--once") || argv.includes("--force") || argv.includes("--reindex");

  if (cliMode) {
    console.error(
      `[vault-rag] Indexation CLI (${force ? "force complète" : "incrémentale"})...`
    );
    const result = await reindex(force);
    writeLastRunMarkdown();
    console.error(
      `[vault-rag] Index : ${result.indexed} indexés, ${result.skipped} inchangés, ${result.removed} supprimés` +
        (result.errors.length > 0 ? `, ${result.errors.length} erreurs` : "")
    );
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // Mode serveur MCP : on ouvre le transport D'ABORD (handshake instantané, plus de
  // timeout "failed"), puis on lance l'auto-reindex incrémental en tâche de fond —
  // non bloquant, et une erreur d'embedding ne tue plus le serveur.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vault-rag] MCP server running on stdio");

  reindex(false)
    .then((result) => {
      writeLastRunMarkdown();
      console.error(
        `[vault-rag] Auto-reindex terminé : ${result.indexed} indexés, ${result.skipped} inchangés` +
          (result.errors.length > 0 ? `, ${result.errors.length} erreurs` : "")
      );
      // Surfaçage de l'incomplétude : si l'index n'est pas complet après le run
      // (mur quota, erreurs), le dire explicitement — reprise auto à la prochaine
      // session, rien à faire à la main.
      const warning = incompleteIndexWarning({
        docCount: getStats().docCount,
        scannedCount: result.scanned,
      });
      if (warning) console.error(`[vault-rag] ${warning}`);

      // Fraîcheur « au fil de l'eau » : une fois le reindex de démarrage terminé
      // (évite tout chevauchement same-pid avec lui), on surveille le vault. Le
      // scheduler debounce les rafales et sérialise les runs in-process ; chaque
      // run réécrit last-run.md → observable comme les autres (F.5).
      startFileWatcher();
    })
    .catch((err) =>
      console.error("[vault-rag] Auto-reindex échoué (non bloquant) :", err)
    );
}

/**
 * Démarre le watcher fil-de-l'eau : chaque écriture dans le vault programme un
 * reindex incrémental débouncé (regroupement des rafales + coalescing des
 * écritures survenant pendant un run, cf. ReindexScheduler).
 */
/**
 * Trace lisible du fil-de-l'eau : une ligne horodatée par évènement, à la fois
 * sur la console MCP (→ logs `mcp-logs-vault-rag`) ET en append dans
 * `rag/.cache/watcher.log` (nom stable, `tail -f`-able pour voir le cycle en
 * direct : écriture détectée → rattrapage déclenché → terminé). Best-effort.
 * `.cache` est hors du vault surveillé → pas de boucle.
 */
function traceWatcher(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}`;
  console.error(`[vault-rag] ${line}`);
  try {
    appendFileSync(resolve(CACHE_DIR, "watcher.log"), line + "\n", "utf-8");
  } catch {
    /* best-effort : ne jamais faire tomber le run pour une ligne de log */
  }
}

function startFileWatcher(): void {
  try {
    const scheduler = new ReindexScheduler({
      run: async () => {
        traceWatcher("⚙️  rattrapage déclenché (debounce écoulé) — indexation en cours…");
        const result = await reindex(false);
        writeLastRunMarkdown();
        traceWatcher(
          `✅ rattrapage terminé : ${result.indexed} indexés, ${result.skipped} inchangés` +
            (result.skippedLocked ? " (sauté : reindex déjà en cours)" : "") +
            (result.errors.length > 0 ? `, ${result.errors.length} erreurs` : "")
        );
      },
    });
    startVaultWatcher({
      onChange: (path) => {
        traceWatcher(`📝 écriture détectée : ${relative(VAULT_DIR, path)}`);
        scheduler.notify();
      },
    });
    // Liveness : le watcher est en place → on publie ses refs pour vault_stats.
    liveScheduler = scheduler;
    watcherActive = true;
    console.error("[vault-rag] Watcher fil-de-l'eau actif sur le vault");
  } catch (err) {
    console.error("[vault-rag] Watcher fil-de-l'eau non démarré (non bloquant) :", err);
  }
}

main().catch((err) => {
  console.error("[vault-rag] Fatal:", err);
  process.exit(1);
});

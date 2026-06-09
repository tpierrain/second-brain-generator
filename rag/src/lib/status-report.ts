import type { LockState } from "./reindex-lock.js";
import { formatProgressReport, RESUME_HINT, type RunProgress } from "./progress-report.js";
import type { SchedulerState } from "./reindex-scheduler.js";

/**
 * Ligne de liveness du watcher fil-de-l'eau (état mémoire temps réel du serveur
 * MCP) : actif ou non, et ce qu'il fait à l'instant. Fonction pure.
 */
export function formatWatcherLiveness(input: {
  active: boolean;
  state?: SchedulerState | null;
}): string {
  if (!input.active) return "Watcher fil-de-l'eau : inactif.";
  const state = input.state;
  if (state?.running) {
    const suffix = state.pending ? " (rafale en attente)" : "";
    return `Watcher fil-de-l'eau : actif — reindex en cours${suffix}.`;
  }
  if (state?.scheduled) {
    return "Watcher fil-de-l'eau : actif — écriture détectée, reindex programmé (debounce).";
  }
  return "Watcher fil-de-l'eau : actif (au repos).";
}

export interface StatusReportInput {
  docCount: number;
  scannedCount: number;
  quotaUsed: number;
  quotaMax: number;
  reserve: number;
  lock: LockState | null;
  /**
   * Identité du provider d'embedding actif (`embedder.identity.providerId`).
   * Le quota journalier n'est propre qu'à Gemini : pour tout autre embedder
   * (in-process, endpoint compatible-OpenAI…) on n'affiche pas de quota Gemini.
   * Absent → traité comme Gemini (rétro-compat).
   */
  providerId?: string;
  /** État du dernier run de rattrapage (ou en cours), s'il existe. */
  progress?: RunProgress | null;
  /** Instant courant ISO (requis pour l'ETA d'un run `running`). */
  now?: string;
}

/** Construit un rapport d'état du RAG en langage naturel (fonction pure, sans I/O). */
export function buildStatusReport(input: StatusReportInput): string {
  const lines = [indexLine(input), embeddingLine(input)];
  const lock = lockLine(input);
  if (lock) lines.push(lock);
  const progress = progressLine(input);
  if (progress) lines.push(progress);
  return lines.join("\n");
}

function progressLine(input: StatusReportInput): string | null {
  if (!input.progress) return null;
  return formatProgressReport(input.progress, input.now ?? input.progress.startedAt);
}

/**
 * Avertissement d'incomplétude réutilisable (démarrage, dégradation) : message
 * de reprise si des docs restent à indexer, `null` si l'index est complet (rien
 * à surfacer). Source unique de la formulation « index incomplet ».
 */
export function incompleteIndexWarning(input: {
  docCount: number;
  scannedCount: number;
}): string | null {
  const remaining = input.scannedCount - input.docCount;
  if (remaining <= 0) return null;
  return `Index incomplet : ${input.docCount}/${input.scannedCount} fichiers indexés, ${remaining} en attente — ${RESUME_HINT}.`;
}

function indexLine(input: StatusReportInput): string {
  return (
    incompleteIndexWarning(input) ??
    `Index à jour : ${input.docCount}/${input.scannedCount} fichiers indexés.`
  );
}

/**
 * Ligne d'embedding : le quota journalier n'est propre qu'à Gemini (plafond free
 * tier). Pour un embedder local/alternatif, afficher ce quota mentirait — on émet
 * une ligne honnête à la place. Provider absent → Gemini (rétro-compat).
 */
function embeddingLine(input: StatusReportInput): string {
  const providerId = input.providerId;
  // Provider absent → Gemini (rétro-compat). Seul Gemini a le quota journalier.
  if (providerId === undefined || providerId === "gemini") return quotaLine(input);
  return localEmbeddingLine(providerId);
}

function localEmbeddingLine(providerId: string): string {
  // In-process « Gemma inside » : vraiment local → on peut promettre hors-ligne.
  if (providerId === "transformers-js") {
    return "Embeddings locaux (in-process) : illimité, hors-ligne — pas de quota d'API.";
  }
  // Endpoint compatible-OpenAI (Ollama local OU service distant) : pas de quota
  // Gemini, mais on ne promet pas l'hors-ligne (peut être un endpoint réseau).
  if (providerId === "openai-compatible") {
    return "Embeddings via endpoint compatible-OpenAI : pas de quota Gemini suivi.";
  }
  return `Embeddings via ${providerId} : pas de quota Gemini suivi.`;
}

function quotaLine(input: StatusReportInput): string {
  const remaining = input.quotaMax - input.quotaUsed;
  return `Quota : ${input.quotaUsed}/${input.quotaMax} utilisés aujourd'hui, ${remaining} restants (réserve ${input.reserve} pour la recherche).`;
}

function lockLine(input: StatusReportInput): string | null {
  if (!input.lock) return null;
  return `Reindex en cours (PID ${input.lock.pid}).`;
}

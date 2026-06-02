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
  /** État du dernier run de rattrapage (ou en cours), s'il existe. */
  progress?: RunProgress | null;
  /** Instant courant ISO (requis pour l'ETA d'un run `running`). */
  now?: string;
}

/** Construit un rapport d'état du RAG en langage naturel (fonction pure, sans I/O). */
export function buildStatusReport(input: StatusReportInput): string {
  const lines = [indexLine(input), quotaLine(input)];
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

function quotaLine(input: StatusReportInput): string {
  const remaining = input.quotaMax - input.quotaUsed;
  return `Quota : ${input.quotaUsed}/${input.quotaMax} utilisés aujourd'hui, ${remaining} restants (réserve ${input.reserve} pour la recherche).`;
}

function lockLine(input: StatusReportInput): string | null {
  if (!input.lock) return null;
  return `Reindex en cours (PID ${input.lock.pid}).`;
}

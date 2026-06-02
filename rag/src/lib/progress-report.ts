export type RunStatus = "running" | "done" | "incomplete" | "error";

/**
 * Quel mur a interrompu l'indexation (null = aucun) :
 * - "local-cap"         : notre garde-fou MAX_EMBED_REQUESTS_PER_DAY (DailyCapExceededError).
 * - "google-rate-limit" : le mur distant Gemini (429 RESOURCE_EXHAUSTED).
 * Distinguer les deux permet de surfacer la vraie cause, quel que soit le plus bas.
 */
export type WallReason = "local-cap" | "google-rate-limit" | null;

/** Formule de reprise partagée (statut incomplet) — source unique, réutilisée par status-report. */
export const RESUME_HINT = "reprise auto à la prochaine session";

export interface RunProgress {
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  totalChunks: number;
  doneChunks: number;
  scanned: number;
  indexed: number;
  skipped: number;
  removed: number;
  errors: string[];
  hitCap: boolean;
  wallReason?: WallReason;
}

/** Document markdown lisible (ouvrable/tail) résumant le dernier run de rattrapage. */
export function formatLastRunMarkdown(state: RunProgress, now: string): string {
  return `# Dernier run de rattrapage RAG\n\n_Généré le ${now}_\n\n${formatProgressReport(state, now)}\n`;
}

/** Rapport lisible d'un run de rattrapage (fonction pure). */
export function formatProgressReport(state: RunProgress, now: string): string {
  if (state.status === "done") return formatDone(state);
  if (state.status === "incomplete") return formatIncomplete(state);
  return formatRunning(state, now);
}

function formatIncomplete(state: RunProgress): string {
  const remaining = state.totalChunks - state.doneChunks;
  const cause = state.hitCap ? " (mur quota)" : "";
  return (
    `Dernier rattrapage : incomplet${cause}, ${remaining} chunks restants, ${RESUME_HINT}.` +
    formatErrors(state.errors)
  );
}

/** Liste tronquée des erreurs (3 max + compte du reste), vide si aucune. */
function formatErrors(errors: string[], max = 3): string {
  if (errors.length === 0) return "";
  const shown = errors.slice(0, max).join(", ");
  const rest = errors.length - max;
  const more = rest > 0 ? ` (+${rest} autre(s))` : "";
  return ` Erreurs : ${shown}${more}.`;
}

function formatDone(state: RunProgress): string {
  const durationMin = state.finishedAt
    ? Math.round(minutesBetween(state.startedAt, state.finishedAt))
    : 0;
  return `Dernier rattrapage : terminé en ${durationMin} min, ${state.indexed} docs indexés, ${state.errors.length} erreur(s).`;
}

/** Minutes écoulées entre deux instants ISO (peut être fractionnaire). */
function minutesBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 60_000;
}

function formatRunning(state: RunProgress, now: string): string {
  const pct = Math.round((state.doneChunks / state.totalChunks) * 100);
  const rate = Math.round(
    chunksPerMinute({ doneChunks: state.doneChunks, startedAt: state.startedAt, now }),
  );
  const eta = etaMinutes({
    totalChunks: state.totalChunks,
    doneChunks: state.doneChunks,
    ratePerMin: rate,
  });
  const etaPart = eta === null ? "ETA inconnue" : `ETA ~${Math.round(eta)} min`;
  return `Rattrapage en cours : ${state.doneChunks}/${state.totalChunks} chunks (${pct} %), ~${rate}/min, ${etaPart}, ${state.errors.length} erreur(s).`;
}

export interface RateInput {
  doneChunks: number;
  startedAt: string;
  now: string;
}

/** Débit en chunks/minute (fonction pure). */
export function chunksPerMinute(input: RateInput): number {
  const elapsedMin = minutesBetween(input.startedAt, input.now);
  if (elapsedMin <= 0) return 0;
  return input.doneChunks / elapsedMin;
}

export interface EtaInput {
  totalChunks: number;
  doneChunks: number;
  ratePerMin: number;
}

/** Minutes restantes estimées, ou `null` si le débit est nul (fonction pure). */
export function etaMinutes(input: EtaInput): number | null {
  if (input.ratePerMin <= 0) return null;
  const remaining = input.totalChunks - input.doneChunks;
  return remaining / input.ratePerMin;
}

/** The default auto-refresh cadence: 5 minutes (auto-refresh study, Q2). */
const DEFAULT_INTERVAL_SECONDS = 300;

/**
 * Resolve the `LOCAL_MIRROR_SYNC_INTERVAL` env value (seconds) into a validated cadence: a
 * non-negative integer number of seconds. `0` disables the scheduler (escape hatch); anything
 * unset or malformed (non-numeric, negative, fractional) falls back to the 5-minute default so a
 * bad value never crashes the boot.
 */
export function resolveSyncIntervalSeconds(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_INTERVAL_SECONDS;
  if (!/^\d+$/.test(trimmed)) return DEFAULT_INTERVAL_SECONDS; // non-negative integer only
  return Number(trimmed);
}

import { AutoSyncScheduler, type AutoSyncApi, type AutoSyncSchedulerOptions } from './auto-sync-scheduler.js';

export interface AutoSyncBootDeps {
  api: AutoSyncApi;
  /** Resolved cadence in seconds (0 = disabled) — see resolveSyncIntervalSeconds. */
  intervalSeconds: number;
  /** Where the boot decision is announced (stderr in production). */
  log: (message: string) => void;
  /** Scheduler factory — a test seam; defaults to the real AutoSyncScheduler. */
  createScheduler?: (opts: AutoSyncSchedulerOptions) => AutoSyncScheduler;
}

/**
 * Start the background auto-refresh at server boot — but only when it makes sense: the interval is
 * enabled (> 0) AND at least one mirror is declared (auto-refresh study: "no mirror → nothing
 * runs"). Announces its decision on stderr and is fully fail-soft: a config read failure is logged,
 * never thrown, so a boot hiccup can't take the MCP server down. Returns the running scheduler so
 * the caller can stop it on shutdown, or null when nothing was started.
 */
export async function startAutoSync(deps: AutoSyncBootDeps): Promise<AutoSyncScheduler | null> {
  if (deps.intervalSeconds <= 0) {
    deps.log('[local-mirror] auto-sync disabled (LOCAL_MIRROR_SYNC_INTERVAL=0)');
    return null;
  }

  let sources;
  try {
    sources = await deps.api.listSources();
  } catch (error) {
    deps.log(`[local-mirror] auto-sync off: could not read declared mirrors: ${errorMessage(error)}`);
    return null;
  }

  if (sources.length === 0) {
    deps.log('[local-mirror] auto-sync idle: no mirror declared yet');
    return null;
  }

  const create = deps.createScheduler ?? ((opts) => new AutoSyncScheduler(opts));
  const scheduler = create({ api: deps.api, intervalMs: deps.intervalSeconds * 1000, log: deps.log });
  scheduler.start();
  deps.log(`[local-mirror] auto-sync every ${deps.intervalSeconds}s (sources: ${sources.map((s) => s.name).join(', ')})`);
  return scheduler;
}

/** A readable message from a thrown value, never leaking a token. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

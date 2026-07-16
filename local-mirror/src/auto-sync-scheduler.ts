import type { ILocalMirror } from './domain/local-mirror.js';

/** The slice of the domain API the scheduler orchestrates — nothing more (no new Notion logic). */
export type AutoSyncApi = Pick<ILocalMirror, 'listSources' | 'checkFreshness' | 'sync'>;

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface AutoSyncSchedulerOptions {
  api: AutoSyncApi;
  /** Poll cadence in milliseconds (default 300 000 = 5 min, configured at the server boundary). */
  intervalMs: number;
  /** Where a fail-soft tick reports a source error (default: stderr). */
  log?: (message: string) => void;
  /** Scheduling a timer (default: global setTimeout) — the injectable clock for deterministic tests. */
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Cancelling a timer (default: global clearTimeout). */
  clearTimer?: (handle: TimerHandle) => void;
}

/**
 * Background auto-refresh: on each tick, run a CHEAP check_freshness for every declared source and
 * trigger a sync ONLY for the ones reported `behind` (auto-refresh study, S6). The scheduler is a
 * thin orchestrator over the existing domain engine — it adds no Notion logic and reuses every
 * robustness guarantee of sync() (partial-on-failure, watermark freeze, single-flight lock).
 */
export class AutoSyncScheduler {
  private readonly api: AutoSyncApi;
  private readonly intervalMs: number;
  private readonly log: (message: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private timerHandle: TimerHandle | null = null;
  private stopped = false;
  private running: Promise<void> | null = null;

  constructor(opts: AutoSyncSchedulerOptions) {
    this.api = opts.api;
    this.intervalMs = opts.intervalMs;
    this.log = opts.log ?? ((message) => console.error(message));
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /** Arm the first tick; each tick re-arms the next while the server stays up. */
  start(): void {
    this.stopped = false;
    this.schedule();
  }

  /** Halt the loop: cancel any pending tick so no orphan timer outlives the session. */
  stop(): void {
    this.stopped = true;
    if (this.timerHandle !== null) {
      this.clearTimer(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /** Test seam: await the in-flight tick (and the reschedule it triggers on completion). */
  async whenSettled(): Promise<void> {
    await this.running;
  }

  private schedule(): void {
    this.timerHandle = this.setTimer(() => {
      this.timerHandle = null;
      // A tick never rejects (fully fail-soft below), but guard the reschedule in `finally` so a
      // single bad tick can never break the loop — it always re-arms unless we were stopped.
      this.running = this.tick().finally(() => {
        if (!this.stopped) this.schedule();
      });
    }, this.intervalMs);
  }

  /**
   * One poll: check every source's freshness, sync the ones that are behind. Fully fail-soft — a
   * source that throws (401/429/network) is logged and skipped, and even a failure to LIST the
   * sources is logged, never thrown. One bad source, and one bad tick, must not kill the loop.
   */
  async tick(): Promise<void> {
    let sources;
    try {
      sources = await this.api.listSources();
    } catch (error) {
      this.log(`[local-mirror] auto-sync: could not list sources this tick: ${errorMessage(error)}`);
      return;
    }
    for (const source of sources) {
      try {
        const freshness = await this.api.checkFreshness(source.name);
        if (freshness.behind) await this.api.sync(source.name);
      } catch (error) {
        this.log(`[local-mirror] auto-sync: source "${source.name}" failed this tick: ${errorMessage(error)}`);
      }
    }
  }
}

/** A readable message from a thrown value, never leaking a token. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

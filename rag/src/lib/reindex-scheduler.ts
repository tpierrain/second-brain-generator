export type TimerHandle = ReturnType<typeof setTimeout>;

export interface ReindexSchedulerOptions {
  /** Le reindex effectif à déclencher (injecté). */
  run: () => Promise<unknown>;
  /** Fenêtre de regroupement d'une rafale d'écritures (défaut : 5 s). */
  debounceMs?: number;
  /** Programmation d'un timer (défaut : setTimeout global). */
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Annulation d'un timer (défaut : clearTimeout global). */
  clearTimer?: (handle: TimerHandle) => void;
}

const DEFAULT_DEBOUNCE_MS = 5000;

/** Instantané de l'état mémoire du scheduler (liveness temps réel). */
export interface SchedulerState {
  /** Un reindex est programmé (debounce armé), pas encore parti. */
  scheduled: boolean;
  /** Un reindex est en cours d'exécution. */
  running: boolean;
  /** Une écriture est survenue pendant le run → un rerun est en attente. */
  pending: boolean;
}

/**
 * Ordonnanceur de reindex « au fil de l'eau » : regroupe une rafale d'écritures
 * (debounce) en un seul reindex. Logique pure/injectable — le watcher filesystem
 * (chokidar) reste une fine couche d'I/O par-dessus.
 */
export class ReindexScheduler {
  private readonly run: () => Promise<unknown>;
  private readonly debounceMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private timer: TimerHandle | null = null;
  private running = false;
  private pending = false;

  constructor(opts: ReindexSchedulerOptions) {
    this.run = opts.run;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /** État mémoire courant — pour exposer la liveness (watcher actif côté serveur). */
  state(): SchedulerState {
    return {
      scheduled: this.timer !== null,
      running: this.running,
      pending: this.pending,
    };
  }

  /** Signale une écriture dans le vault → (re)programme un reindex débouncé. */
  notify(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.trigger();
    }, this.debounceMs);
  }

  /**
   * Lance un run, sauf si un est déjà en cours : dans ce cas on pose un flag
   * `pending` (coalescing) pour relancer exactement une fois à la fin — jamais
   * en parallèle, jamais de déclenchement perdu.
   */
  private trigger(): void {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    void Promise.resolve(this.run()).finally(() => {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        this.trigger();
      }
    });
  }
}

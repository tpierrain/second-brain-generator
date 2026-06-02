import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { CACHE_DIR } from "./config.js";

/** État d'un verrou de reindex détenu par un process. */
export interface LockState {
  pid: number;
  acquiredAt: string;
}

/** Persistance du verrou. Injectable pour les tests. */
export interface LockStorage {
  load(): LockState | null;
  save(state: LockState): void;
  clear(): void;
}

export interface ReindexLockOptions {
  storage?: LockStorage;
  now?: () => Date;
  pid?: number;
  /** Teste si un process est vivant (défaut : signal 0). */
  isAlive?: (pid: number) => boolean;
  /** Au-delà de cette ancienneté, le lock est présumé planté et reclaimable (défaut : 30 min). */
  staleAfterMs?: number;
}

/** Un reindex complet ne dure jamais aussi longtemps : au-delà, le holder est présumé planté. */
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Verrou single-writer sur le reindex : un seul process indexe à la fois.
 */
export class ReindexLock {
  private readonly storage: LockStorage;
  private readonly now: () => Date;
  private readonly pid: number;
  private readonly isAlive: (pid: number) => boolean;
  private readonly staleAfterMs: number;

  constructor(opts: ReindexLockOptions = {}) {
    this.storage = opts.storage ?? new FileLockStorage();
    this.now = opts.now ?? (() => new Date());
    this.pid = opts.pid ?? process.pid;
    this.isAlive = opts.isAlive ?? defaultIsAlive;
    this.staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  }

  acquire(): boolean {
    const current = this.storage.load();
    const heldByOther = current !== null && current.pid !== this.pid;
    if (heldByOther && this.isActive(current)) {
      return false;
    }
    this.storage.save({ pid: this.pid, acquiredAt: this.now().toISOString() });
    return true;
  }

  release(): void {
    this.storage.clear();
  }

  holder(): LockState | null {
    return this.storage.load();
  }

  /**
   * Holder seulement s'il correspond à un reindex réellement en cours (process
   * vivant et lock non périmé). Un lock orphelin (mort) ou planté (périmé)
   * renvoie `null` — utile pour afficher l'état sans fausse alerte.
   */
  activeHolder(): LockState | null {
    const current = this.storage.load();
    return current !== null && this.isActive(current) ? current : null;
  }

  /** Le holder correspond-il à un process vivant et un lock non périmé ? */
  private isActive(state: LockState): boolean {
    return this.isAlive(state.pid) && !this.isStale(state);
  }

  private isStale(state: LockState): boolean {
    const age = this.now().getTime() - new Date(state.acquiredAt).getTime();
    return age > this.staleAfterMs;
  }
}

/** Process vivant ? `kill(pid, 0)` ne tue pas : il échoue (throw) si le PID n'existe pas. */
function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Persistance par défaut : un petit JSON dans CACHE_DIR (gitignoré, per-machine). */
export class FileLockStorage implements LockStorage {
  private readonly path: string;

  constructor(path: string = resolve(CACHE_DIR, "reindex-lock.json")) {
    this.path = path;
  }

  load(): LockState | null {
    if (!existsSync(this.path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as LockState;
      if (typeof parsed.pid === "number" && typeof parsed.acquiredAt === "string") {
        return parsed;
      }
      return null;
    } catch {
      return null; // fichier corrompu → traité comme absent (lock reclaimable)
    }
  }

  save(state: LockState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf-8");
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}

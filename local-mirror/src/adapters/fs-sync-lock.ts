import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ISyncLock } from '../domain/ports.js';

/** What a per-source lockfile records: who holds it and since when. */
interface LockRecord {
  pid: number;
  acquiredAt: string;
}

/** A sync never takes this long: beyond it, the holder is presumed crashed and reclaimable. */
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

export interface FsSyncLockOptions {
  /** The `.local-mirror/` sidecar dir where lockfiles live (alongside state.json). */
  sidecarDir: string;
  pid?: number;
  now?: () => Date;
  /** Tests whether a process is alive (default: signal 0). */
  isAlive?: (pid: number) => boolean;
  /** Beyond this age, a held lock is presumed crashed and reclaimable (default: 10 min). */
  staleAfterMs?: number;
  /**
   * TEST-ONLY seam: invoked inside `acquire()` in the gap between the freshness check and the
   * exclusive create, to simulate a competing process landing there. Lets a single-threaded unit
   * test exercise the cross-process TOCTOU window that O_EXCL closes. Never set in production.
   */
  _interleaveBeforeCreate?: () => void;
}

/**
 * Filesystem single-flight lock (one lockfile per source). Two MCP processes share the
 * sidecar dir, so the lockfile is the cross-process arbiter: a source held by another LIVE,
 * non-stale process cannot be acquired → the caller skips it. A dead holder or a stale lock
 * is reclaimed. Modelled on the RAG module's `ReindexLock` (kept module-local per The Hive).
 */
export class FsSyncLock implements ISyncLock {
  private readonly sidecarDir: string;
  private readonly pid: number;
  private readonly now: () => Date;
  private readonly isAlive: (pid: number) => boolean;
  private readonly staleAfterMs: number;
  private readonly interleaveBeforeCreate?: () => void;

  constructor(opts: FsSyncLockOptions) {
    this.sidecarDir = opts.sidecarDir;
    this.pid = opts.pid ?? process.pid;
    this.now = opts.now ?? (() => new Date());
    this.isAlive = opts.isAlive ?? defaultIsAlive;
    this.staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.interleaveBeforeCreate = opts._interleaveBeforeCreate;
  }

  /**
   * Claim the source's lockfile. The create is EXCLUSIVE (`wx` / O_EXCL) so it is atomic across
   * OS processes: if two MCP windows tick at the same instant, only one create wins — the other
   * gets EEXIST, re-reads and backs off. Read-then-write without O_EXCL let BOTH overwrite the
   * file and both proceed (the Step 4c TOCTOU). A dead/stale holder is reclaimed (rm then retry);
   * the same process re-acquires its own lock (re-entrant). Bounded retries: each EEXIST re-reads
   * the winner, so we settle in at most a couple of turns.
   */
  acquire(name: string): boolean {
    mkdirSync(this.sidecarDir, { recursive: true });
    const path = this.pathFor(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = this.read(name);
      if (current !== null && current.pid === this.pid) {
        // Re-entrant: we already hold it — refresh our own record (safe, same owner).
        writeFileSync(path, this.record(), 'utf-8');
        return true;
      }
      if (current !== null && this.isActive(current)) return false; // held by a live other → skip
      if (current !== null) rmSync(path, { force: true }); // dead/stale holder → reclaim
      this.interleaveBeforeCreate?.();
      try {
        writeFileSync(path, this.record(), { encoding: 'utf-8', flag: 'wx' });
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        // Lost the create race to a concurrent process — loop to re-evaluate the new holder.
      }
    }
    return false;
  }

  /** The lockfile payload: who holds it and since when. */
  private record(): string {
    return JSON.stringify({ pid: this.pid, acquiredAt: this.now().toISOString() });
  }

  release(name: string): void {
    rmSync(this.pathFor(name), { force: true });
  }

  /** Does the record correspond to a live process holding a non-stale lock? */
  private isActive(record: LockRecord): boolean {
    return this.isAlive(record.pid) && !this.isStale(record);
  }

  private isStale(record: LockRecord): boolean {
    const age = this.now().getTime() - new Date(record.acquiredAt).getTime();
    return age > this.staleAfterMs;
  }

  private read(name: string): LockRecord | null {
    const path = this.pathFor(name);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as LockRecord;
      if (typeof parsed.pid === 'number' && typeof parsed.acquiredAt === 'string') return parsed;
      return null; // malformed → treated as absent (reclaimable)
    } catch {
      return null; // corrupt file → treated as absent (reclaimable)
    }
  }

  private pathFor(name: string): string {
    return join(this.sidecarDir, `${name}.sync.lock`);
  }
}

/** Process alive? `kill(pid, 0)` does not kill: it throws if the PID does not exist. */
function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

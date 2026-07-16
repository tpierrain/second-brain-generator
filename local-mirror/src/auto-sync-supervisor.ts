import { startAutoSync, type AutoSyncBootDeps } from './auto-sync-boot.js';
import type { AutoSyncScheduler } from './auto-sync-scheduler.js';

/**
 * Makes the boot-time auto-sync decision RE-TRIGGERABLE and idempotent. At boot the scheduler arms
 * only when a mirror is already declared (auto-sync-boot); a user who declares their FIRST mirror
 * mid-session would otherwise get no background refresh until they restart the brain (Step 4
 * finding #1). ensureRunning() closes that trap: it arms the scheduler once conditions are met and
 * is a no-op while already armed — so both the boot and a post-`setup_source` nudge can call it, and
 * whichever finds a declared mirror first wins, with no double-scheduler.
 */
export class AutoSyncSupervisor {
  private scheduler: AutoSyncScheduler | null = null;

  constructor(private readonly deps: AutoSyncBootDeps) {}

  /** Arm the scheduler if it isn't already running and conditions are met; otherwise a no-op. */
  async ensureRunning(): Promise<void> {
    if (this.scheduler !== null) return;
    this.scheduler = await startAutoSync(this.deps);
  }

  /** Stop a running scheduler (if any) so no orphan timer outlives the session. */
  stop(): void {
    if (this.scheduler !== null) {
      this.scheduler.stop();
      this.scheduler = null;
    }
  }
}

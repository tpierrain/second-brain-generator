import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoSyncSupervisor } from '../auto-sync-supervisor.js';
import type { AutoSyncScheduler, AutoSyncSchedulerOptions } from '../auto-sync-scheduler.js';
import type { FreshnessReport, SourceState, SyncReport } from '../domain/types.js';

// The supervisor makes the boot decision RE-TRIGGERABLE. At boot the scheduler is armed only when a
// mirror is already declared (auto-sync-boot); a user who declares their FIRST mirror mid-session
// would otherwise get no background refresh until they restart the brain (Step 4 finding #1). The
// supervisor closes that trap: ensureRunning() is idempotent — it arms once when conditions are met
// and stays a no-op once armed — so a post-setup_source nudge can arm what boot left idle.

function apiOverMutable(sourcesRef: { current: SourceState[] }, opts: { listThrows?: boolean } = {}) {
  return {
    listSources: async () => {
      if (opts.listThrows) throw new Error('config file unreadable (EACCES)');
      return sourcesRef.current;
    },
    checkFreshness: async (name: string): Promise<FreshnessReport> => ({ name, behind: false, localWatermark: null, remoteWatermark: null }),
    sync: async (name: string): Promise<SyncReport> => ({ name, status: 'ok', written: 0, deleted: 0, unchanged: 0 }),
  };
}
function sourceNamed(name: string): SourceState {
  return { name, title: name, connector: 'notion', watermark: null, lastSyncAt: null, lastSyncStatus: 'never', itemCount: 0 };
}

/** A capturing scheduler factory: records how many schedulers were created / started / stopped. */
function capturingFactory() {
  const calls = { created: 0, started: 0, stopped: 0 };
  const factory = (_opts: AutoSyncSchedulerOptions): AutoSyncScheduler => {
    calls.created += 1;
    return { start: () => void (calls.started += 1), stop: () => void (calls.stopped += 1) } as unknown as AutoSyncScheduler;
  };
  return { factory, calls };
}

test('ensureRunning arms the scheduler once and is idempotent when conditions are met', async () => {
  const { factory, calls } = capturingFactory();
  const supervisor = new AutoSyncSupervisor({
    api: apiOverMutable({ current: [sourceNamed('team-a')] }),
    intervalSeconds: 300,
    log: () => {},
    createScheduler: factory,
  });

  await supervisor.ensureRunning();
  await supervisor.ensureRunning();

  assert.equal(calls.created, 1); // armed exactly once, no double-scheduler on the second call
  assert.equal(calls.started, 1);
});

test('idle at boot, then arms once the first mirror is declared mid-session (finding #1)', async () => {
  const { factory, calls } = capturingFactory();
  const sources = { current: [] as SourceState[] };
  const supervisor = new AutoSyncSupervisor({
    api: apiOverMutable(sources),
    intervalSeconds: 300,
    log: () => {},
    createScheduler: factory,
  });

  await supervisor.ensureRunning(); // boot: no mirror declared → stays idle
  assert.equal(calls.created, 0);

  sources.current = [sourceNamed('team-a')]; // user declares their first mirror
  await supervisor.ensureRunning(); // post-setup_source nudge → now arms

  assert.equal(calls.created, 1);
  assert.equal(calls.started, 1);
});

test('stop() halts the running scheduler and lets a later ensureRunning re-arm', async () => {
  const { factory, calls } = capturingFactory();
  const supervisor = new AutoSyncSupervisor({
    api: apiOverMutable({ current: [sourceNamed('team-a')] }),
    intervalSeconds: 300,
    log: () => {},
    createScheduler: factory,
  });

  await supervisor.ensureRunning();
  supervisor.stop();
  await supervisor.ensureRunning(); // reset by stop() → arms a fresh scheduler

  assert.equal(calls.stopped, 1);
  assert.equal(calls.created, 2);
  assert.equal(calls.started, 2);
});

test('stop() before anything was armed is a harmless no-op', () => {
  const { factory, calls } = capturingFactory();
  const supervisor = new AutoSyncSupervisor({
    api: apiOverMutable({ current: [] }),
    intervalSeconds: 300,
    log: () => {},
    createScheduler: factory,
  });

  assert.doesNotThrow(() => supervisor.stop());
  assert.equal(calls.stopped, 0);
});

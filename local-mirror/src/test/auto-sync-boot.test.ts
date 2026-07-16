import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startAutoSync } from '../auto-sync-boot.js';
import type { AutoSyncScheduler, AutoSyncSchedulerOptions } from '../auto-sync-scheduler.js';
import type { FreshnessReport, SourceState, SyncReport } from '../domain/types.js';

// Composition-root glue: decide at boot whether to start the background auto-refresh. It runs only
// when the interval is enabled (> 0) AND at least one mirror is declared (auto-refresh study: "no
// mirror declared → nothing runs"). It announces its decision on stderr and never throws — a boot
// hiccup (config unreadable) must not take the whole MCP server down.

function apiOver(sources: SourceState[], opts: { listThrows?: boolean } = {}) {
  return {
    listSources: async () => {
      if (opts.listThrows) throw new Error('config file unreadable (EACCES)');
      return sources;
    },
    checkFreshness: async (name: string): Promise<FreshnessReport> => ({ name, behind: false, localWatermark: null, remoteWatermark: null }),
    sync: async (name: string): Promise<SyncReport> => ({ name, status: 'ok', written: 0, deleted: 0, unchanged: 0 }),
  };
}
function sourceNamed(name: string): SourceState {
  return { name, title: name, connector: 'notion', watermark: null, lastSyncAt: null, lastSyncStatus: 'never', itemCount: 0 };
}

/** A capturing scheduler factory: records the options and whether start() was called. */
function capturingFactory() {
  const calls = { created: undefined as AutoSyncSchedulerOptions | undefined, started: 0, stopped: 0 };
  const factory = (opts: AutoSyncSchedulerOptions): AutoSyncScheduler => {
    calls.created = opts;
    return { start: () => void (calls.started += 1), stop: () => void (calls.stopped += 1) } as unknown as AutoSyncScheduler;
  };
  return { factory, calls };
}

test('auto-sync starts when enabled and at least one mirror is declared', async () => {
  const logs: string[] = [];
  const { factory, calls } = capturingFactory();

  const scheduler = await startAutoSync({
    api: apiOver([sourceNamed('team-a'), sourceNamed('team-b')]),
    intervalSeconds: 300,
    log: (m) => logs.push(m),
    createScheduler: factory,
  });

  assert.ok(scheduler); // returned so the caller can stop it on shutdown
  assert.equal(calls.started, 1);
  assert.equal(calls.created?.intervalMs, 300_000); // seconds → milliseconds
  assert.ok(logs.some((l) => l.includes('300s') && l.includes('team-a') && l.includes('team-b')));
});

test('auto-sync stays off when the interval is 0 (escape hatch)', async () => {
  const logs: string[] = [];
  const { factory, calls } = capturingFactory();

  const scheduler = await startAutoSync({
    api: apiOver([sourceNamed('team-a')]),
    intervalSeconds: 0,
    log: (m) => logs.push(m),
    createScheduler: factory,
  });

  assert.equal(scheduler, null);
  assert.equal(calls.started, 0); // no scheduler created at all
  assert.ok(logs.some((l) => l.toLowerCase().includes('disabled')));
});

test('auto-sync stays idle when no mirror is declared yet', async () => {
  const logs: string[] = [];
  const { factory, calls } = capturingFactory();

  const scheduler = await startAutoSync({
    api: apiOver([]),
    intervalSeconds: 300,
    log: (m) => logs.push(m),
    createScheduler: factory,
  });

  assert.equal(scheduler, null);
  assert.equal(calls.started, 0);
  assert.ok(logs.some((l) => l.toLowerCase().includes('no mirror') || l.toLowerCase().includes('idle')));
});

test('a boot-time listSources failure is logged, never thrown (server stays up)', async () => {
  const logs: string[] = [];
  const { factory } = capturingFactory();

  const scheduler = await startAutoSync({
    api: apiOver([], { listThrows: true }),
    intervalSeconds: 300,
    log: (m) => logs.push(m),
    createScheduler: factory,
  });

  assert.equal(scheduler, null);
  assert.ok(logs.some((l) => l.toLowerCase().includes('could not') || l.toLowerCase().includes('unreadable')));
});

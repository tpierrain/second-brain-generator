import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoSyncScheduler } from '../auto-sync-scheduler.js';
import { aLocalMirror, aNotionLocalMirror, aNotionPage } from './builder.js';
import type { ILocalMirror } from '../domain/local-mirror.js';
import type { FreshnessReport, SourceState, SyncReport } from '../domain/types.js';

/** A minimal SourceState for hand-rolled fake APIs (only the name matters to the scheduler). */
function sourceNamed(name: string): SourceState {
  return { name, title: name, connector: 'notion', watermark: null, lastSyncAt: null, lastSyncStatus: 'never', itemCount: 0 };
}
const BEHIND = (name: string): FreshnessReport => ({ name, behind: true, localWatermark: null, remoteWatermark: 'x' });
const OK_REPORT = (name: string): SyncReport => ({ name, status: 'ok', written: 1, deleted: 0, unchanged: 0 });

// The background auto-refresh: a timer inside the MCP polls every N seconds. Each tick runs a
// CHEAP check_freshness for every declared source and triggers a sync ONLY for the ones reported
// `behind` (auto-refresh study, S6). No new Notion logic — the scheduler only orchestrates the
// existing checkFreshness + sync engine. Determinism (ADR 0009) via an injectable timer, so ticks
// fire synchronously in tests with no real 5-min waits.

/** Records the source names passed to checkFreshness/sync while delegating to the real domain. */
function recording(api: ILocalMirror) {
  const freshCalls: string[] = [];
  const syncCalls: string[] = [];
  const proxy: Pick<ILocalMirror, 'listSources' | 'checkFreshness' | 'sync'> = {
    listSources: () => api.listSources(),
    checkFreshness: (name) => {
      freshCalls.push(name);
      return api.checkFreshness(name);
    },
    sync: (name) => {
      syncCalls.push(name);
      return api.sync(name);
    },
  };
  return { proxy, freshCalls, syncCalls };
}

test('a tick checks freshness for every source and syncs only the behind ones', async () => {
  // Two declared sources over the same stub perimeter. `team-b` is synced up-front (so it is
  // up-to-date = NOT behind); `team-a` is never synced (a never-synced source is behind).
  const harness = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror({ name: 'team-a' }), aNotionLocalMirror({ name: 'team-b' }))
    .withNotionPages(aNotionPage({ id: 'page-1', content: 'First.\n' }));
  const api = harness.build();
  await api.sync('team-b');

  const { proxy, freshCalls, syncCalls } = recording(api);
  const scheduler = new AutoSyncScheduler({ api: proxy, intervalMs: 300_000 });
  await scheduler.tick();

  assert.deepEqual(freshCalls.sort(), ['team-a', 'team-b']); // checked every source
  assert.deepEqual(syncCalls, ['team-a']); // synced ONLY the behind one (team-b was fresh)
});

test('one failing source is logged but never aborts the others (fail-loud, keep ticking)', async () => {
  const logs: string[] = [];
  const syncCalls: string[] = [];
  const api = {
    listSources: async () => [sourceNamed('bad'), sourceNamed('good')],
    checkFreshness: async (name: string) => {
      if (name === 'bad') throw new Error('notion: 401 unauthorized');
      return BEHIND(name);
    },
    sync: async (name: string) => {
      syncCalls.push(name);
      return OK_REPORT(name);
    },
  };
  const scheduler = new AutoSyncScheduler({ api, intervalMs: 300_000, log: (m) => logs.push(m) });

  await scheduler.tick(); // must NOT reject even though `bad` throws

  assert.deepEqual(syncCalls, ['good']); // `good` still synced despite `bad` failing
  assert.ok(logs.some((l) => l.includes('bad')), 'the failing source is logged to stderr');
});

/** A controllable timer: captures the pending callback so a test fires "5 minutes elapsed" at will. */
function fakeTimer() {
  const pending: Array<() => void> = [];
  let lastMs: number | undefined;
  let cleared = 0;
  return {
    setTimer: (fn: () => void, ms: number) => {
      pending.push(fn);
      lastMs = ms;
      return pending.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {
      cleared += 1;
      pending.length = 0;
    },
    fire: () => pending.shift()?.(),
    get lastMs() {
      return lastMs;
    },
    get armedCount() {
      return pending.length;
    },
    get clearedCount() {
      return cleared;
    },
  };
}

test('start() arms a tick at the interval and re-arms after each tick fires', async () => {
  const harness = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror({ name: 'team-a' }))
    .withNotionPages(aNotionPage({ id: 'page-1', content: 'First.\n' }));
  const { proxy, freshCalls } = recording(harness.build());
  const timer = fakeTimer();
  const scheduler = new AutoSyncScheduler({ api: proxy, intervalMs: 300_000, setTimer: timer.setTimer, clearTimer: timer.clearTimer });

  scheduler.start();
  assert.equal(timer.lastMs, 300_000); // armed at the 5-min interval
  assert.equal(timer.armedCount, 1);

  timer.fire(); // 5 minutes elapse → the tick runs
  await scheduler.whenSettled();

  assert.ok(freshCalls.length >= 1, 'the tick actually polled a source'); // team-a is behind
  assert.equal(timer.armedCount, 1); // re-armed for the NEXT interval (keeps ticking)
});

test('stop() cancels the pending tick so the loop halts', async () => {
  const { proxy } = recording(aLocalMirror().withNotionPages(aNotionPage({ id: 'page-1' })).build());
  const timer = fakeTimer();
  const scheduler = new AutoSyncScheduler({ api: proxy, intervalMs: 300_000, setTimer: timer.setTimer, clearTimer: timer.clearTimer });

  scheduler.start();
  scheduler.stop();

  assert.equal(timer.armedCount, 0); // the pending timer was cleared
  assert.equal(timer.clearedCount, 1);
});

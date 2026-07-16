import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsSyncLock } from '../adapters/fs-sync-lock.js';

// ISyncLock on the real filesystem — one lockfile per source in the sidecar dir
// (`.local-mirror/<name>.sync.lock`). Single-flight ACROSS PROCESSES (two MCP windows
// on the same brain): a tick that finds a source locked by another LIVE process skips it
// rather than racing on `state.json` (S2 item 1 of the auto-refresh study).

async function aTempSidecar(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'lm-lock-'));
}

test('acquiring a free source succeeds and drops a lockfile', async () => {
  const sidecar = await aTempSidecar();
  const lock = new FsSyncLock({ sidecarDir: sidecar });

  assert.equal(lock.acquire('team-a'), true);
  assert.deepEqual(await readdir(sidecar), ['team-a.sync.lock']);
});

test('a source held by another LIVE process cannot be acquired (skip, do not race)', async () => {
  const sidecar = await aTempSidecar();
  const alive = new Set([4242]);
  const isAlive = (pid: number) => alive.has(pid);
  const processA = new FsSyncLock({ sidecarDir: sidecar, pid: 4242, isAlive });
  const processB = new FsSyncLock({ sidecarDir: sidecar, pid: 777, isAlive });

  assert.equal(processA.acquire('team-a'), true);
  assert.equal(processB.acquire('team-a'), false);
});

test('a lock left by a DEAD holder (crashed process) is reclaimable', async () => {
  const sidecar = await aTempSidecar();
  const crashed = new FsSyncLock({ sidecarDir: sidecar, pid: 4242, isAlive: () => true });
  assert.equal(crashed.acquire('team-a'), true);

  // The 4242 window died; a new window (pid 777) sees 4242 as no longer alive.
  const survivor = new FsSyncLock({ sidecarDir: sidecar, pid: 777, isAlive: (pid) => pid === 777 });
  assert.equal(survivor.acquire('team-a'), true);
});

test('a STALE lock (older than the timeout) is reclaimable even if the pid still looks alive', async () => {
  const sidecar = await aTempSidecar();
  let clock = new Date('2026-07-16T10:00:00.000Z');
  const holder = new FsSyncLock({ sidecarDir: sidecar, pid: 4242, isAlive: () => true, now: () => clock, staleAfterMs: 600_000 });
  assert.equal(holder.acquire('team-a'), true);

  clock = new Date('2026-07-16T10:11:00.000Z'); // +11 min > 10 min stale timeout
  const other = new FsSyncLock({ sidecarDir: sidecar, pid: 777, isAlive: () => true, now: () => clock, staleAfterMs: 600_000 });
  assert.equal(other.acquire('team-a'), true);
});

test('the SAME process re-acquires its own lock (re-entrant, never self-blocks)', async () => {
  const sidecar = await aTempSidecar();
  const lock = new FsSyncLock({ sidecarDir: sidecar, pid: 4242, isAlive: () => true });

  assert.equal(lock.acquire('team-a'), true);
  assert.equal(lock.acquire('team-a'), true);
});

test('a competing holder that lands between the freshness check and the create is NOT clobbered (atomic acquire across processes)', async () => {
  const sidecar = await aTempSidecar();
  const alive = new Set([4242, 777]);
  const isAlive = (pid: number) => alive.has(pid);

  // Process A (777) finds the source free, then — in the gap before its own write — process
  // B (4242) sneaks in and fully acquires. A's create must be EXCLUSIVE (O_EXCL / `wx`), so it
  // fails, A re-reads, sees B live and backs off (returns false). Without the exclusive create,
  // A would blindly overwrite B's record and BOTH would believe they hold the lock — the
  // cross-process TOCTOU (Step 4c). This proves mutual exclusion survives the read→write gap.
  const competitor = new FsSyncLock({ sidecarDir: sidecar, pid: 4242, isAlive });
  const a = new FsSyncLock({
    sidecarDir: sidecar,
    pid: 777,
    isAlive,
    _interleaveBeforeCreate: () => {
      competitor.acquire('team-a');
    },
  });

  assert.equal(a.acquire('team-a'), false);
  const rec = JSON.parse(await readFile(join(sidecar, 'team-a.sync.lock'), 'utf-8'));
  assert.equal(rec.pid, 4242); // B still holds; A did not clobber it.
});

test('release removes the lockfile and is idempotent', async () => {
  const sidecar = await aTempSidecar();
  const lock = new FsSyncLock({ sidecarDir: sidecar });
  lock.acquire('team-a');

  lock.release('team-a');
  lock.release('team-a'); // again — must not throw

  assert.deepEqual(await readdir(sidecar), []);
});

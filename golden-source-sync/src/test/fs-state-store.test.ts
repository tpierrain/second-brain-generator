import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStateStore } from '../adapters/fs-state-store.js';
import type { PersistedState } from '../domain/ports.js';

// IStateStore on the real filesystem — one JSON file per source in the sidecar dir
// (`.golden-source-sync/<name>.state.json`, committed but OUTSIDE the indexed vault, PRD §10).
// Writes are atomic (temp + rename) so a half-written state never gets committed.

async function aTempSidecar(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'gss-state-'));
}

function aState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    schemaVersion: 1,
    name: 'pa-sc',
    connector: 'notion',
    rootPageId: '304a2ca',
    watermark: '2026-06-15T09:32:00.000Z',
    lastSyncAt: '2026-06-15T09:35:12.000Z',
    lastSyncStatus: 'ok',
    items: {
      abc123: {
        title: 'Chaintrust error catalog',
        vaultPath: 'golden-sources/pa-sc/abc123.md',
        lastEditedTime: '2026-06-12T14:21:00.000Z',
        contentHash: 'sha256:deadbeef',
        lastWrittenAt: '2026-06-12T14:30:00.000Z',
      },
    },
    ...overrides,
  };
}

test('save then load round-trips a source state', async () => {
  const store = new FsStateStore(await aTempSidecar());
  const state = aState();

  await store.save('pa-sc', state);

  assert.deepEqual(await store.load('pa-sc'), state);
});

test('load of an unknown source returns null', async () => {
  const store = new FsStateStore(await aTempSidecar());

  assert.equal(await store.load('never-synced'), null);
});

test('delete removes the sidecar file and is idempotent', async () => {
  const store = new FsStateStore(await aTempSidecar());
  await store.save('pa-sc', aState());

  await store.delete('pa-sc');
  await store.delete('pa-sc'); // again — must not throw (ENOENT swallowed)

  assert.equal(await store.load('pa-sc'), null);
});

test('save overwrites in place and leaves no temp residue', async () => {
  const sidecar = await aTempSidecar();
  const store = new FsStateStore(sidecar);
  await store.save('pa-sc', aState({ watermark: '2026-01-01T00:00:00.000Z' }));

  await store.save('pa-sc', aState({ watermark: '2026-06-15T09:32:00.000Z' }));

  const loaded = await store.load('pa-sc');
  assert.equal(loaded?.watermark, '2026-06-15T09:32:00.000Z');
  assert.deepEqual(await readdir(sidecar), ['pa-sc.state.json']); // no leftover *.tmp
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStateStore } from '../adapters/fs-state-store.js';
import type { PersistedState } from '../domain/ports.js';

// IStateStore on the real filesystem — one JSON file per source in the sidecar dir
// (`.local-mirror/<name>.state.json`, committed but OUTSIDE the indexed vault, PRD §10).
// Writes are atomic (temp + rename) so a half-written state never gets committed.

async function aTempSidecar(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'gss-state-'));
}

function aState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    schemaVersion: 1,
    name: 'team-a',
    connector: 'notion',
    rootPageId: '0123abc',
    watermark: '2026-06-15T09:32:00.000Z',
    lastSyncAt: '2026-06-15T09:35:12.000Z',
    lastSyncStatus: 'ok',
    items: {
      abc123: {
        title: 'Sample error catalog',
        vaultPath: 'mirrors/team-a/abc123.md',
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

  await store.save('team-a', state);

  assert.deepEqual(await store.load('team-a'), state);
});

test('load of an unknown source returns null', async () => {
  const store = new FsStateStore(await aTempSidecar());

  assert.equal(await store.load('never-synced'), null);
});

test('delete removes the sidecar file and is idempotent', async () => {
  const store = new FsStateStore(await aTempSidecar());
  await store.save('team-a', aState());

  await store.delete('team-a');
  await store.delete('team-a'); // again — must not throw (ENOENT swallowed)

  assert.equal(await store.load('team-a'), null);
});

test('save overwrites in place and leaves no temp residue', async () => {
  const sidecar = await aTempSidecar();
  const store = new FsStateStore(sidecar);
  await store.save('team-a', aState({ watermark: '2026-01-01T00:00:00.000Z' }));

  await store.save('team-a', aState({ watermark: '2026-06-15T09:32:00.000Z' }));

  const loaded = await store.load('team-a');
  assert.equal(loaded?.watermark, '2026-06-15T09:32:00.000Z');
  assert.deepEqual(await readdir(sidecar), ['team-a.state.json']); // no leftover *.tmp
});

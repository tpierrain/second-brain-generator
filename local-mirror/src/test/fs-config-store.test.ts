import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsConfigStore } from '../adapters/fs-config-store.js';
import { aNotionLocalMirror } from './builder.js';

// IConfigStore on the real filesystem — the versioned source of truth
// `local-mirror.config.json` at repo root (PRD §2, §20.2). Written by `setup_source`,
// read at startup. Writes are atomic (temp + rename) so a half-written config is never committed.

async function aTempConfigFile(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'gss-config-')), 'local-mirror.config.json');
}

test('loadAll on a missing config file returns no sources', async () => {
  const store = new FsConfigStore(await aTempConfigFile());

  assert.deepEqual(await store.loadAll(), []);
});

test('upsert then loadAll round-trips a declared source', async () => {
  const store = new FsConfigStore(await aTempConfigFile());
  const config = aNotionLocalMirror();

  await store.upsert(config);

  assert.deepEqual(await store.loadAll(), [config]);
});

test('upsert of an existing name replaces it in place (no duplicate)', async () => {
  const path = await aTempConfigFile();
  const store = new FsConfigStore(path);
  await store.upsert(aNotionLocalMirror({ title: 'Old title' }));

  await store.upsert(aNotionLocalMirror({ title: 'New title' }));

  const sources = await store.loadAll();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, 'New title');
  assert.deepEqual(await readdir(join(path, '..')), ['local-mirror.config.json']); // no *.tmp
});

test('upsert preserves other declared sources', async () => {
  const store = new FsConfigStore(await aTempConfigFile());
  await store.upsert(aNotionLocalMirror({ name: 'team-a', target_dir: 'mirrors/team-a' }));

  await store.upsert(aNotionLocalMirror({ name: 'team-b', target_dir: 'mirrors/team-b' }));

  assert.deepEqual(
    (await store.loadAll()).map((s) => s.name),
    ['team-a', 'team-b'],
  );
});

test('remove drops a declared source', async () => {
  const store = new FsConfigStore(await aTempConfigFile());
  await store.upsert(aNotionLocalMirror({ name: 'team-a' }));
  await store.upsert(aNotionLocalMirror({ name: 'team-b' }));

  await store.remove('team-a');

  assert.deepEqual(
    (await store.loadAll()).map((s) => s.name),
    ['team-b'],
  );
});

test('the written file is valid JSON keyed by mirrors with a schemaVersion', async () => {
  const path = await aTempConfigFile();
  const store = new FsConfigStore(path);

  await store.upsert(aNotionLocalMirror());

  const parsed = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.mirrors.length, 1);
});

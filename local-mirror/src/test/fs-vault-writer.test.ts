import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsVaultWriter } from '../adapters/fs-vault-writer.js';

async function aTempVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'gss-vault-'));
}

test('write creates the file and its parent directories under the vault', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);

  await writer.write('mirrors/pa-sc/abc.md', '# Note\n');

  const written = await readFile(join(vaultDir, 'mirrors/pa-sc/abc.md'), 'utf8');
  assert.equal(written, '# Note\n');
});

test('write overwrites in place and leaves no temp residue', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);
  await writer.write('pa-sc/abc.md', 'v1\n');

  await writer.write('pa-sc/abc.md', 'v2\n');

  const dir = join(vaultDir, 'pa-sc');
  assert.equal(await readFile(join(dir, 'abc.md'), 'utf8'), 'v2\n');
  assert.deepEqual(await readdir(dir), ['abc.md']); // no leftover *.tmp
});

test('delete removes the file', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);
  await writer.write('pa-sc/gone.md', 'bye\n');

  await writer.delete('pa-sc/gone.md');

  assert.deepEqual(await readdir(join(vaultDir, 'pa-sc')), []);
});

test('delete of an already-absent file does not throw', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);

  await assert.doesNotReject(writer.delete('pa-sc/never-existed.md'));
});

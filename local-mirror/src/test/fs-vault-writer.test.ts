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

  await writer.write('mirrors/team-a/abc.md', '# Note\n');

  const written = await readFile(join(vaultDir, 'mirrors/team-a/abc.md'), 'utf8');
  assert.equal(written, '# Note\n');
});

test('write overwrites in place and leaves no temp residue', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);
  await writer.write('team-a/abc.md', 'v1\n');

  await writer.write('team-a/abc.md', 'v2\n');

  const dir = join(vaultDir, 'team-a');
  assert.equal(await readFile(join(dir, 'abc.md'), 'utf8'), 'v2\n');
  assert.deepEqual(await readdir(dir), ['abc.md']); // no leftover *.tmp
});

test('delete removes the file', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);
  await writer.write('team-a/gone.md', 'bye\n');

  await writer.delete('team-a/gone.md');

  assert.deepEqual(await readdir(join(vaultDir, 'team-a')), []);
});

test('delete of an already-absent file does not throw', async () => {
  const vaultDir = await aTempVault();
  const writer = new FsVaultWriter(vaultDir);

  await assert.doesNotReject(writer.delete('team-a/never-existed.md'));
});

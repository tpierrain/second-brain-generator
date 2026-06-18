// IVaultWriter on the real filesystem. Writes are atomic — temp file in the target
// directory then rename(2) — so the FileWatcher never indexes a half-written file (PRD §6).
// Deletes are idempotent (a page already gone is not an error) so reconciliation can be
// replayed safely (PRD §7).

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IVaultWriter } from '../domain/ports.js';

export class FsVaultWriter implements IVaultWriter {
  /** @param vaultDir absolute path of the vault root; write/delete paths are relative to it. */
  constructor(private readonly vaultDir: string) {}

  async write(path: string, content: string): Promise<void> {
    const fullPath = join(this.vaultDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    // temp file in the SAME directory → rename is atomic (same filesystem).
    const tempPath = `${fullPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, fullPath);
  }

  async delete(path: string): Promise<void> {
    await rm(join(this.vaultDir, path), { force: true });
  }
}

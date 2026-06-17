// IStateStore on the real filesystem. One JSON file per source in the sidecar dir
// (`.golden-source-sync/<name>.state.json`) — committed for cross-laptop continuity but
// OUTSIDE the indexed vault, so the FileWatcher never picks it up (PRD §7/§10). Writes are
// atomic (temp file in the sidecar dir + rename) so a half-written state is never committed.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IStateStore, PersistedState } from '../domain/ports.js';

export class FsStateStore implements IStateStore {
  /** @param sidecarDir absolute path of `.golden-source-sync/` (repo root, committed). */
  constructor(private readonly sidecarDir: string) {}

  async load(name: string): Promise<PersistedState | null> {
    try {
      return JSON.parse(await readFile(this.fileFor(name), 'utf8')) as PersistedState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(name: string, state: PersistedState): Promise<void> {
    await mkdir(this.sidecarDir, { recursive: true });
    const fullPath = this.fileFor(name);
    const tempPath = `${fullPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tempPath, fullPath);
  }

  async delete(name: string): Promise<void> {
    try {
      await unlink(this.fileFor(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; // idempotent
    }
  }

  private fileFor(name: string): string {
    return join(this.sidecarDir, `${name}.state.json`);
  }
}

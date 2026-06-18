// IConfigStore on the real filesystem — the versioned source of truth
// `local-mirror.config.json` at repo root (PRD §2, §20.2). Written by `setup_source`,
// read at startup. Writes are atomic (temp + rename) so a half-written config is never committed.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IConfigStore } from '../domain/ports.js';
import type { LocalMirrorConfig } from '../domain/types.js';

interface ConfigFile {
  schemaVersion: 1;
  mirrors: LocalMirrorConfig[];
}

export class FsConfigStore implements IConfigStore {
  /** @param configPath absolute path of `local-mirror.config.json` (repo root, committed). */
  constructor(private readonly configPath: string) {}

  async loadAll(): Promise<LocalMirrorConfig[]> {
    return (await this.readFile()).mirrors;
  }

  async upsert(config: LocalMirrorConfig): Promise<void> {
    const file = await this.readFile();
    const i = file.mirrors.findIndex((c) => c.name === config.name);
    if (i >= 0) file.mirrors[i] = config;
    else file.mirrors.push(config);
    await this.writeFile(file);
  }

  async remove(name: string): Promise<void> {
    const file = await this.readFile();
    file.mirrors = file.mirrors.filter((c) => c.name !== name);
    await this.writeFile(file);
  }

  private async writeFile(file: ConfigFile): Promise<void> {
    await mkdir(dirname(this.configPath), { recursive: true });
    const tempPath = `${this.configPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.configPath);
  }

  private async readFile(): Promise<ConfigFile> {
    try {
      return JSON.parse(await readFile(this.configPath, 'utf8')) as ConfigFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, mirrors: [] };
      }
      throw error;
    }
  }
}

// Test Builder — wires the Domain Service with in-memory SPI fakes and returns the
// API port (IGoldenSourceSync). Acceptance tests drive the port through this, never
// the MCP transport (PRD §15). The public API speaks business intentions only — no
// "stub" leaks into it.

import { GoldenSourceSync } from '../domain/golden-source-sync.js';
import type { IGoldenSourceSync } from '../domain/golden-source-sync.js';
import type {
  IClock,
  IConfigStore,
  ISourceConnector,
  IStateStore,
  IVaultWriter,
  PersistedState,
  SourceItem,
} from '../domain/ports.js';
import type { GoldenSourceConfig } from '../domain/types.js';

export function aGoldenSourceSync(): GoldenSourceSyncBuilder {
  return new GoldenSourceSyncBuilder();
}

class GoldenSourceSyncBuilder {
  private readonly declared: GoldenSourceConfig[] = [];

  /** Declare golden sources, as if already written to the config file. */
  withDeclaredSources(...configs: GoldenSourceConfig[]): this {
    this.declared.push(...configs);
    return this;
  }

  build(): IGoldenSourceSync {
    return new GoldenSourceSync({
      configStore: new InMemoryConfigStore(this.declared),
      stateStore: new InMemoryStateStore(),
      vaultWriter: new RecordingVaultWriter(),
      clock: new FixedClock(new Date('2026-06-17T00:00:00.000Z')),
      connectorFor: () => new EmptyConnector(),
    });
  }
}

/** A declared Notion golden source with sensible defaults (override per test). */
export function aNotionGoldenSource(
  overrides: Partial<GoldenSourceConfig> = {},
): GoldenSourceConfig {
  const name = overrides.name ?? 'pa-sc';
  return {
    name,
    title: overrides.title ?? 'PA/SC — supplier accounting',
    description: overrides.description ?? 'Questions about supplier accounting and e-invoicing.',
    connector: overrides.connector ?? {
      type: 'notion',
      config: {
        root_page_url: 'https://www.notion.so/inqom/HUB-304a2ca',
        token_env: 'GOLDEN_PA_SC_NOTION_TOKEN',
      },
    },
    target_dir: overrides.target_dir ?? `golden-sources/${name}`,
  };
}

class InMemoryConfigStore implements IConfigStore {
  constructor(private readonly configs: GoldenSourceConfig[]) {}
  async loadAll(): Promise<GoldenSourceConfig[]> {
    return [...this.configs];
  }
  async upsert(config: GoldenSourceConfig): Promise<void> {
    const i = this.configs.findIndex((c) => c.name === config.name);
    if (i >= 0) this.configs[i] = config;
    else this.configs.push(config);
  }
  async remove(name: string): Promise<void> {
    const i = this.configs.findIndex((c) => c.name === name);
    if (i >= 0) this.configs.splice(i, 1);
  }
}

class InMemoryStateStore implements IStateStore {
  private readonly states = new Map<string, PersistedState>();
  async load(name: string): Promise<PersistedState | null> {
    return this.states.get(name) ?? null;
  }
  async save(name: string, state: PersistedState): Promise<void> {
    this.states.set(name, state);
  }
}

class RecordingVaultWriter implements IVaultWriter {
  readonly written = new Map<string, string>();
  readonly deleted: string[] = [];
  async write(path: string, content: string): Promise<void> {
    this.written.set(path, content);
  }
  async delete(path: string): Promise<void> {
    this.written.delete(path);
    this.deleted.push(path);
  }
}

class EmptyConnector implements ISourceConnector {
  async listItems(): Promise<SourceItem[]> {
    return [];
  }
  async fetchContent(): Promise<string> {
    return '';
  }
}

class FixedClock implements IClock {
  constructor(private readonly fixed: Date) {}
  now(): Date {
    return this.fixed;
  }
}

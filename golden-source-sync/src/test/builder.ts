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
  private readonly pages: StubPage[] = [];
  /** Stable reference so tests can inspect the vault after build()/sync(). */
  private readonly vault = new RecordingVaultWriter();

  /** Declare golden sources, as if already written to the config file. */
  withDeclaredSources(...configs: GoldenSourceConfig[]): this {
    this.declared.push(...configs);
    return this;
  }

  /**
   * The pages a sync will enumerate from the (single) source's connector. Adding
   * pages without an explicit source auto-declares the default Notion source.
   */
  withNotionPages(...pages: StubPage[]): this {
    this.pages.push(...pages);
    return this;
  }

  /** The Markdown files written into the vault, by path — the sync outcome to assert. */
  vaultFiles(): Map<string, string> {
    return this.vault.written;
  }

  build(): IGoldenSourceSync {
    const declared =
      this.declared.length > 0
        ? this.declared
        : this.pages.length > 0
          ? [aNotionGoldenSource()]
          : [];
    return new GoldenSourceSync({
      configStore: new InMemoryConfigStore(declared),
      stateStore: new InMemoryStateStore(),
      vaultWriter: this.vault,
      clock: new FixedClock(new Date('2026-06-17T00:00:00.000Z')),
      connectorFor: () => new StubConnector(this.pages),
    });
  }
}

/** A source item plus its produced Markdown body — what a stubbed connector serves. */
export interface StubPage extends SourceItem {
  content: string;
  /** When set, the connector fails to fetch this page's content (a Notion error). */
  fetchError?: string;
}

/** A Notion page with sensible defaults (override per test). */
export function aNotionPage(overrides: Partial<StubPage> = {}): StubPage {
  const id = overrides.id ?? '304a2ca-page-1';
  return {
    id,
    title: overrides.title ?? 'Chaintrust error catalog',
    url: overrides.url ?? `https://www.notion.so/inqom/${id}`,
    lastEditedTime: overrides.lastEditedTime ?? '2026-06-12T14:21:00.000Z',
    content: overrides.content ?? '# Chaintrust error catalog\n\nWhen the API returns 402…\n',
    fetchError: overrides.fetchError,
  };
}

/** A Notion page whose content the connector fails to fetch (e.g. a transient API error). */
export function anUnreadableNotionPage(overrides: Partial<StubPage> = {}): StubPage {
  return aNotionPage({ ...overrides, fetchError: overrides.fetchError ?? 'notion: 503' });
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

class StubConnector implements ISourceConnector {
  constructor(private readonly pages: StubPage[]) {}
  async listItems(): Promise<SourceItem[]> {
    return this.pages.map(({ content: _content, ...item }) => item);
  }
  async fetchContent(item: SourceItem): Promise<string> {
    const page = this.pages.find((p) => p.id === item.id);
    if (page?.fetchError) throw new Error(page.fetchError);
    return page?.content ?? '';
  }
}

class FixedClock implements IClock {
  constructor(private readonly fixed: Date) {}
  now(): Date {
    return this.fixed;
  }
}

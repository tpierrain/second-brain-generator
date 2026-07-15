// Test Builder — wires the Domain Service with in-memory SPI fakes and returns the
// API port (ILocalMirror). Acceptance tests drive the port through this, never
// the MCP transport (PRD §15). The public API speaks business intentions only — no
// "stub" leaks into it.

import { LocalMirror } from '../domain/local-mirror.js';
import type { ILocalMirror } from '../domain/local-mirror.js';
import type {
  IClock,
  IConfigStore,
  ISourceConnector,
  IStateStore,
  IVaultWriter,
  PersistedState,
  SourceItem,
} from '../domain/ports.js';
import type { LocalMirrorConfig } from '../domain/types.js';

export function aLocalMirror(): LocalMirrorBuilder {
  return new LocalMirrorBuilder();
}

class LocalMirrorBuilder {
  private readonly declared: LocalMirrorConfig[] = [];
  private pages: StubPage[] = [];
  /** When false, serving pages no longer auto-declares the default source (setup_source case). */
  private autoDeclare = true;
  /** When set, the connector fails to enumerate the perimeter (PRD §7/§12 guardrail). */
  private enumerationError: string | undefined;
  /** When true, the sidecar state store cannot be read (a corrupt/unreachable store). */
  private unreachableStore = false;
  /** When true, the config store itself cannot be read (health-check "config unreadable"). */
  private unreadableConfig = false;
  /** Stable reference so tests can inspect the vault after build()/sync(). */
  private readonly vault = new RecordingVaultWriter();
  /** Stable reference so tests can inspect what `setup_source` declared. */
  private readonly configs = new InMemoryConfigStore(this.declared, () => this.unreadableConfig);

  /** Declare local mirrors, as if already written to the config file. */
  withDeclaredSources(...configs: LocalMirrorConfig[]): this {
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

  /**
   * The pages the connector serves WITHOUT declaring any source — the situation
   * `setup_source` faces: a brand-new zone whose scope it must test before declaring it.
   */
  withConnectablePages(...pages: StubPage[]): this {
    this.pages.push(...pages);
    this.autoDeclare = false;
    return this;
  }

  /**
   * Drop a page from the live perimeter between two syncs — simulates a Notion page
   * deleted or moved out of scope. The connector enumerates the remaining pages.
   */
  withoutPage(id: string): this {
    this.pages = this.pages.filter((p) => p.id !== id);
    return this;
  }

  /**
   * Replace a page (same id) between two syncs — simulates a Notion rename or edit. The
   * `.md` is keyed by the stable id, so this must rewrite the SAME file, never orphan one.
   */
  withRevisedPage(page: StubPage): this {
    this.pages = this.pages.map((p) => (p.id === page.id ? page : p));
    return this;
  }

  /**
   * Make the next enumeration fail (token lost, network, truncated pagination): the
   * connector's `listItems` throws. The §7/§12 guardrail must then delete nothing.
   */
  withFailingEnumeration(error = 'notion: 401 unauthorized'): this {
    this.enumerationError = error;
    return this;
  }

  /** Clear a previously-armed enumeration failure (the source recovers). */
  withRecoveredEnumeration(): this {
    this.enumerationError = undefined;
    return this;
  }

  /** Make the sidecar state store unreadable — a corrupt/unreachable mirror store. */
  withUnreachableStore(): this {
    this.unreachableStore = true;
    return this;
  }

  /** Make the config store itself throw on read — the health-check "config unreadable" path. */
  withUnreadableConfig(): this {
    this.unreadableConfig = true;
    return this;
  }

  /**
   * Make the vault refuse to delete a given file (I/O error, permission, transient FS
   * failure). A failing deletion must not abort the whole sync after the page writes
   * already landed — it freezes the run as `partial` and keeps the page tracked for retry.
   */
  withFailingDeletionOf(vaultPath: string): this {
    this.vault.failDeleteOf(vaultPath);
    return this;
  }

  /** The Markdown files written into the vault, by path — the sync outcome to assert. */
  vaultFiles(): Map<string, string> {
    return this.vault.written;
  }

  /** The sources currently declared (after a `setup_source`, the new one shows up here). */
  async declaredSources(): Promise<LocalMirrorConfig[]> {
    return this.configs.loadAll();
  }

  build(): ILocalMirror {
    if (this.declared.length === 0 && this.autoDeclare && this.pages.length > 0) {
      this.declared.push(aNotionLocalMirror());
    }
    return new LocalMirror({
      configStore: this.configs,
      stateStore: new InMemoryStateStore(this.unreachableStore),
      vaultWriter: this.vault,
      clock: new FixedClock(new Date('2026-06-17T00:00:00.000Z')),
      connectorFor: () => new StubConnector(() => this.pages, () => this.enumerationError),
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
  const id = overrides.id ?? '0123abc-page-1';
  return {
    id,
    title: overrides.title ?? 'Sample error catalog',
    url: overrides.url ?? `https://www.notion.so/acme/${id}`,
    lastEditedTime: overrides.lastEditedTime ?? '2026-06-12T14:21:00.000Z',
    content: overrides.content ?? '# Sample error catalog\n\nWhen the API returns 402…\n',
    fetchError: overrides.fetchError,
  };
}

/** A Notion page whose content the connector fails to fetch (e.g. a transient API error). */
export function anUnreadableNotionPage(overrides: Partial<StubPage> = {}): StubPage {
  return aNotionPage({ ...overrides, fetchError: overrides.fetchError ?? 'notion: 503' });
}

/** A declared Notion local mirror with sensible defaults (override per test). */
export function aNotionLocalMirror(
  overrides: Partial<LocalMirrorConfig> = {},
): LocalMirrorConfig {
  const name = overrides.name ?? 'team-a';
  return {
    name,
    title: overrides.title ?? 'Team A — invoices',
    description: overrides.description ?? 'Questions about team workflows.',
    connector: overrides.connector ?? {
      type: 'notion',
      config: {
        root_page_url: 'https://www.notion.so/acme/Page-0123abc0b1c24d6e8f0a1b2c3d4e5f60',
        token_env: 'GOLDEN_TEAM_A_NOTION_TOKEN',
      },
    },
    target_dir: overrides.target_dir ?? `mirrors/${name}`,
  };
}

class InMemoryConfigStore implements IConfigStore {
  constructor(
    private readonly configs: LocalMirrorConfig[],
    private readonly unreadable: () => boolean = () => false,
  ) {}
  async loadAll(): Promise<LocalMirrorConfig[]> {
    if (this.unreadable()) throw new Error('config file unreadable (EACCES)');
    return [...this.configs];
  }
  async upsert(config: LocalMirrorConfig): Promise<void> {
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
  constructor(private readonly unreachable = false) {}
  async load(name: string): Promise<PersistedState | null> {
    if (this.unreachable) throw new Error(`state store unreachable for "${name}"`);
    return this.states.get(name) ?? null;
  }
  async save(name: string, state: PersistedState): Promise<void> {
    this.states.set(name, state);
  }
  async delete(name: string): Promise<void> {
    this.states.delete(name);
  }
}

class RecordingVaultWriter implements IVaultWriter {
  readonly written = new Map<string, string>();
  readonly deleted: string[] = [];
  private readonly failingDeletes = new Set<string>();
  failDeleteOf(path: string): void {
    this.failingDeletes.add(path);
  }
  async write(path: string, content: string): Promise<void> {
    this.written.set(path, content);
  }
  async delete(path: string): Promise<void> {
    // Throw BEFORE removing — a failed deletion leaves the file on disk.
    if (this.failingDeletes.has(path)) throw new Error(`EACCES: cannot delete ${path}`);
    this.written.delete(path);
    this.deleted.push(path);
  }
}

class StubConnector implements ISourceConnector {
  constructor(
    private readonly getPages: () => StubPage[],
    private readonly getEnumerationError: () => string | undefined,
  ) {}
  async listItems(): Promise<SourceItem[]> {
    const error = this.getEnumerationError();
    if (error) throw new Error(error);
    return this.getPages().map(({ content: _content, ...item }) => item);
  }
  async fetchContent(item: SourceItem): Promise<string> {
    const page = this.getPages().find((p) => p.id === item.id);
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

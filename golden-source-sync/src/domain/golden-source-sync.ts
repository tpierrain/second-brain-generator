import type {
  FreshnessReport,
  GoldenSourceConfig,
  RemoveResult,
  SetupRequest,
  SetupResult,
  SourceState,
  SourceStatus,
  SyncReport,
} from './types.js';
import type {
  ConnectorFactory,
  IClock,
  IConfigStore,
  IStateStore,
  IVaultWriter,
  PersistedItem,
  PersistedState,
} from './ports.js';
import { toGoldenSourceMarkdown } from '../lib/markdown.js';
import { contentHash } from '../lib/content-hash.js';

/**
 * API port (driving side) — the domain contract, transport-independent (PRD §5).
 * The MCP tools (§9) are a 1:1 translation of this port; one could drive it from a
 * CLI or HTTP without touching the domain.
 */
export interface IGoldenSourceSync {
  setupSource(req: SetupRequest): Promise<SetupResult>;
  listSources(): Promise<SourceState[]>;
  /** `name` is a source name or the literal `"all"` (PRD §9). */
  sync(name: string): Promise<SyncReport>;
  checkFreshness(name: string): Promise<FreshnessReport>;
  status(name: string): Promise<SourceStatus>;
  removeSource(name: string, cleanup?: boolean): Promise<RemoveResult>;
}

/** Driven dependencies of the Domain Service — all SPI, all stubbable (PRD §5). */
export interface GoldenSourceSyncDeps {
  configStore: IConfigStore;
  stateStore: IStateStore;
  vaultWriter: IVaultWriter;
  clock: IClock;
  connectorFor: ConnectorFactory;
}

/** The Domain Service — the concrete API port. Pure orchestration, no transport. */
export class GoldenSourceSync implements IGoldenSourceSync {
  constructor(private readonly deps: GoldenSourceSyncDeps) {}

  async listSources(): Promise<SourceState[]> {
    const configs = await this.deps.configStore.loadAll();
    return Promise.all(configs.map((config) => this.describe(config)));
  }

  private async describe(config: GoldenSourceConfig): Promise<SourceState> {
    const persisted = await this.deps.stateStore.load(config.name);
    return toSourceState(config, persisted);
  }

  setupSource(_req: SetupRequest): Promise<SetupResult> {
    return notImplemented('setupSource', 'Step 6');
  }

  /**
   * Step 3 — stateful delta sync. Each enumerated page becomes one Markdown note, but it
   * is only (re)written when the produced markdown's hash differs from the one recorded in
   * the per-source state sidecar (PRD §10) → a no-change sync rewrites nothing. The
   * watermark advances to the max `last_edited_time` of the perimeter (PRD §7/§16), only on
   * full success. Deletion reconciliation stays out of scope here (Step 5).
   */
  async sync(name: string): Promise<SyncReport> {
    const configs = await this.deps.configStore.loadAll();
    const config = configs.find((c) => c.name === name);
    if (!config) {
      return { name, status: 'failed', written: 0, deleted: 0, unchanged: 0 };
    }
    const previous = await this.deps.stateStore.load(config.name);
    const connector = this.deps.connectorFor(config);
    const items = await connector.listItems();

    const now = this.deps.clock.now().toISOString();
    const nextItems: Record<string, PersistedItem> = {};
    let written = 0;
    let unchanged = 0;
    let perimeterMax: string | null = null;
    let allOk = true;

    for (const item of items) {
      const vaultPath = `${config.target_dir}/${item.id}.md`;
      const tracked = previous?.items[item.id];
      try {
        const markdown = toGoldenSourceMarkdown(config.name, item, await connector.fetchContent(item));
        const hash = contentHash(markdown);
        if (tracked && tracked.contentHash === hash) {
          nextItems[item.id] = tracked;
          unchanged += 1;
        } else {
          await this.deps.vaultWriter.write(vaultPath, markdown);
          nextItems[item.id] = {
            title: item.title,
            vaultPath,
            lastEditedTime: item.lastEditedTime,
            contentHash: hash,
            lastWrittenAt: now,
          };
          written += 1;
        }
      } catch {
        // §10/§12: when in doubt we don't write — keep the last good version of this item
        // (incremental persistence) and mark the whole sync partial so the watermark freezes.
        allOk = false;
        if (tracked) nextItems[item.id] = tracked;
      }
      if (perimeterMax === null || item.lastEditedTime > perimeterMax) {
        perimeterMax = item.lastEditedTime;
      }
    }

    // The watermark advances to the perimeter max only on a fully successful sync; a partial
    // sync freezes it at the previous value, so the next run re-pulls the missed edits (PRD §10).
    const status = allOk ? 'ok' : 'partial';
    await this.deps.stateStore.save(config.name, {
      schemaVersion: 1,
      name: config.name,
      connector: config.connector.type,
      // URL→pageId extraction lands in Step 4; the URL is the stable root identifier for now.
      rootPageId: previous?.rootPageId ?? config.connector.config.root_page_url,
      watermark: allOk ? perimeterMax : (previous?.watermark ?? null),
      lastSyncAt: now,
      lastSyncStatus: status,
      items: nextItems,
    });

    return { name, status, written, deleted: 0, unchanged };
  }

  checkFreshness(_name: string): Promise<FreshnessReport> {
    return notImplemented('checkFreshness', 'Step 7');
  }

  status(_name: string): Promise<SourceStatus> {
    return notImplemented('status', 'Step 7');
  }

  removeSource(_name: string, _cleanup?: boolean): Promise<RemoveResult> {
    return notImplemented('removeSource', 'Step 7');
  }
}

/** Maps a declared config + its persisted state into the API-facing SourceState. */
export function toSourceState(
  config: GoldenSourceConfig,
  persisted: PersistedState | null,
): SourceState {
  return {
    name: config.name,
    title: config.title,
    connector: config.connector.type,
    watermark: persisted?.watermark ?? null,
    lastSyncAt: persisted?.lastSyncAt ?? null,
    lastSyncStatus: persisted?.lastSyncStatus ?? 'never',
    itemCount: persisted ? Object.keys(persisted.items).length : 0,
  };
}

function notImplemented(method: string, step: string): Promise<never> {
  return Promise.reject(new Error(`${method}() is implemented in ${step}`));
}

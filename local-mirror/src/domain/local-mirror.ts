import type {
  FreshnessReport,
  HealthCheckEntry,
  HealthReport,
  LocalMirrorConfig,
  RemoveResult,
  SetupRequest,
  SetupResult,
  SourceState,
  SourceStatus,
  SyncReport,
  SyncStatus,
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
import { toLocalMirrorMarkdown } from '../lib/markdown.js';
import { contentHash } from '../lib/content-hash.js';
import { extractPageId } from '../lib/notion-url.js';
import { pagesToDelete } from './reconcile.js';

/**
 * API port (driving side) — the domain contract, transport-independent (PRD §5).
 * The MCP tools (§9) are a 1:1 translation of this port; one could drive it from a
 * CLI or HTTP without touching the domain.
 */
export interface ILocalMirror {
  setupSource(req: SetupRequest): Promise<SetupResult>;
  listSources(): Promise<SourceState[]>;
  /** `name` is a source name or the literal `"all"` (PRD §9). */
  sync(name: string): Promise<SyncReport>;
  checkFreshness(name: string): Promise<FreshnessReport>;
  status(name: string): Promise<SourceStatus>;
  removeSource(name: string, cleanup?: boolean): Promise<RemoveResult>;
  /** Standard module health (ADR 0030): is the optional mirror operational? */
  healthCheck(): Promise<HealthReport>;
}

/** Driven dependencies of the Domain Service — all SPI, all stubbable (PRD §5). */
export interface LocalMirrorDeps {
  configStore: IConfigStore;
  stateStore: IStateStore;
  vaultWriter: IVaultWriter;
  clock: IClock;
  connectorFor: ConnectorFactory;
}

/** The Domain Service — the concrete API port. Pure orchestration, no transport. */
export class LocalMirror implements ILocalMirror {
  constructor(private readonly deps: LocalMirrorDeps) {}

  async listSources(): Promise<SourceState[]> {
    const configs = await this.deps.configStore.loadAll();
    return Promise.all(configs.map((config) => this.describe(config)));
  }

  private async describe(config: LocalMirrorConfig): Promise<SourceState> {
    const persisted = await this.deps.stateStore.load(config.name);
    return toSourceState(config, persisted);
  }

  /**
   * Onboard a brand-new local mirror (PRD §13). First it **tests the scope**: the connector's
   * scoped enumeration must return the zone — an enumeration error reads as "auth/connection
   * problem", and zero pages reads as "root not connected" (PRD §11.5/§12). Only once the scope
   * is proven do we **declare** the source (config file = versioned source of truth, §20.2) and
   * run the **first sync**. The token never travels through Claude's context — only its env-var
   * name (`tokenEnv`) is stored (§11).
   */
  async setupSource(req: SetupRequest): Promise<SetupResult> {
    const config = configFromRequest(req);
    const connector = this.deps.connectorFor(config);

    let items;
    try {
      items = await connector.listItems();
    } catch (error) {
      return {
        name: req.name,
        ok: false,
        message:
          `Could not reach the "${req.name}" zone: ${errorMessage(error)}. ` +
          `Check that "${req.tokenEnv}" holds a valid Read-content token and that the root page ` +
          `is connected to the integration in Notion (••• → Connections).`,
      };
    }

    if (items.length === 0) {
      return {
        name: req.name,
        ok: false,
        message:
          `The scoped search returned 0 pages for "${req.name}". The root page is not connected ` +
          `to the integration yet: in Notion, open the root page → ••• → Connections → add your ` +
          `integration, then run setup again. (Access cascades over the whole sub-tree.)`,
      };
    }

    await this.deps.configStore.upsert(config);
    const report = await this.sync(config.name);

    return {
      name: req.name,
      ok: report.status !== 'failed',
      message:
        `Source "${req.name}" set up: scope confirmed (${items.length} page(s) in the zone), ` +
        `first sync ${report.status} — ${report.written} written, ${report.unchanged} unchanged. ` +
        `Files live under ${config.target_dir}/; the brain will index them and answer with ` +
        `clickable citations.`,
    };
  }

  /**
   * Stateful delta sync + deletion reconciliation. Each enumerated page becomes one Markdown
   * note, (re)written only when the produced markdown's hash differs from the one recorded in
   * the per-source state sidecar (PRD §10) → a no-change sync rewrites nothing. A page that left
   * the perimeter has its `.md` deleted (Step 5). The watermark advances to the max
   * `last_edited_time` of the perimeter (PRD §7/§16), only on full success.
   *
   * The §7/§12 guardrail is non-negotiable: a doubtful perimeter — `listItems()` rejecting, or a
   * wholesale disappearance against a non-empty corpus — NEVER triggers a deletion; it freezes
   * the source as `partial` so a remote glitch can never wipe the local mirror.
   */
  async sync(name: string): Promise<SyncReport> {
    if (name === 'all') return this.syncAll();
    const configs = await this.deps.configStore.loadAll();
    const config = configs.find((c) => c.name === name);
    if (!config) {
      return { name, status: 'failed', written: 0, deleted: 0, unchanged: 0 };
    }
    const previous = await this.deps.stateStore.load(config.name);
    const connector = this.deps.connectorFor(config);
    const now = this.deps.clock.now().toISOString();

    // §7/§12 guardrail (the #1 risk): a failed/incomplete enumeration must NEVER read as an
    // empty perimeter, or reconciliation would wipe the whole corpus. When `listItems()` rejects
    // (401/429/network/truncated pagination), we delete nothing, keep every tracked item, freeze
    // the watermark, and report `partial` so the next run re-pulls everything.
    let items;
    try {
      items = await connector.listItems();
    } catch {
      return this.freezeAsPartial(config, previous, now);
    }

    // §7/§12 guardrail: a lost scope / disconnected root makes Notion's `search` return ZERO
    // pages WITHOUT an error. Reconciling that against a non-empty corpus would wipe the whole
    // local mirror. So a wholesale "everything vanished" is treated as suspicious, not real:
    // delete nothing, keep every tracked item, freeze the watermark, report `partial`.
    const previousCount = previous ? Object.keys(previous.items).length : 0;
    if (items.length === 0 && previousCount > 0) {
      return this.freezeAsPartial(config, previous, now);
    }

    const nextItems: Record<string, PersistedItem> = {};
    let written = 0;
    let unchanged = 0;
    const perimeterMax = maxLastEditedTime(items); // watermark = max of the perimeter (PRD §16)
    let allOk = true;

    for (const item of items) {
      const vaultPath = `${config.target_dir}/${item.id}.md`;
      const tracked = previous?.items[item.id];
      try {
        const markdown = toLocalMirrorMarkdown(config.name, item, await connector.fetchContent(item));
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
    }

    // Deletion reconciliation (PRD §7): a page that left the enumerated perimeter (deleted or
    // moved out of scope) has its `.md` removed and is dropped from the state map. We only get
    // here once `listItems()` resolved — a failed/incomplete enumeration never reaches this
    // point, so the non-negotiable §7/§12 guardrail (never delete on a doubtful perimeter) holds.
    let deleted = 0;
    for (const { id, ...stale } of pagesToDelete(items, previous?.items ?? {})) {
      try {
        await this.deps.vaultWriter.delete(stale.vaultPath);
        deleted += 1;
      } catch {
        // A delete that fails (I/O/permission/transient) must NOT abort the sync after the
        // page writes already landed, or the vault would diverge from the saved state. Freeze
        // the run as `partial` (watermark frozen) and KEEP the page tracked, so the next sync
        // retries its removal and state stays consistent with what is actually on disk.
        allOk = false;
        nextItems[id] = stale;
      }
    }

    // The watermark advances to the perimeter max only on a fully successful sync; a partial
    // sync freezes it at the previous value, so the next run re-pulls the missed edits (PRD §10).
    const status = allOk ? 'ok' : 'partial';
    await this.deps.stateStore.save(config.name, {
      schemaVersion: 1,
      name: config.name,
      connector: config.connector.type,
      rootPageId: rootPageIdOf(config, previous),
      watermark: allOk ? perimeterMax : (previous?.watermark ?? null),
      lastSyncAt: now,
      lastSyncStatus: status,
      items: nextItems,
    });

    return { name, status, written, deleted, unchanged };
  }

  /**
   * Fan-out: refresh EVERY declared source in one call (PRD §9, `sync("all")`). The sources are
   * isolated by construction (own connector/token, own vault subfolder, own sidecar — nothing
   * mutable is shared), so they run CONCURRENTLY: a slow source never head-of-line-blocks the
   * rest. `allSettled` makes the fan-out CONTAINED — one source throwing is reported as a failed
   * entry, it never aborts the others. The aggregate sums the counts and reports the per-source
   * breakdown; its status is `ok` only if every source is `ok`, `failed` only if every source
   * failed, else `partial`.
   */
  private async syncAll(): Promise<SyncReport> {
    const configs = await this.deps.configStore.loadAll();
    const settled = await Promise.allSettled(configs.map((c) => this.sync(c.name)));
    const sources = settled.map((outcome, i) =>
      outcome.status === 'fulfilled' ? outcome.value : failedReport(configs[i].name),
    );
    return aggregateReports(sources);
  }

  /**
   * The §7/§12 guardrail outcome: a doubtful perimeter (enumeration failure, or a wholesale
   * disappearance) must change nothing on disk. We persist a `partial` marker with the watermark
   * frozen and every tracked item kept, so the next run re-pulls and reconciles from solid ground.
   */
  private async freezeAsPartial(
    config: LocalMirrorConfig,
    previous: PersistedState | null,
    now: string,
  ): Promise<SyncReport> {
    await this.deps.stateStore.save(config.name, {
      schemaVersion: 1,
      name: config.name,
      connector: config.connector.type,
      rootPageId: rootPageIdOf(config, previous),
      watermark: previous?.watermark ?? null,
      lastSyncAt: now,
      lastSyncStatus: 'partial',
      items: previous?.items ?? {},
    });
    return { name: config.name, status: 'partial', written: 0, deleted: 0, unchanged: 0 };
  }

  /**
   * Light watermark-only freshness check (PRD §8/§9): enumerate the perimeter metadata (no
   * content fetched, nothing written), take the remote max `last_edited_time`, and compare it
   * to the local watermark. A source is `behind` when the remote perimeter holds an edit the
   * local watermark hasn't caught yet — including a brand-new, never-synced source.
   */
  async checkFreshness(name: string): Promise<FreshnessReport> {
    const config = await this.configOrThrow(name);
    const persisted = await this.deps.stateStore.load(config.name);
    const items = await this.deps.connectorFor(config).listItems();
    const remoteWatermark = maxLastEditedTime(items);
    const localWatermark = persisted?.watermark ?? null;
    const behind = remoteWatermark !== null && (localWatermark === null || remoteWatermark > localWatermark);
    return { name, behind, localWatermark, remoteWatermark };
  }

  /** A single source's state — last sync, watermark, item count, lateness (PRD §9). No pull. */
  async status(name: string): Promise<SourceStatus> {
    return this.describe(await this.configOrThrow(name));
  }

  /**
   * Standard module health (ADR 0030): is the OPTIONAL Notion mirror operational?
   * The check belongs here (the module); the caller owns the reaction. Read-only —
   * it loads config + per-source sidecar state, pulls NOTHING from Notion. Nothing
   * declared yet → `unknown` (never `broken`): an un-set-up mirror is not a failure.
   */
  async healthCheck(): Promise<HealthReport> {
    let configs: LocalMirrorConfig[];
    try {
      configs = await this.deps.configStore.loadAll();
    } catch (error) {
      return unknownReport('config', `config unreadable: ${errorMessage(error)}`);
    }
    if (configs.length === 0) {
      return unknownReport('config', 'no local mirror configured');
    }

    const checks: HealthCheckEntry[] = [
      { name: 'config', status: 'ok', detail: `${configs.length} mirror(s) declared` },
    ];

    // Store reachability: every declared source's sidecar state must be loadable. A
    // null state (never synced) is fine; only a THROW means the store is unreachable.
    try {
      await Promise.all(configs.map((c) => this.deps.stateStore.load(c.name)));
      checks.push({ name: 'store', status: 'ok', detail: 'mirror state readable' });
    } catch (error) {
      checks.push({ name: 'store', status: 'broken', detail: `mirror store unreachable: ${errorMessage(error)}` });
    }

    return { status: aggregateHealth(checks), checks };
  }

  /** Finds a declared source by name, or throws a clear error for the caller to surface. */
  private async configOrThrow(name: string): Promise<LocalMirrorConfig> {
    const configs = await this.deps.configStore.loadAll();
    const config = configs.find((c) => c.name === name);
    if (!config) throw new Error(`Unknown local mirror "${name}"`);
    return config;
  }

  /**
   * De-register a source from the config — the versioned source of truth (PRD §9). With
   * `cleanup`, also delete every synced `.md` (from the state map) and the sidecar state;
   * cleanup is opt-in, so a plain de-register never touches the vault. Unknown source = no-op.
   */
  async removeSource(name: string, cleanup = false): Promise<RemoveResult> {
    const configs = await this.deps.configStore.loadAll();
    if (!configs.some((c) => c.name === name)) {
      return { name, removed: false, cleanedUp: false };
    }
    if (cleanup) {
      const persisted = await this.deps.stateStore.load(name);
      for (const item of Object.values(persisted?.items ?? {})) {
        await this.deps.vaultWriter.delete(item.vaultPath);
      }
      await this.deps.stateStore.delete(name);
    }
    await this.deps.configStore.remove(name);
    return { name, removed: true, cleanedUp: cleanup };
  }
}

/** A single-check `unknown` health report — the "couldn't determine" verdict (ADR 0030). */
function unknownReport(checkName: string, detail: string): HealthReport {
  return { status: 'unknown', checks: [{ name: checkName, status: 'unknown', detail }] };
}

/** Aggregate verdict: any broken → broken; else any unknown → unknown; else ok (ADR 0030). */
function aggregateHealth(checks: HealthCheckEntry[]): HealthReport['status'] {
  if (checks.some((c) => c.status === 'broken')) return 'broken';
  if (checks.some((c) => c.status === 'unknown')) return 'unknown';
  return 'ok';
}

/** A source that threw during the fan-out — reported failed, never aborting the batch. */
function failedReport(name: string): SyncReport {
  return { name, status: 'failed', written: 0, deleted: 0, unchanged: 0 };
}

/** Aggregate the per-source reports into the `sync("all")` summary (sums + worst-of status). */
function aggregateReports(sources: SyncReport[]): SyncReport {
  const sum = (pick: (r: SyncReport) => number) => sources.reduce((acc, r) => acc + pick(r), 0);
  return {
    name: 'all',
    status: aggregateStatus(sources),
    written: sum((r) => r.written),
    deleted: sum((r) => r.deleted),
    unchanged: sum((r) => r.unchanged),
    sources,
  };
}

/** `ok` iff every source is ok; `failed` iff every source failed; otherwise `partial`. */
function aggregateStatus(sources: SyncReport[]): SyncStatus {
  if (sources.length === 0) return 'ok';
  if (sources.every((r) => r.status === 'ok')) return 'ok';
  if (sources.every((r) => r.status === 'failed')) return 'failed';
  return 'partial';
}

/** The max `last_edited_time` over a perimeter (the watermark), or null if it is empty (PRD §16). */
function maxLastEditedTime(items: readonly { lastEditedTime: string }[]): string | null {
  let max: string | null = null;
  for (const item of items) {
    if (max === null || item.lastEditedTime > max) max = item.lastEditedTime;
  }
  return max;
}

/** Maps a declared config + its persisted state into the API-facing SourceState. */
export function toSourceState(
  config: LocalMirrorConfig,
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

/** The source's stable Notion root page id — from prior state, else extracted from the URL. */
function rootPageIdOf(config: LocalMirrorConfig, previous: PersistedState | null): string {
  return previous?.rootPageId ?? extractPageId(config.connector.config.root_page_url);
}

/** Assembles a declared config from the onboarding request — the token's env-var name only (§11). */
function configFromRequest(req: SetupRequest): LocalMirrorConfig {
  return {
    name: req.name,
    title: req.title,
    description: req.description,
    connector: {
      type: 'notion',
      config: { root_page_url: req.rootPageUrl, token_env: req.tokenEnv },
    },
    target_dir: `mirrors/${req.name}`,
  };
}

/** A readable message from a thrown value, never leaking a token (connectors name the env var). */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

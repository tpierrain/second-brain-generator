// Domain DTOs for local-mirror. The API port (ILocalMirror) speaks these
// transport-independent shapes; the MCP server merely serializes them. Several of these
// types are intentionally lean here and grow (with their own tests) in later steps.

export type ConnectorType = 'notion';

export interface NotionConnectorConfig {
  type: 'notion';
  config: {
    /** Root Notion page URL — local-mirror extracts the page id from it (PRD §2/§11). */
    root_page_url: string;
    /** Name of the env var holding the integration token — never the token itself (PRD §11). */
    token_env: string;
  };
}

/**
 * A declared local mirror — the versioned source of truth lives in the config file
 * (`local-mirror.config.json`), written by `setup_source` (PRD §2, §20.2).
 */
export interface LocalMirrorConfig {
  /** Short technical id = name of the subfolder under `mirrors/` (e.g. `team-a`). */
  name: string;
  /** Human label. */
  title: string;
  /** Natural-language topics covered — the harness routing key (PRD §2). */
  description: string;
  connector: NotionConnectorConfig;
  /** Dedicated vault subfolder (e.g. `mirrors/team-a`). */
  target_dir: string;
}

export type SyncStatus = 'ok' | 'partial' | 'failed' | 'never';

/**
 * A sync outcome adds `skipped` to the persisted statuses: another live process already holds
 * the source's single-flight lock, so this caller did nothing (no write, no state change). It is
 * transient — never persisted as a source's `lastSyncStatus` (auto-refresh study, S2 item 1).
 */
export type SyncOutcome = SyncStatus | 'skipped';

/** A declared source + its synced state — returned by `listSources()`/`status()`. */
export interface SourceState {
  name: string;
  title: string;
  connector: ConnectorType;
  /** Max(last_edited_time) at the last successful sync; null if never synced. */
  watermark: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  itemCount: number;
}

export type SourceStatus = SourceState;

/** Arguments of `setupSource` — onboarding a new source (PRD §13). */
export interface SetupRequest {
  name: string;
  title: string;
  description: string;
  rootPageUrl: string;
  tokenEnv: string;
}

export interface SetupResult {
  name: string;
  ok: boolean;
  message: string;
}

/** What a `sync` changed (PRD §9). */
export interface SyncReport {
  name: string;
  status: SyncOutcome;
  written: number;
  deleted: number;
  unchanged: number;
  /** Present only on the `sync("all")` aggregate: the per-source breakdown. */
  sources?: SyncReport[];
}

/** Light watermark-only freshness check, no content pulled (PRD §9). */
export interface FreshnessReport {
  name: string;
  behind: boolean;
  localWatermark: string | null;
  remoteWatermark: string | null;
}

export interface RemoveResult {
  name: string;
  removed: boolean;
  cleanedUp: boolean;
}

/** One named sub-check inside a module's standard health report (ADR 0030). */
export interface HealthCheckEntry {
  name: string;
  status: 'ok' | 'broken' | 'unknown';
  detail: string;
}

/**
 * The standard per-module health contract (ADR 0030): the CHECK belongs to the
 * module, the POLICY to the caller. `unknown` means "couldn't determine / nothing
 * configured" and NEVER triggers an alarm — only `broken` does. For this OPTIONAL
 * mirror, "no source declared yet" is `unknown`, never `broken`.
 */
export interface HealthReport {
  status: 'ok' | 'broken' | 'unknown';
  checks: HealthCheckEntry[];
}

// SPI ports (driven side) — everything external to the domain is stubbable (PRD §5).
// Concrete adapters land in later steps; the Builder fakes these in tests.

import type { LocalMirrorConfig } from './types.js';

/** One item enumerated from a source (e.g. a Notion page). */
export interface SourceItem {
  /** Stable source id — the `.md` is named after it, not the title (PRD §6). */
  id: string;
  title: string;
  /** Source URL — indispensable for the citation frontmatter (PRD §6). */
  url: string;
  /** Notion `last_edited_time` — feeds the watermark (PRD §6, §8). */
  lastEditedTime: string;
}

/** Driven port for a source type. MVP: NotionConnector (Drive/Slack later) — PRD §5. */
export interface ISourceConnector {
  /** Enumerate the full, scoped perimeter (scoped search + full pagination — PRD §12). */
  listItems(): Promise<SourceItem[]>;
  /** Produce the Markdown body of one item (e.g. via notion-to-md — PRD §6). */
  fetchContent(item: SourceItem): Promise<string>;
}

/** Driven port for vault writes — atomic write (temp + rename), delete (PRD §5, §6). */
export interface IVaultWriter {
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
}

/** One tracked item in the per-source private state (sidecar §10). */
export interface PersistedItem {
  title: string;
  vaultPath: string;
  lastEditedTime: string;
  /** sha256 of the PRODUCED markdown, not the raw source JSON (PRD §10). */
  contentHash: string;
  lastWrittenAt: string;
}

/** A local mirror's private state — sidecar `.local-mirror/<name>.state.json` (PRD §10). */
export interface PersistedState {
  schemaVersion: 1;
  name: string;
  connector: string;
  rootPageId: string;
  /** Max(last_edited_time) at the last SUCCESSFUL sync; null if never synced. */
  watermark: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'ok' | 'partial' | 'failed';
  /** The reconciliation map: pageId → tracked item (PRD §7, §10). */
  items: Record<string, PersistedItem>;
}

/** Driven port for the sidecar state (PRD §5, §10). */
export interface IStateStore {
  load(name: string): Promise<PersistedState | null>;
  save(name: string, state: PersistedState): Promise<void>;
  /** Drop a source's sidecar state — idempotent (PRD §9, `remove_source` cleanup). */
  delete(name: string): Promise<void>;
}

/**
 * Driven port for the declared local mirrors — the config file is the versioned
 * source of truth, read at startup and written by `setup_source` (PRD §20.2).
 */
export interface IConfigStore {
  loadAll(): Promise<LocalMirrorConfig[]>;
  upsert(config: LocalMirrorConfig): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Driven port for time — makes watermark/timestamping deterministic in tests (PRD §5). */
export interface IClock {
  now(): Date;
}

/**
 * Single-flight lock per source, ACROSS processes (two MCP windows on the same brain).
 * `acquire` returns false when another LIVE process holds the source's lock → the caller
 * must skip that source rather than racing on its `state.json` (auto-refresh study, S2 item 1).
 * A crashed holder (dead pid) or a stale lock is reclaimable.
 */
export interface ISyncLock {
  acquire(name: string): boolean;
  /** Release the source's lock — idempotent. */
  release(name: string): void;
}

/** Builds the right connector for a declared source (one token/scope per source). */
export type ConnectorFactory = (config: LocalMirrorConfig) => ISourceConnector;

// The real Notion gateway — the only place the @notionhq/client SDK and notion-to-md are
// wired. It implements the NotionGateway port the NotionConnector depends on, so all of the
// connector's logic stays unit-testable without it. Network robustness (429/401/truncation)
// is layered on in Step 5/§12. The integration token comes from the configured env var,
// never from the config file and never logged (PRD §11).

import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { ConnectorFactory, ISourceConnector } from '../domain/ports.js';
import type { LocalMirrorConfig } from '../domain/types.js';
import { NotionConnector } from './notion-connector.js';
import type { NotionGateway, NotionSearchResponse } from './notion-connector.js';
import { readEnvVarFresh } from '../lib/fresh-env.js';
import {
  childPageToMarkdown,
  linkToPageToMarkdown,
  makeChildDatabaseTransformer,
} from '../lib/notion-transformers.js';

/** A row as the child-database transformer consumes it (raw Notion page slice). */
export interface NotionDatabaseRow {
  id: string;
  properties: Record<string, { type: string }>;
}

/** The slice of the Notion SDK client the database-row query depends on (injected for tests). */
export interface NotionDbClient {
  databases: { retrieve(args: { database_id: string }): Promise<unknown> };
  dataSources: {
    query(args: {
      data_source_id: string;
      start_cursor?: string;
      page_size: number;
    }): Promise<unknown>;
  };
}

// B2 (R2-7a): resolve a `child_database` block id to its rows. Notion API 2025-09-03 split a
// database into data sources (the v5 SDK dropped `databases.query`): retrieve the database, then
// page through each data source. Falls back to querying the block id directly as a data source if
// the retrieve response carries no `data_sources` (older shapes). Errors bubble to the transformer,
// which degrades to a link rather than failing the page.
export async function queryNotionDatabaseRows(
  client: NotionDbClient,
  databaseId: string,
): Promise<NotionDatabaseRow[]> {
  const db = (await client.databases.retrieve({ database_id: databaseId })) as unknown as {
    data_sources?: { id: string }[];
  };
  const dataSourceIds = (db.data_sources ?? []).map((ds) => ds.id);
  const ids = dataSourceIds.length ? dataSourceIds : [databaseId];
  const rows: NotionDatabaseRow[] = [];
  for (const dataSourceId of ids) {
    let cursor: string | undefined;
    do {
      const res = (await client.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      })) as unknown as { results: NotionDatabaseRow[]; has_more: boolean; next_cursor: string | null };
      rows.push(...res.results);
      cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
    } while (cursor);
  }
  return rows;
}

/** The slice of notion-to-md the gateway drives — injected so the wiring is unit-testable. */
export interface Notion2Md {
  setCustomTransformer(type: string, transformer: (block: unknown) => Promise<string> | string): void;
  pageToMarkdown(pageId: string): Promise<unknown>;
  toMarkdownString(blocks: unknown): { parent?: string };
}
type Notion2MdInit = ConstructorParameters<typeof NotionToMarkdown>[0];
export type Notion2MdFactory = (init: Notion2MdInit) => Notion2Md;
const defaultNotion2Md: Notion2MdFactory = (init) => new NotionToMarkdown(init) as unknown as Notion2Md;

export class NotionSdkGateway implements NotionGateway {
  private readonly n2m: Notion2Md;

  constructor(
    private readonly client: Client,
    makeN2m: Notion2MdFactory = defaultNotion2Md,
  ) {
    // B1 (R2-5): `parseChildPages` must be on or notion-to-md drops `child_page` blocks before
    // any custom transformer runs (it skips them in the outer loop). With it on, our transformer
    // takes precedence and emits a clickable link instead of inlining the sub-page's content.
    this.n2m = makeN2m({ notionClient: client, config: { parseChildPages: true } });
    // B1: internal Notion navigation blocks render empty / with a literal "link_to_page" label by
    // default — emit clickable www.notion.so links so a mirrored hub keeps its sub-tree navigable.
    this.n2m.setCustomTransformer('child_page', (block) =>
      childPageToMarkdown(block as unknown as Parameters<typeof childPageToMarkdown>[0]),
    );
    this.n2m.setCustomTransformer('link_to_page', (block) =>
      linkToPageToMarkdown(block as unknown as Parameters<typeof linkToPageToMarkdown>[0]),
    );
    // B2 (R2-7a): notion-to-md renders only a database's title — its rows (the real content) were
    // lost, mirroring the page as an empty container. Query the database and render its rows.
    const childDatabase = makeChildDatabaseTransformer((databaseId) =>
      queryNotionDatabaseRows(client, databaseId),
    );
    this.n2m.setCustomTransformer('child_database', (block) =>
      childDatabase(block as unknown as Parameters<typeof childDatabase>[0]),
    );
  }

  async search(startCursor?: string): Promise<NotionSearchResponse> {
    const res = await this.client.search({
      filter: { property: 'object', value: 'page' },
      page_size: 100,
      start_cursor: startCursor,
    });
    return {
      results: res.results as unknown as NotionSearchResponse['results'],
      has_more: res.has_more,
      next_cursor: res.next_cursor,
    };
  }

  async pageToMarkdown(pageId: string): Promise<string> {
    const blocks = await this.n2m.pageToMarkdown(pageId);
    return this.n2m.toMarkdownString(blocks).parent ?? '';
  }
}

/** Wires a NotionConnector from a declared source, reading its token from the env. */
export function buildNotionConnector(config: LocalMirrorConfig): ISourceConnector {
  const tokenEnv = config.connector.config.token_env;
  // F3: prefer the FRESH `.env` value (a token pasted mid-session is invisible to the
  // boot-frozen process.env), falling back to process.env for environments with no `.env`
  // file (e.g. a real exported env var on the CLI).
  const token = readEnvVarFresh(tokenEnv) ?? process.env[tokenEnv];
  if (!token) {
    // Name the variable to set, never echo a token value (PRD §11).
    throw new Error(`Notion token missing: set the ${tokenEnv} environment variable (never commit it).`);
  }
  return new NotionConnector(new NotionSdkGateway(new Client({ auth: token })));
}

/** The ConnectorFactory the Domain Service is composed with (Step 8). */
export const notionConnectorFactory: ConnectorFactory = buildNotionConnector;

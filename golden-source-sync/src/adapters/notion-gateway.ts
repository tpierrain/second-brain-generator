// The real Notion gateway — the only place the @notionhq/client SDK and notion-to-md are
// wired. It implements the NotionGateway port the NotionConnector depends on, so all of the
// connector's logic stays unit-testable without it. Network robustness (429/401/truncation)
// is layered on in Step 5/§12. The integration token comes from the configured env var,
// never from the config file and never logged (PRD §11).

import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { ConnectorFactory, ISourceConnector } from '../domain/ports.js';
import type { GoldenSourceConfig } from '../domain/types.js';
import { NotionConnector } from './notion-connector.js';
import type { NotionGateway, NotionSearchResponse } from './notion-connector.js';
import { readEnvVarFresh } from '../lib/fresh-env.js';

class NotionSdkGateway implements NotionGateway {
  private readonly n2m: NotionToMarkdown;

  constructor(private readonly client: Client) {
    this.n2m = new NotionToMarkdown({ notionClient: client });
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
export function buildNotionConnector(config: GoldenSourceConfig): ISourceConnector {
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryNotionDatabaseRows,
  NotionSdkGateway,
  type NotionDbClient,
  type NotionDatabaseRow,
  type Notion2Md,
} from '../adapters/notion-gateway.js';
import type { Client } from '@notionhq/client';
import {
  childPageToMarkdown,
  linkToPageToMarkdown,
} from '../lib/notion-transformers.js';

// notion-gateway.ts is the real @notionhq/client adapter. Its seams are extracted and
// injected: queryNotionDatabaseRows takes a minimal NotionDbClient slice, and the gateway
// takes a notion-to-md factory — so pagination, the transformer wiring, search arg-mapping
// and the pageToMarkdown fallback are all unit-testable without the SDK. Mutation:
// 21 % → 97.44 %. The single residual survivor is a documented equivalent: the
// `new Client({ auth: token })` real-SDK construction in buildNotionConnector, observable
// only through a live network call → effective 38/38 = 100 % on non-equivalents.

/** A scripted NotionDbClient: records the calls it receives, replays canned responses. */
function fakeDbClient(opts: {
  retrieve: unknown;
  query: (args: { data_source_id: string; start_cursor?: string }) => unknown;
}) {
  const retrieveCalls: Array<{ database_id: string }> = [];
  const queryCalls: Array<{ data_source_id: string; start_cursor?: string; page_size: number }> = [];
  const client: NotionDbClient = {
    databases: {
      async retrieve(args) {
        retrieveCalls.push(args);
        return opts.retrieve;
      },
    },
    dataSources: {
      async query(args) {
        queryCalls.push(args);
        return opts.query(args);
      },
    },
  };
  return { client, retrieveCalls, queryCalls };
}

const row = (id: string): NotionDatabaseRow => ({ id, properties: {} });

test('queryNotionDatabaseRows pages through every data source and aggregates the rows', async () => {
  const { client, retrieveCalls, queryCalls } = fakeDbClient({
    retrieve: { data_sources: [{ id: 'ds1' }, { id: 'ds2' }] },
    query: ({ data_source_id, start_cursor }) => {
      if (data_source_id === 'ds1' && start_cursor === undefined) {
        return { results: [row('a')], has_more: true, next_cursor: 'cur1' };
      }
      if (data_source_id === 'ds1' && start_cursor === 'cur1') {
        return { results: [row('b')], has_more: false, next_cursor: null };
      }
      return { results: [row('c')], has_more: false, next_cursor: null };
    },
  });

  const rows = await queryNotionDatabaseRows(client, 'DB-1');

  assert.deepEqual(
    rows.map((r) => r.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(retrieveCalls, [{ database_id: 'DB-1' }]);
  // Cursor is threaded across pages; page_size is pinned to 100.
  assert.deepEqual(queryCalls, [
    { data_source_id: 'ds1', start_cursor: undefined, page_size: 100 },
    { data_source_id: 'ds1', start_cursor: 'cur1', page_size: 100 },
    { data_source_id: 'ds2', start_cursor: undefined, page_size: 100 },
  ]);
});

test('queryNotionDatabaseRows falls back to the block id when the db carries no data_sources', async () => {
  const { client, queryCalls } = fakeDbClient({
    retrieve: {}, // older shape: no data_sources
    query: () => ({ results: [row('x')], has_more: false, next_cursor: null }),
  });

  const rows = await queryNotionDatabaseRows(client, 'DB-2');

  assert.deepEqual(
    rows.map((r) => r.id),
    ['x'],
  );
  assert.deepEqual(queryCalls, [{ data_source_id: 'DB-2', start_cursor: undefined, page_size: 100 }]);
});

test('queryNotionDatabaseRows stops after one page when has_more is false', async () => {
  let queryCount = 0;
  const { client } = fakeDbClient({
    retrieve: { data_sources: [{ id: 'ds1' }] },
    query: () => {
      queryCount += 1;
      return { results: [row('only')], has_more: false, next_cursor: 'ignored-when-not-has_more' };
    },
  });

  const rows = await queryNotionDatabaseRows(client, 'DB-3');

  assert.equal(queryCount, 1);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['only'],
  );
});

// ── NotionSdkGateway wiring (notion-to-md injected via a recording factory) ───────────

/** A fake notion-to-md that records the transformers it is given and replays a scripted body. */
function fakeN2m(body: { blocks?: unknown; markdown?: { parent?: string } } = {}) {
  const transformers = new Map<string, (block: unknown) => Promise<string> | string>();
  const n2m: Notion2Md = {
    setCustomTransformer(type, transformer) {
      transformers.set(type, transformer);
    },
    async pageToMarkdown() {
      return body.blocks ?? [];
    },
    toMarkdownString() {
      return body.markdown ?? {};
    },
  };
  return { n2m, transformers };
}

test('the gateway turns parseChildPages ON and registers the 3 custom transformers', async () => {
  const { n2m, transformers } = fakeN2m();
  let init: { config: { parseChildPages: boolean } } | undefined;
  // A client that can answer the child_database transformer's row query.
  const client = {
    databases: { async retrieve() { return {}; } },
    dataSources: {
      async query() {
        return { results: [{ id: 'r1', properties: {} }], has_more: false, next_cursor: null };
      },
    },
  } as unknown as Client;

  new NotionSdkGateway(client, (opts) => {
    init = opts as unknown as { config: { parseChildPages: boolean } };
    return n2m;
  });

  assert.equal(init?.config.parseChildPages, true);
  assert.deepEqual([...transformers.keys()].sort(), ['child_database', 'child_page', 'link_to_page']);

  // Each wrapper delegates to the matching pure transformer (invoke and compare).
  const childPageBlock = { id: 'p1', child_page: { title: 'Design' } };
  assert.equal(
    await transformers.get('child_page')!(childPageBlock),
    childPageToMarkdown(childPageBlock as never),
  );
  const linkBlock = { id: 'l1', link_to_page: { type: 'page_id', page_id: 'l1' } };
  assert.equal(
    await transformers.get('link_to_page')!(linkBlock),
    linkToPageToMarkdown(linkBlock as never),
  );
  // child_database delegates to a fetcher wired to THIS client — a served row proves it.
  const dbBlock = { id: 'DB-9', child_database: { title: 'Roadmap' } };
  const rendered = await transformers.get('child_database')!(dbBlock);
  assert.match(rendered as string, /\*\*Roadmap\*\*/);
  assert.match(rendered as string, /r1/);
});

test('search scopes to pages, pins page_size, threads the cursor, and maps the response', async () => {
  const searchCalls: unknown[] = [];
  const client = {
    async search(args: unknown) {
      searchCalls.push(args);
      return { results: [{ id: 'page-1' }], has_more: true, next_cursor: 'next-1' };
    },
  } as unknown as Client;
  const { n2m } = fakeN2m();
  const gateway = new NotionSdkGateway(client, () => n2m);

  const res = await gateway.search('cursor-0');

  assert.deepEqual(searchCalls, [
    { filter: { property: 'object', value: 'page' }, page_size: 100, start_cursor: 'cursor-0' },
  ]);
  assert.deepEqual(res, {
    results: [{ id: 'page-1' }],
    has_more: true,
    next_cursor: 'next-1',
  });
});

test('pageToMarkdown returns the rendered parent body', async () => {
  const { n2m } = fakeN2m({ markdown: { parent: '# Body\n' } });
  const gateway = new NotionSdkGateway({} as unknown as Client, () => n2m);

  assert.equal(await gateway.pageToMarkdown('any'), '# Body\n');
});

test('pageToMarkdown falls back to an empty string when there is no parent body', async () => {
  const { n2m } = fakeN2m({ markdown: {} });
  const gateway = new NotionSdkGateway({} as unknown as Client, () => n2m);

  assert.equal(await gateway.pageToMarkdown('any'), '');
});

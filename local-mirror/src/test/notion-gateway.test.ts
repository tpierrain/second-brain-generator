import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryNotionDatabaseRows,
  type NotionDbClient,
  type NotionDatabaseRow,
} from '../adapters/notion-gateway.js';

// notion-gateway.ts is the real @notionhq/client adapter. The pure pagination logic
// (queryNotionDatabaseRows) is exported and injected with a minimal client slice so it is
// unit-testable without the SDK; the real Client/NotionToMarkdown construction stays an
// integration-only equivalent (documented in the header of the gateway wiring tests below).

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

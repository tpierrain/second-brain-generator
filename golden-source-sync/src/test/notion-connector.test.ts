import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotionConnector } from '../adapters/notion-connector.js';
import type {
  NotionGateway,
  NotionSearchPage,
  NotionSearchResponse,
} from '../adapters/notion-connector.js';

// Unit tests for the Notion SPI adapter, driven against a STUBBED Notion gateway (no live
// token, no network). The adapter enumerates the scoped perimeter through full pagination,
// maps each page to a SourceItem, and delegates content to notion-to-md. The robustness
// paths (429 backoff, 401 vs 0-pages, truncated pagination) land in Step 5/§12.

function aSearchPage(overrides: Partial<NotionSearchPage> = {}): NotionSearchPage {
  return {
    object: 'page',
    id: overrides.id ?? '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
    url: overrides.url ?? 'https://www.notion.so/inqom/abc',
    last_edited_time: overrides.last_edited_time ?? '2026-06-12T14:21:00.000Z',
    properties: overrides.properties ?? {
      Name: { type: 'title', title: [{ plain_text: 'Chaintrust error catalog' }] },
    },
  };
}

/** A fake gateway scripted with a list of search "pages" (one per pagination call). */
function aGatewayServing(...pagesPerCall: NotionSearchResponse[]): {
  gateway: NotionGateway;
  fetched: string[];
} {
  const fetched: string[] = [];
  let call = 0;
  const gateway: NotionGateway = {
    async search() {
      return pagesPerCall[call++] ?? { results: [], has_more: false, next_cursor: null };
    },
    async pageToMarkdown(pageId: string) {
      fetched.push(pageId);
      return `# Body of ${pageId}\n`;
    },
  };
  return { gateway, fetched };
}

test('listItems maps a search page to a SourceItem (id, title, url, lastEditedTime)', async () => {
  const { gateway } = aGatewayServing({
    results: [aSearchPage()],
    has_more: false,
    next_cursor: null,
  });
  const connector = new NotionConnector(gateway);

  const items = await connector.listItems();

  assert.deepEqual(items, [
    {
      id: '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
      title: 'Chaintrust error catalog',
      url: 'https://www.notion.so/inqom/abc',
      lastEditedTime: '2026-06-12T14:21:00.000Z',
    },
  ]);
});

test('listItems pages through the whole perimeter (follows the cursor)', async () => {
  const { gateway } = aGatewayServing(
    { results: [aSearchPage({ id: 'page-1' })], has_more: true, next_cursor: 'cursor-2' },
    { results: [aSearchPage({ id: 'page-2' })], has_more: false, next_cursor: null },
  );
  const connector = new NotionConnector(gateway);

  const items = await connector.listItems();

  assert.deepEqual(items.map((i) => i.id), ['page-1', 'page-2']);
});

test('listItems skips non-page results (a database container is not a note)', async () => {
  const { gateway } = aGatewayServing({
    results: [
      { ...aSearchPage({ id: 'db-1' }), object: 'database' },
      aSearchPage({ id: 'page-1' }),
    ],
    has_more: false,
    next_cursor: null,
  });
  const connector = new NotionConnector(gateway);

  const items = await connector.listItems();

  assert.deepEqual(items.map((i) => i.id), ['page-1']);
});

test('fetchContent delegates to notion-to-md for that page', async () => {
  const { gateway, fetched } = aGatewayServing();
  const connector = new NotionConnector(gateway);

  const body = await connector.fetchContent({
    id: 'page-9',
    title: 'X',
    url: 'u',
    lastEditedTime: 't',
  });

  assert.equal(body, '# Body of page-9\n');
  assert.deepEqual(fetched, ['page-9']);
});

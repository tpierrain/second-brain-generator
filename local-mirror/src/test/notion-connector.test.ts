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
// maps each page to a SourceItem, and delegates content to notion-to-md. Truncated pagination
// throws here (§12) so the §7 deletion guardrail freezes the source; 401-vs-0-pages and the
// "empty perimeter over a non-empty corpus" guard live at the domain level (reconcile tests).

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

// §12 guardrail: a truncated enumeration must NEVER pass for a complete perimeter, or the
// missing pages read as deletions and the corpus gets wiped. If Notion claims `has_more` but
// gives no cursor to continue, we cannot finish paging → throw rather than return a partial list.
test('listItems throws on a truncated response (has_more but no cursor) rather than under-reporting', async () => {
  const { gateway } = aGatewayServing(
    { results: [aSearchPage({ id: 'page-1' })], has_more: true, next_cursor: null },
  );
  const connector = new NotionConnector(gateway);

  await assert.rejects(() => connector.listItems(), /pagination/i);
});

// F6: Notion's API hands back `app.notion.com/p/<slug>-<id32>` share URLs that 404 in the
// browser, breaking the citation link. The connector canonicalizes the page URL to the stable
// `www.notion.so/<id32>` form so the frontmatter source_url is always clickable.
test('listItems canonicalizes a broken app.notion.com page URL to www.notion.so', async () => {
  const { gateway } = aGatewayServing({
    results: [
      aSearchPage({
        url: 'https://app.notion.com/p/Spec-304a2ca0b1c24d6e8f0a1b2c3d4e5f60',
      }),
    ],
    has_more: false,
    next_cursor: null,
  });
  const connector = new NotionConnector(gateway);

  const items = await connector.listItems();

  assert.equal(items[0].url, 'https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60');
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

// B1: notion-to-md embeds Notion's short-lived presigned attachment URLs, whose signing params
// rotate on every fetch. The connector canonicalizes them away so the body — and thus the content
// hash that gates the (re)write — is stable across syncs (no churn on an unchanged page).
test('fetchContent strips the rotating presigned-URL params from attachment links', async () => {
  const gateway: NotionGateway = {
    async search() {
      return { results: [], has_more: false, next_cursor: null };
    },
    async pageToMarkdown() {
      return '![pic](https://prod-files-secure.s3.amazonaws.com/k/pic.png?X-Amz-Signature=rotates)\n';
    },
  };
  const connector = new NotionConnector(gateway);

  const body = await connector.fetchContent({ id: 'p', title: 'X', url: 'u', lastEditedTime: 't' });

  assert.equal(body, '![pic](https://prod-files-secure.s3.amazonaws.com/k/pic.png)\n');
});

// F6: inline links to other Notion pages can also be broken app.notion.com/p share URLs.
// fetchContent canonicalizes them in the body too, so no app.notion.com/p ever lands in the vault.
test('fetchContent canonicalizes broken app.notion.com inline links in the body', async () => {
  const gateway: NotionGateway = {
    async search() {
      return { results: [], has_more: false, next_cursor: null };
    },
    async pageToMarkdown() {
      return 'See [Spec](https://app.notion.com/p/Spec-304a2ca0b1c24d6e8f0a1b2c3d4e5f60).\n';
    },
  };
  const connector = new NotionConnector(gateway);

  const body = await connector.fetchContent({ id: 'p', title: 'X', url: 'u', lastEditedTime: 't' });

  assert.equal(body, 'See [Spec](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60).\n');
  assert.ok(!body.includes('app.notion.com/p/'), 'no app.notion.com/p link must ever be emitted');
});

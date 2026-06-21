import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  childPageToMarkdown,
  linkToPageToMarkdown,
  makeChildDatabaseTransformer,
} from '../lib/notion-transformers.js';

// B1 (R2-5): notion-to-md renders a `child_page` block as EMPTY by default (unless
// parseChildPages is on, and even then only as a heading — never a link). A page that is
// just a hub of sub-pages was therefore mirrored with its navigation lost. The custom
// transformer emits a clickable `www.notion.so/<id>` link so the sub-tree stays navigable
// from the mirrored note. The block id IS the child page's id.

test('childPageToMarkdown emits a clickable www.notion.so link with the page title', () => {
  const block = {
    id: '0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
    child_page: { title: 'Sample error catalog' },
  };

  const md = childPageToMarkdown(block);

  assert.equal(
    md,
    '[Sample error catalog](https://www.notion.so/0123abc0b1c24d6e8f0a1b2c3d4e5f60)',
  );
});

test('childPageToMarkdown falls back to "Untitled" when the child page has no title', () => {
  const md = childPageToMarkdown({
    id: '0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
    child_page: { title: '' },
  });

  assert.equal(md, '[Untitled](https://www.notion.so/0123abc0b1c24d6e8f0a1b2c3d4e5f60)');
});

// B1 (R2-5): notion-to-md renders a `link_to_page` block with the literal label "link_to_page"
// (the block type leaks as the link text). The transformer keeps the clickable www.notion.so URL
// but gives it a readable label instead — no title fetch (decision A: simplest, cheap, deterministic).
test('linkToPageToMarkdown links a page_id with a readable label (not the literal "link_to_page")', () => {
  const md = linkToPageToMarkdown({
    link_to_page: { type: 'page_id', page_id: '0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60' },
  });

  assert.equal(md, '[Linked Notion page](https://www.notion.so/0123abc0b1c24d6e8f0a1b2c3d4e5f60)');
});

test('linkToPageToMarkdown labels a database_id target as a linked database', () => {
  const md = linkToPageToMarkdown({
    link_to_page: { type: 'database_id', database_id: '0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60' },
  });

  assert.equal(
    md,
    '[Linked Notion database](https://www.notion.so/0123abc0b1c24d6e8f0a1b2c3d4e5f60)',
  );
});

// B2 (R2-7a): a page whose body is a `child_database` was mirrored almost EMPTY — notion-to-md
// renders only the database title, never the rows, so the real content (the rows) was lost. The
// custom transformer queries the database (injected, so it stays unit-testable) and renders each
// row as a clickable bullet, so a database-backed page is no longer an empty container.
test('makeChildDatabaseTransformer renders each row as a clickable bullet under the database title', async () => {
  const queryDatabase = async (_databaseId: string) => [
    {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Sample' }] } },
    },
    {
      id: 'bbbbbbbb-1111-2222-3333-444444444444',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Nexcer' }] } },
    },
  ];
  const transform = makeChildDatabaseTransformer(queryDatabase);

  const md = await transform({
    id: 'dddddddd-1111-2222-3333-444444444444',
    child_database: { title: 'Partner accounts' },
  });

  assert.equal(
    md,
    '**Partner accounts**\n\n' +
      '- [Sample](https://www.notion.so/aaaaaaaa111122223333444444444444)\n' +
      '- [Nexcer](https://www.notion.so/bbbbbbbb111122223333444444444444)\n',
  );
});

// A title-only row would still be near-empty: the QA case needs the KEY properties (e.g. a SIRET,
// a status) so the row carries real content. Non-title, non-empty properties are rendered inline
// after the linked title; empty ones are dropped.
test('makeChildDatabaseTransformer renders key properties of a row after its linked title', async () => {
  const queryDatabase = async () => [
    {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Sample' }] },
        SIRET: { type: 'rich_text', rich_text: [{ plain_text: '853 200 000 00012' }] },
        Status: { type: 'select', select: { name: 'Active' } },
        Notes: { type: 'rich_text', rich_text: [] },
      },
    },
  ];
  const transform = makeChildDatabaseTransformer(queryDatabase);

  const md = await transform({ id: 'dddddddd-1111-2222-3333-444444444444', child_database: { title: 'FE directory' } });

  assert.equal(
    md,
    '**FE directory**\n\n' +
      '- [Sample](https://www.notion.so/aaaaaaaa111122223333444444444444)' +
      ' — SIRET: 853 200 000 00012 · Status: Active\n',
  );
});

test('makeChildDatabaseTransformer renders just the title for a database with no rows', async () => {
  const transform = makeChildDatabaseTransformer(async () => []);

  const md = await transform({ id: 'dddddddd-1111-2222-3333-444444444444', child_database: { title: 'Empty DB' } });

  assert.equal(md, '**Empty DB**\n');
});

// A nested database the token cannot query (403/429/network) must not crash the whole page
// conversion (which would freeze the item in a partial sync). Degrade to a clickable link to the
// database instead — honest and non-empty — rather than throwing.
test('makeChildDatabaseTransformer falls back to a link when the database query fails', async () => {
  const transform = makeChildDatabaseTransformer(async () => {
    throw new Error('notionhq: API token is invalid');
  });

  const md = await transform({ id: 'dddddddd-1111-2222-3333-444444444444', child_database: { title: 'Locked DB' } });

  assert.equal(
    md,
    '**Locked DB**\n\n[Open this database in Notion](https://www.notion.so/dddddddd111122223333444444444444)\n',
  );
});

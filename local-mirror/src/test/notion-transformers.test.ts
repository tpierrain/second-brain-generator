import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  childPageToMarkdown,
  linkToPageToMarkdown,
  makeChildDatabaseTransformer,
  notionPageUrl,
  rowTitle,
  propertyToText,
  rowFields,
} from '../lib/notion-transformers.js';

// Mutation score 94.87 % — the 6 residual survivors are all documented equivalents:
//   • the three `?? []` fallbacks (titleProp.title / rich_text / multi_select) mutated to a
//     one-element sentinel array: its element is a bare string, so `.map(t => t.plain_text)` /
//     `.map(o => o.name)` yields `[undefined]` which `.join('')`s back to '' — identical to [];
//   • the `rowFields` `.filter(prop.type !== 'title')` (whole filter removed, or `!== 'title'`
//     forced true / `!== ''`): a title property's propertyToText is '' anyway, so it is dropped by
//     the downstream `value !== ''` filter regardless — the title filter is a defensive-but-
//     functionally-redundant guard. Effective 111/111 = 100 % on non-equivalent mutants.

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

test('linkToPageToMarkdown falls back to an empty id (bare www.notion.so) when neither id is present', () => {
  const md = linkToPageToMarkdown({ link_to_page: { type: 'page_id' } });
  assert.equal(md, '[Linked Notion page](https://www.notion.so/)');
});

test('linkToPageToMarkdown prefers page_id over database_id when both are present', () => {
  const md = linkToPageToMarkdown({
    link_to_page: { type: 'page_id', page_id: 'pppppppp-0000-0000-0000-000000000000', database_id: 'dddddddd-0000-0000-0000-000000000000' },
  });
  assert.equal(md, '[Linked Notion page](https://www.notion.so/pppppppp000000000000000000000000)');
});

// ── notionPageUrl: strips ALL dashes to the canonical 32-char form ────────────
test('notionPageUrl strips every dash from a dashed id', () => {
  assert.equal(
    notionPageUrl('0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60'),
    'https://www.notion.so/0123abc0b1c24d6e8f0a1b2c3d4e5f60',
  );
});

test('notionPageUrl leaves an already-bare id untouched', () => {
  assert.equal(notionPageUrl('abc123'), 'https://www.notion.so/abc123');
});

// ── rowTitle: the single title-typed property, joined across rich-text runs ───
test('rowTitle joins the plain_text runs of the title-typed property', () => {
  const title = rowTitle({
    id: 'x',
    properties: {
      Status: { type: 'select', select: { name: 'Active' } },
      Name: { type: 'title', title: [{ plain_text: 'Hello ' }, { plain_text: 'World' }] },
    },
  });
  assert.equal(title, 'Hello World');
});

test('rowTitle falls back to "Untitled" when there is no title property', () => {
  assert.equal(rowTitle({ id: 'x', properties: { N: { type: 'rich_text', rich_text: [] } } }), 'Untitled');
});

test('rowTitle falls back to "Untitled" when the title property is empty', () => {
  assert.equal(rowTitle({ id: 'x', properties: { Name: { type: 'title', title: [] } } }), 'Untitled');
});

// ── propertyToText: one assertion per supported property type (+ empties) ─────
test('propertyToText — rich_text joins its runs', () => {
  assert.equal(propertyToText({ type: 'rich_text', rich_text: [{ plain_text: 'a' }, { plain_text: 'b' }] }), 'ab');
});

test('propertyToText — rich_text with no runs is empty', () => {
  assert.equal(propertyToText({ type: 'rich_text', rich_text: [] }), '');
  assert.equal(propertyToText({ type: 'rich_text' }), '');
});

test('propertyToText — select uses the option name, empty when unset', () => {
  assert.equal(propertyToText({ type: 'select', select: { name: 'Active' } }), 'Active');
  assert.equal(propertyToText({ type: 'select', select: null }), '');
});

test('propertyToText — status uses the status name, empty when unset', () => {
  assert.equal(propertyToText({ type: 'status', status: { name: 'In progress' } }), 'In progress');
  assert.equal(propertyToText({ type: 'status', status: null }), '');
});

test('propertyToText — multi_select joins option names with ", "', () => {
  assert.equal(
    propertyToText({ type: 'multi_select', multi_select: [{ name: 'x' }, { name: 'y' }] }),
    'x, y',
  );
  assert.equal(propertyToText({ type: 'multi_select' }), '');
});

test('propertyToText — number renders as a string, incl. 0, but empty when null', () => {
  assert.equal(propertyToText({ type: 'number', number: 42 }), '42');
  assert.equal(propertyToText({ type: 'number', number: 0 }), '0');
  assert.equal(propertyToText({ type: 'number', number: null }), '');
  assert.equal(propertyToText({ type: 'number' }), '');
});

test('propertyToText — date shows start, and start→end when there is an end', () => {
  assert.equal(propertyToText({ type: 'date', date: { start: '2026-07-15' } }), '2026-07-15');
  assert.equal(
    propertyToText({ type: 'date', date: { start: '2026-07-15', end: '2026-07-20' } }),
    '2026-07-15→2026-07-20',
  );
  assert.equal(propertyToText({ type: 'date', date: { start: '2026-07-15', end: null } }), '2026-07-15');
  assert.equal(propertyToText({ type: 'date', date: null }), '');
});

test('propertyToText — url / email / phone_number pass through, empty when null', () => {
  assert.equal(propertyToText({ type: 'url', url: 'https://x.dev' }), 'https://x.dev');
  assert.equal(propertyToText({ type: 'url', url: null }), '');
  assert.equal(propertyToText({ type: 'email', email: 'a@b.io' }), 'a@b.io');
  assert.equal(propertyToText({ type: 'email', email: null }), '');
  assert.equal(propertyToText({ type: 'phone_number', phone_number: '+33 6' }), '+33 6');
  assert.equal(propertyToText({ type: 'phone_number', phone_number: null }), '');
});

test('propertyToText — an unsupported type is empty', () => {
  assert.equal(propertyToText({ type: 'files' }), '');
  assert.equal(propertyToText({ type: 'formula' }), '');
});

// ── rowFields: drops title + empties, renders `key: value` joined by ` · ` ────
test('rowFields renders non-title non-empty props as "key: value" joined by " · "', () => {
  const fields = rowFields({
    id: 'x',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Ignored' }] },
      SIRET: { type: 'rich_text', rich_text: [{ plain_text: '123' }] },
      Empty: { type: 'rich_text', rich_text: [] },
      Status: { type: 'select', select: { name: 'Active' } },
    },
  });
  assert.equal(fields, 'SIRET: 123 · Status: Active');
});

test('rowFields is empty when the row has only its title', () => {
  assert.equal(
    rowFields({ id: 'x', properties: { Name: { type: 'title', title: [{ plain_text: 'Solo' }] } } }),
    '',
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childPageToMarkdown, linkToPageToMarkdown } from '../lib/notion-transformers.js';

// B1 (R2-5): notion-to-md renders a `child_page` block as EMPTY by default (unless
// parseChildPages is on, and even then only as a heading — never a link). A page that is
// just a hub of sub-pages was therefore mirrored with its navigation lost. The custom
// transformer emits a clickable `www.notion.so/<id>` link so the sub-tree stays navigable
// from the mirrored note. The block id IS the child page's id.

test('childPageToMarkdown emits a clickable www.notion.so link with the page title', () => {
  const block = {
    id: '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
    child_page: { title: 'Chaintrust error catalog' },
  };

  const md = childPageToMarkdown(block);

  assert.equal(
    md,
    '[Chaintrust error catalog](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60)',
  );
});

test('childPageToMarkdown falls back to "Untitled" when the child page has no title', () => {
  const md = childPageToMarkdown({
    id: '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60',
    child_page: { title: '' },
  });

  assert.equal(md, '[Untitled](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60)');
});

// B1 (R2-5): notion-to-md renders a `link_to_page` block with the literal label "link_to_page"
// (the block type leaks as the link text). The transformer keeps the clickable www.notion.so URL
// but gives it a readable label instead — no title fetch (decision A: simplest, cheap, deterministic).
test('linkToPageToMarkdown links a page_id with a readable label (not the literal "link_to_page")', () => {
  const md = linkToPageToMarkdown({
    link_to_page: { type: 'page_id', page_id: '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60' },
  });

  assert.equal(md, '[Linked Notion page](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60)');
});

test('linkToPageToMarkdown labels a database_id target as a linked database', () => {
  const md = linkToPageToMarkdown({
    link_to_page: { type: 'database_id', database_id: '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60' },
  });

  assert.equal(
    md,
    '[Linked Notion database](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60)',
  );
});

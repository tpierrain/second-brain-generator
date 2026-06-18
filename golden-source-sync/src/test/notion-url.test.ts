import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPageId,
  canonicalizeNotionUrl,
  canonicalizeNotionUrlsInMarkdown,
} from '../lib/notion-url.js';

// Leaf lib (classic TDD). The user pastes a Notion ROOT PAGE URL; golden-source-sync
// extracts the page id from it (PRD §11.4). Notion ids are 32 hex chars; the canonical
// form is the dashed UUID (8-4-4-4-12) the API and notion-to-md accept.
test('extracts the dashed page id from a slugged Notion URL', () => {
  const id = extractPageId('https://www.notion.so/inqom/HUB-304a2ca0b1c24d6e8f0a1b2c3d4e5f60');

  assert.equal(id, '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60');
});

test('strips query parameters', () => {
  const id = extractPageId('https://www.notion.so/Page-304a2ca0b1c24d6e8f0a1b2c3d4e5f60?pvs=4');

  assert.equal(id, '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60');
});

test('accepts an already-dashed id and leaves it canonical', () => {
  const id = extractPageId('304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60');

  assert.equal(id, '304a2ca0-b1c2-4d6e-8f0a-1b2c3d4e5f60');
});

test('throws when no page id can be found', () => {
  assert.throws(() => extractPageId('https://www.notion.so/inqom/no-id-here'));
});

// F6: the Notion API returns share URLs of the form `app.notion.com/p/<slug>-<id32>` that
// 404 in the browser ("Oops, error loading this page"), breaking both inline links and
// citations. Canonicalize them to the stable `www.notion.so/<id32>` form that always opens.
test('canonicalizes an app.notion.com/p share URL to www.notion.so/<id32>', () => {
  const url = canonicalizeNotionUrl(
    'https://app.notion.com/p/Some-Page-304a2ca0b1c24d6e8f0a1b2c3d4e5f60',
  );

  assert.equal(url, 'https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60');
});

test('leaves an already-stable www.notion.so URL untouched', () => {
  const url = 'https://www.notion.so/inqom/HUB-304a2ca0b1c24d6e8f0a1b2c3d4e5f60';

  assert.equal(canonicalizeNotionUrl(url), url);
});

test('leaves a non-Notion URL untouched', () => {
  const url = 'https://example.com/page?ref=42';

  assert.equal(canonicalizeNotionUrl(url), url);
});

test('returns an un-parseable app.notion.com link verbatim (never throws)', () => {
  const url = 'https://app.notion.com/no-id-here';

  assert.equal(canonicalizeNotionUrl(url), url);
});

// B1 (R2-5): a Notion PAGE MENTION in rich text is rendered by notion-to-md with the page's
// relative href `/<id32>` (the API hands mentions a relative path, not an absolute URL), so the
// inline link `[Title](/<id32>)` is dead outside Notion. Absolutize it to the clickable
// www.notion.so form. (child_page / link_to_page BLOCKS are handled by custom transformers;
// mentions are inline rich text, not hookable — they must be fixed on the assembled body.)
test('absolutizes a relative Notion page-mention link `/<id32>` to www.notion.so', () => {
  const md = 'Owned by [@Squad PA-SC](/304a2ca0b1c24d6e8f0a1b2c3d4e5f60) this quarter.\n';

  assert.equal(
    canonicalizeNotionUrlsInMarkdown(md),
    'Owned by [@Squad PA-SC](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60) this quarter.\n',
  );
});

test('rewrites broken app.notion.com inline links in the body, preserving stable ones', () => {
  const md =
    'See [Spec](https://app.notion.com/p/Spec-304a2ca0b1c24d6e8f0a1b2c3d4e5f60) ' +
    'and [Hub](https://www.notion.so/Hub-aaaa2ca0b1c24d6e8f0a1b2c3d4e5f60).\n';

  assert.equal(
    canonicalizeNotionUrlsInMarkdown(md),
    'See [Spec](https://www.notion.so/304a2ca0b1c24d6e8f0a1b2c3d4e5f60) ' +
      'and [Hub](https://www.notion.so/Hub-aaaa2ca0b1c24d6e8f0a1b2c3d4e5f60).\n',
  );
});

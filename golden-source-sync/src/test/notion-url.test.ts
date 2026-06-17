import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPageId } from '../lib/notion-url.js';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalMirrorMarkdown } from '../lib/markdown.js';
import { aLocalMirror, aNotionLocalMirror, aNotionPage } from './builder.js';

// Acceptance test at the API port (ILocalMirror), driven by the Builder with a
// stubbed connector and an in-memory vault. A sync turns each enumerated page into one
// Markdown file under mirrors/<name>/<pageId>.md, carrying the mandatory
// citation frontmatter (PRD §6). State/delta/deletion are out of scope here (Steps 3/5).
test('syncing a source writes one local-mirror .md per page, with mandatory frontmatter', async () => {
  const page = aNotionPage({
    id: 'abc123',
    title: 'Sample error catalog',
    url: 'https://www.notion.so/acme/abc123',
    lastEditedTime: '2026-06-12T14:21:00.000Z',
    content: '# Sample error catalog\n\nWhen the API returns 402…\n',
  });
  const harness = aLocalMirror().withNotionPages(page);
  const gss = harness.build();

  const report = await gss.sync('team-a');

  assert.equal(report.written, 1);
  const file = harness.vaultFiles().get('mirrors/team-a/abc123.md');
  assert.ok(file, 'expected a .md written at mirrors/team-a/abc123.md');
  const { data, content } = parseLocalMirrorMarkdown(file);
  assert.equal(data.source_url, 'https://www.notion.so/acme/abc123');
  assert.equal(data.last_edited_time, '2026-06-12T14:21:00.000Z');
  assert.equal(data.mirror, 'team-a');
  assert.equal(data.source_id, 'abc123');
  assert.equal(data.title, 'Sample error catalog');
  assert.match(content, /When the API returns 402/);
});

// Universe-awareness (ADR 0034): a mirror scoped to a universe lands its notes under the
// universe root, mirroring how `/import --universe` files + stamps notes so retrieval scope
// travels with the file. A rootless mirror (no universe, or the default) is unchanged.
test('a universe-scoped mirror writes under <universe>/mirrors/<name>/ and stamps universe', async () => {
  const page = aNotionPage({ id: 'abc123', content: 'Scoped body.\n' });
  const harness = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror({ universe: 'acme' }))
    .withNotionPages(page);
  const gss = harness.build();

  const report = await gss.sync('team-a');

  assert.equal(report.written, 1);
  const file = harness.vaultFiles().get('acme/mirrors/team-a/abc123.md');
  assert.ok(file, 'expected the note under the universe-prefixed path');
  assert.equal(harness.vaultFiles().has('mirrors/team-a/abc123.md'), false, 'never at the bare root');
  const { data } = parseLocalMirrorMarkdown(file);
  assert.equal(data.universe, 'acme');
  // Stamped LAST (stamp-universe.mjs's append-last convention): after the citation keys.
  assert.ok(file.indexOf('universe:') > file.indexOf('last_edited_time:'), 'universe stamped last');
});

test('a rootless mirror (no universe) writes at the bare root and stamps no universe key', async () => {
  const page = aNotionPage({ id: 'abc123', content: 'Rootless body.\n' });
  const harness = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror()) // no universe declared
    .withNotionPages(page);
  const gss = harness.build();

  await gss.sync('team-a');

  const file = harness.vaultFiles().get('mirrors/team-a/abc123.md');
  assert.ok(file, 'a rootless mirror keeps the historical root path');
  const { data } = parseLocalMirrorMarkdown(file);
  assert.equal('universe' in data, false, 'no universe key on a rootless mirror');
});

test('syncing a source writes one .md per enumerated page', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1', content: 'First.\n' }),
    aNotionPage({ id: 'page-2', content: 'Second.\n' }),
  );
  const gss = harness.build();

  const report = await gss.sync('team-a');

  assert.equal(report.written, 2);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-2.md'));
});

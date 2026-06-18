import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVolatileUrlParams } from '../lib/strip-volatile-urls.js';

// Leaf lib (classic TDD). Notion serves images/files behind SHORT-LIVED PRESIGNED URLs whose
// signing query params (AWS SigV4 `X-Amz-*`, or notion.so `signature`/`expirationTimestamp`)
// ROTATE on every fetch. notion-to-md embeds them verbatim, so the produced markdown — and thus
// its content hash — changed at every sync even when nothing upstream did (B1 churn). Stripping
// the volatile params before hashing/writing yields a STABLE canonical URL (the S3 object key is
// itself stable) so a no-change page rewrites/reindexes nothing.
test('strips the rotating AWS SigV4 params from a Notion S3 presigned image URL', () => {
  const a = stripVolatileUrlParams(
    '![pic](https://prod-files-secure.s3.us-west-2.amazonaws.com/space/uuid/pic.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260618T000000Z&X-Amz-Signature=aaaa)\n',
  );

  assert.equal(a, '![pic](https://prod-files-secure.s3.us-west-2.amazonaws.com/space/uuid/pic.png)\n');
});

// The B1 regression: a page with an attachment used to churn because Notion re-signs the URL on
// every fetch. Two fetches differing ONLY in the rotating signature must canonicalize identically,
// so the content hash is stable and the page is reported unchanged.
test('two fetches differing only in the rotating signature canonicalize identically (B1)', () => {
  const fetchN = (sig: string) =>
    `# Page\n\n![pic](https://prod-files-secure.s3.amazonaws.com/k/pic.png?X-Amz-Date=${sig}&X-Amz-Signature=${sig})\n`;

  assert.equal(stripVolatileUrlParams(fetchN('first')), stripVolatileUrlParams(fetchN('second')));
});

test('leaves ordinary links and their legitimate query params untouched', () => {
  const md = 'See [the docs](https://example.com/page?utm_source=brain&ref=42) and plain text.\n';

  assert.equal(stripVolatileUrlParams(md), md);
});

test('strips notion.so signing params while preserving the stable ones (table/id/spaceId)', () => {
  const a = stripVolatileUrlParams(
    '[report.pdf](https://file.notion.so/f/f/uuid/file.pdf?table=block&id=abc&spaceId=xyz&expirationTimestamp=1750000000000&signature=zzzz&downloadName=report.pdf)\n',
  );

  assert.equal(
    a,
    '[report.pdf](https://file.notion.so/f/f/uuid/file.pdf?table=block&id=abc&spaceId=xyz&downloadName=report.pdf)\n',
  );
});

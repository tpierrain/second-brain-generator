// Strips the SHORT-LIVED signing query params from the attachment URLs notion-to-md embeds
// (AWS SigV4 presigned S3 links, and notion.so file links). These params rotate on every fetch,
// so leaving them in made the produced markdown — and its content hash — churn at every sync even
// when nothing changed (B1). Removing them yields a STABLE canonical URL (the object path is
// stable; only the signature rotated), so a no-change page rewrites and reindexes nothing.

/** Markdown link/image targets live inside `](...)`; presigned URLs never contain a literal `)`. */
const LINK_TARGET = /\]\(([^)]+)\)/g;

export function stripVolatileUrlParams(markdown: string): string {
  return markdown.replace(LINK_TARGET, (whole, url: string) => {
    const stripped = stripVolatile(url);
    return stripped === url ? whole : `](${stripped})`;
  });
}

function stripVolatile(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const params = url.slice(qIndex + 1).split('&');
  const kept = params.filter((pair) => !isVolatile(pair.split('=')[0]));
  if (kept.length === params.length) return url;
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

// The rotating signing params: AWS SigV4 (`X-Amz-*`, S3 presigned) and notion.so's own
// (`signature` + `expirationTimestamp`). Everything else — the object path and stable params
// like table/id/spaceId/downloadName — identifies the asset and is preserved verbatim.
const VOLATILE_EXACT = new Set(['signature', 'expirationtimestamp']);

function isVolatile(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith('x-amz-') || VOLATILE_EXACT.has(lower);
}

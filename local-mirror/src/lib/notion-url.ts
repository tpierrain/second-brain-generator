// URL → Notion page id. The user pastes a root page URL (or a bare id); we extract the
// 32 hex chars and return the canonical dashed UUID the Notion API and notion-to-md accept
// (PRD §11.4). The id is always the FINAL 32-hex run of the slug, so anchoring at the end
// is robust to a title prefix that happens to contain hex characters.

// F6: Notion's API hands back share URLs of the form `app.notion.com/p/<slug>-<id32>` that
// 404 in the browser, breaking inline links and citations. Rewrite those to the stable
// `www.notion.so/<id32>` form. Everything else — already-stable `www.notion.so` links and any
// non-Notion URL — is left untouched, and an un-parseable Notion link is returned verbatim
// rather than throwing (URL rewriting must never crash a sync).
export function canonicalizeNotionUrl(url: string): string {
  // A Notion page mention is rendered with a RELATIVE href `/<id32>` (optionally dashed) — dead
  // outside Notion. Absolutize it to the stable clickable form. Match the whole target so a real
  // root-relative site path (e.g. `/docs/page`) is left untouched.
  const relative = url.match(/^\/([0-9a-fA-F]{32}|[0-9a-fA-F-]{36})$/);
  if (relative) return `https://www.notion.so/${relative[1].replace(/-/g, '')}`;
  if (!/^https?:\/\/app\.notion\.com\//i.test(url)) return url;
  try {
    const id = extractPageId(url).replace(/-/g, '');
    return `https://www.notion.so/${id}`;
  } catch {
    return url;
  }
}

// Markdown link/image targets live inside `](...)`. Rewrite every Notion target through
// canonicalizeNotionUrl so broken `app.notion.com/p/` links in the body become clickable too.
const LINK_TARGET = /\]\(([^)]+)\)/g;

export function canonicalizeNotionUrlsInMarkdown(markdown: string): string {
  return markdown.replace(LINK_TARGET, (whole, url: string) => {
    const canonical = canonicalizeNotionUrl(url);
    return canonical === url ? whole : `](${canonical})`;
  });
}

export function extractPageId(urlOrId: string): string {
  const path = urlOrId.split(/[?#]/)[0];
  const hex = path.replace(/-/g, '').match(/[0-9a-fA-F]{32}$/)?.[0];
  if (!hex) {
    throw new Error(`Cannot extract a Notion page id from: ${urlOrId}`);
  }
  const id = hex.toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

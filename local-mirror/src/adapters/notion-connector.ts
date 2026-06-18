// ISourceConnector for Notion (read-only). It enumerates the scoped perimeter — the token
// is connected to the root page, so Notion's `search` returns only the accessible sub-tree
// (PRD §11) — paging through completely (PRD §12), and converts each page's body via
// notion-to-md (PRD §6). The actual Notion SDK lives behind the injected NotionGateway, so
// the adapter is unit-testable without a live token. Truncated pagination throws (§12, below)
// so the §7 guardrail can freeze the source; 429 backoff/jitter is layered on the real gateway.

import type { ISourceConnector, SourceItem } from '../domain/ports.js';
import { stripVolatileUrlParams } from '../lib/strip-volatile-urls.js';
import { canonicalizeNotionUrl, canonicalizeNotionUrlsInMarkdown } from '../lib/notion-url.js';

/** A page as returned by Notion's `search` — the slice this adapter reads. */
export interface NotionSearchPage {
  object: string;
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
}

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
}

export interface NotionSearchResponse {
  results: NotionSearchPage[];
  has_more: boolean;
  next_cursor: string | null;
}

/** The slice of the Notion world the connector depends on (injected for testability). */
export interface NotionGateway {
  /** One `search` call (paginated by the caller via the returned cursor). */
  search(startCursor?: string): Promise<NotionSearchResponse>;
  /** The page body, already converted to Markdown (notion-to-md). */
  pageToMarkdown(pageId: string): Promise<string>;
}

export class NotionConnector implements ISourceConnector {
  constructor(private readonly gateway: NotionGateway) {}

  async listItems(): Promise<SourceItem[]> {
    const items: SourceItem[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.gateway.search(cursor);
      for (const result of page.results) {
        if (result.object === 'page') items.push(toSourceItem(result));
      }
      // §12: Notion promises a `next_cursor` whenever `has_more` is true. If it claims more but
      // gives no cursor, we cannot complete the enumeration — surfacing a truncated perimeter
      // would read as deletions (PRD §7). Fail loudly so the §7 guardrail freezes the source.
      if (page.has_more && !page.next_cursor) {
        throw new Error('Notion pagination truncated: has_more is set but no next_cursor was returned.');
      }
      cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
    } while (cursor);
    return items;
  }

  // B1: Notion re-signs attachment URLs on every fetch, so notion-to-md's output churned even on
  // unchanged pages. Canonicalize the rotating signing params away before the body reaches the
  // content hash / vault writer — the asset path stays a stable identifier.
  async fetchContent(item: SourceItem): Promise<string> {
    const body = await this.gateway.pageToMarkdown(item.id);
    // B1: strip rotating presigned-URL params (stable hash). F6: rewrite broken
    // app.notion.com/p inline links to the clickable www.notion.so form.
    return canonicalizeNotionUrlsInMarkdown(stripVolatileUrlParams(body));
  }
}

function toSourceItem(page: NotionSearchPage): SourceItem {
  return {
    id: page.id,
    title: titleOf(page),
    // F6: rewrite app.notion.com/p share URLs (which 404 in the browser) to the stable
    // www.notion.so form, so the citation source_url is always clickable.
    url: canonicalizeNotionUrl(page.url),
    lastEditedTime: page.last_edited_time,
  };
}

/** Notion keeps the title in the (single) property of type `title`. */
function titleOf(page: NotionSearchPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
  const text = (titleProp?.title ?? []).map((t) => t.plain_text).join('');
  return text || 'Untitled';
}

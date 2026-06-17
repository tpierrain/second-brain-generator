// ISourceConnector for Notion (read-only). It enumerates the scoped perimeter — the token
// is connected to the root page, so Notion's `search` returns only the accessible sub-tree
// (PRD §11) — paging through completely (PRD §12), and converts each page's body via
// notion-to-md (PRD §6). The actual Notion SDK lives behind the injected NotionGateway, so
// the adapter is unit-testable without a live token. Robustness (429/401/truncation) = Step 5.

import type { ISourceConnector, SourceItem } from '../domain/ports.js';

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
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);
    return items;
  }

  fetchContent(item: SourceItem): Promise<string> {
    return this.gateway.pageToMarkdown(item.id);
  }
}

function toSourceItem(page: NotionSearchPage): SourceItem {
  return {
    id: page.id,
    title: titleOf(page),
    url: page.url,
    lastEditedTime: page.last_edited_time,
  };
}

/** Notion keeps the title in the (single) property of type `title`. */
function titleOf(page: NotionSearchPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
  const text = (titleProp?.title ?? []).map((t) => t.plain_text).join('');
  return text || 'Untitled';
}

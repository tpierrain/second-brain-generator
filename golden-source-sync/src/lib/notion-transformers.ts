// B1 (R2-5): custom notion-to-md transformers that turn Notion's navigation blocks into
// clickable Markdown links, so a mirrored hub page keeps its links to its sub-tree instead of
// rendering them empty (`child_page`) or with a literal "link_to_page" label. Pure functions of
// the block, unit-tested here and wired into the real NotionSdkGateway via setCustomTransformer.
// Links use the stable `www.notion.so/<id32>` form (same canonical shape as the F6 citation URL).

/** A Notion page id (dashed or bare) → the stable clickable `www.notion.so/<id32>` URL. */
function notionPageUrl(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`;
}

interface ChildPageBlock {
  id: string;
  child_page: { title: string };
}

/** `child_page` block → a clickable link to that sub-page (default renders it empty). */
export function childPageToMarkdown(block: ChildPageBlock): string {
  const title = block.child_page.title || 'Untitled';
  return `[${title}](${notionPageUrl(block.id)})`;
}

interface LinkToPageBlock {
  link_to_page: { type: string; page_id?: string; database_id?: string };
}

/**
 * `link_to_page` block → a clickable link with a readable label (default leaks the literal
 * "link_to_page" as the link text). No title fetch: the URL is the stable identity.
 */
export function linkToPageToMarkdown(block: LinkToPageBlock): string {
  const isDatabase = block.link_to_page.type === 'database_id';
  const id = block.link_to_page.page_id ?? block.link_to_page.database_id ?? '';
  const label = isDatabase ? 'Linked Notion database' : 'Linked Notion page';
  return `[${label}](${notionPageUrl(id)})`;
}

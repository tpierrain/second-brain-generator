// URL → Notion page id. The user pastes a root page URL (or a bare id); we extract the
// 32 hex chars and return the canonical dashed UUID the Notion API and notion-to-md accept
// (PRD §11.4). The id is always the FINAL 32-hex run of the slug, so anchoring at the end
// is robust to a title prefix that happens to contain hex characters.

export function extractPageId(urlOrId: string): string {
  const path = urlOrId.split(/[?#]/)[0];
  const hex = path.replace(/-/g, '').match(/[0-9a-fA-F]{32}$/)?.[0];
  if (!hex) {
    throw new Error(`Cannot extract a Notion page id from: ${urlOrId}`);
  }
  const id = hex.toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

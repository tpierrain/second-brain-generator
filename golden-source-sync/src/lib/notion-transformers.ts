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

interface NotionPropertyValue {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  status?: { name: string } | null;
  multi_select?: { name: string }[];
  number?: number | null;
  date?: { start: string; end?: string | null } | null;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

interface DatabaseRow {
  id: string;
  properties: Record<string, NotionPropertyValue>;
}

interface ChildDatabaseBlock {
  id: string;
  child_database: { title: string };
}

/** The (single) `title`-typed property holds a row's name in a Notion database. */
function rowTitle(row: DatabaseRow): string {
  const titleProp = Object.values(row.properties).find((p) => p.type === 'title');
  const text = (titleProp?.title ?? []).map((t) => t.plain_text).join('');
  return text || 'Untitled';
}

/** A single Notion property → a readable scalar string ('' when empty / unsupported). */
function propertyToText(prop: NotionPropertyValue): string {
  switch (prop.type) {
    case 'rich_text':
      return (prop.rich_text ?? []).map((t) => t.plain_text).join('');
    case 'select':
      return prop.select?.name ?? '';
    case 'status':
      return prop.status?.name ?? '';
    case 'multi_select':
      return (prop.multi_select ?? []).map((o) => o.name).join(', ');
    case 'number':
      return prop.number == null ? '' : String(prop.number);
    case 'date':
      return prop.date?.start ? prop.date.start + (prop.date.end ? `→${prop.date.end}` : '') : '';
    case 'url':
      return prop.url ?? '';
    case 'email':
      return prop.email ?? '';
    case 'phone_number':
      return prop.phone_number ?? '';
    default:
      return '';
  }
}

/** Non-title, non-empty properties of a row, rendered as `key: value` and joined by ` · `. */
function rowFields(row: DatabaseRow): string {
  return Object.entries(row.properties)
    .filter(([, prop]) => prop.type !== 'title')
    .map(([key, prop]) => [key, propertyToText(prop)] as const)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

/**
 * B2 (R2-7a): `child_database` block → its rows. notion-to-md renders only the database title by
 * default, so a database-backed page was mirrored as an empty container. The database query is
 * injected (the real one resolves the data source and pages through the rows), keeping this unit
 * pure and testable. Each row becomes a clickable bullet to its Notion page.
 */
export function makeChildDatabaseTransformer(
  queryDatabase: (databaseId: string) => Promise<DatabaseRow[]>,
): (block: ChildDatabaseBlock) => Promise<string> {
  return async (block) => {
    let rows: DatabaseRow[];
    try {
      rows = await queryDatabase(block.id);
    } catch {
      // A nested database we can't read must not fail the whole page — link to it instead.
      return `**${block.child_database.title}**\n\n[Open this database in Notion](${notionPageUrl(block.id)})\n`;
    }
    const bullets = rows
      .map((row) => {
        const fields = rowFields(row);
        const link = `[${rowTitle(row)}](${notionPageUrl(row.id)})`;
        return fields ? `- ${link} — ${fields}` : `- ${link}`;
      })
      .join('\n');
    if (!bullets) return `**${block.child_database.title}**\n`;
    return `**${block.child_database.title}**\n\n${bullets}\n`;
  };
}

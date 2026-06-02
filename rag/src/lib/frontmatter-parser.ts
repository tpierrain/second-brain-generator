import matter from "gray-matter";

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  content: string;
  type: string;
  tags: string[];
  title: string;
}

const TYPE_BY_PREFIX: [string, string][] = [
  ["daily/", "daily"],
  ["people/", "person"],
  ["topics/", "topic"],
  ["decisions/", "decision"],
  ["meetings/", "meeting"],
  ["prep-1-1/", "prep-1-1"],
  ["prep-day/", "prep-day"],
  ["backlog/", "backlog"],
  ["coaching/", "coaching"],
  ["initiatives/", "initiative"],
  ["raw-sources/", "raw-source"],
  ["briefings/", "briefing"],
  ["domains/", "domain"],
  ["drafts/", "draft"],
  ["articles/", "article"],
];

function detectType(relativePath: string, fm: Record<string, unknown>): string {
  if (typeof fm.type === "string") return fm.type;
  for (const [prefix, type] of TYPE_BY_PREFIX) {
    if (relativePath.startsWith(prefix)) return type;
  }
  return "other";
}

function extractTitle(content: string, relativePath: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const filename = relativePath.split("/").pop() ?? relativePath;
  return filename.replace(/\.md$/, "");
}

export function parseDocument(raw: string, relativePath: string): ParsedDocument {
  const { data: frontmatter, content } = matter(raw);
  const type = detectType(relativePath, frontmatter);
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : [];
  const title = extractTitle(content, relativePath);
  return { frontmatter, content, type, tags, title };
}

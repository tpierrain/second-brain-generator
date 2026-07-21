// Markdown assembly — the thin contract local-mirror writes into the vault (PRD §6):
// the produced body plus mandatory citation frontmatter. This is *what local-mirror
// writes*, not a RAG requirement. Frontmatter via gray-matter (js-yaml under the hood).

import matter from 'gray-matter';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { SourceItem } from '../domain/ports.js';

// gray-matter 4.x defaults to js-yaml 3's `safeLoad`/`safeDump`, both removed in
// js-yaml 4. We force the patched js-yaml >=4.2.0 (GHSA-h67p-54hq-rp68 DoS, all
// <=4.1.1 vulnerable, no patched 3.x) and route gray-matter's YAML through js-yaml
// 4's `load`/`dump` — safe by default. `stringify` (write) is the production path;
// `parse` (read) backs the round-trip assertions in tests.
const YAML_ENGINE = {
  engines: {
    yaml: {
      parse: (input: string) => yamlLoad(input) as object,
      stringify: (obj: object) => yamlDump(obj),
    },
  },
} as const;

/** The frontmatter stamped on every produced note (PRD §6). */
export interface LocalMirrorFrontmatter {
  mirror: string;
  source_id: string;
  title: string;
  /** Source URL — indispensable for the citation (without it, no clickable link). */
  source_url: string;
  /** Notion last_edited_time — feeds the watermark. */
  last_edited_time: string;
  /** Retrieval universe (ADR 0034), stamped LAST and only when the mirror is universe-scoped. */
  universe?: string;
}

/**
 * Assemble one note: produced body + mandatory citation frontmatter (PRD §6). When `universe`
 * is truthy it is stamped LAST (matching `stamp-universe.mjs`'s append-last convention, so the
 * mirror's frontmatter reads like an imported note's).
 */
export function toLocalMirrorMarkdown(
  mirror: string,
  item: SourceItem,
  body: string,
  universe?: string,
): string {
  const frontmatter: LocalMirrorFrontmatter = {
    mirror: mirror,
    source_id: item.id,
    title: item.title,
    source_url: item.url,
    last_edited_time: item.lastEditedTime,
  };
  if (universe) frontmatter.universe = universe;
  return matter.stringify(body, frontmatter, YAML_ENGINE);
}

/** Read back a local-mirror note (frontmatter + body) using the same js-yaml-4 engine. */
export function parseLocalMirrorMarkdown(raw: string): { data: Record<string, unknown>; content: string } {
  const { data, content } = matter(raw, YAML_ENGINE);
  return { data, content };
}

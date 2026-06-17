// Content hash over the PRODUCED markdown (not the raw Notion JSON) — the delta key that
// keeps a no-change sync from rewriting/reindexing (PRD §10). Self-describing `sha256:`
// prefix, exactly as persisted in the state sidecar.

import { createHash } from 'node:crypto';

export function contentHash(markdown: string): string {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

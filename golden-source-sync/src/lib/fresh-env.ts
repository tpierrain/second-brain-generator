// Fresh `.env` reader (F3). The MCP server is long-lived: dotenv loads `.env` once at boot,
// freezing it into process.env. A token pasted into `.env` DURING the session was therefore
// invisible until a restart. This seam re-parses the `.env` file at call-time — without
// mutating process.env — so a freshly-added secret is picked up with no restart. The value is
// returned to the caller only; it is never logged or persisted (PRD §11).

import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
import { resolveEnvPath } from './config.js';

/** Reads one var FRESH from the `.env` file. Returns undefined if the file or key is absent. */
export function readEnvVarFresh(name: string): string | undefined {
  const path = resolveEnvPath();
  if (!existsSync(path)) return undefined;
  const parsed = parse(readFileSync(path));
  const value = parsed[name];
  return value && value.trim() ? value : undefined;
}

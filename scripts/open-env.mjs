// ─────────────────────────────────────────────────────────────────────────────
// open-env.mjs — thin CLI the golden-source skill calls to give the user ONE path
// to their token: ensure a single `<VAR>=` placeholder line in `.env` (idempotent,
// deduped) then pop the editor on it. No chat paste-block, no model self-repair
// (R2-2 / R2-3). Run FROM the brain folder:
//
//   node scripts/open-env.mjs NOTION_TOKEN_PASC
//
// Best-effort, NEVER fatal: a missing GUI editor (headless / SBG_NO_OPEN_ENV) just
// means the user opens `.env` by hand — we still print its path. All real logic is
// in the tested seams scripts/lib/env-placeholder.mjs + scripts/lib/open-env.mjs.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

import { ensureEnvPlaceholder } from "./lib/env-placeholder.mjs";
import { openEnvInEditor } from "./lib/open-env.mjs";

const varName = process.argv[2];
if (!varName) {
  process.stderr.write("usage: node scripts/open-env.mjs <ENV_VAR_NAME>\n");
  process.exit(1);
}

// `.env` lives at the brain root: SBG_ENV_PATH wins, else <cwd>/.env.
const envPath = process.env.SBG_ENV_PATH?.trim()
  ? resolve(process.env.SBG_ENV_PATH)
  : join(process.cwd(), ".env");

const before = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const after = ensureEnvPlaceholder(before, varName);
if (after !== before) writeFileSync(envPath, after);

const { opened } = openEnvInEditor(envPath, {
  platform: process.platform,
  env: process.env,
  spawn,
});

process.stdout.write(`${opened ? "opened" : "ready"} ${envPath}\n`);
process.exit(0);

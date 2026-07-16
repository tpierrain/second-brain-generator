// Harness B — integration worker (REAL Notion, real adapters, real lock).
//
// One "window": builds the SAME Domain Service the MCP server boots (buildApi from the freshly
// built dist), rooted at the throwaway QA brain via env-var path overrides, then loops the exact
// per-tick logic of the auto-sync scheduler — checkFreshness → sync if behind — OR, when
// LM_FORCE_SYNC=1, syncs unconditionally to force concurrent sync pressure and lock contention.
// Every action is emitted as one JSONL line on stdout (pid, cycle, behind, sync status). It never
// prints page CONTENT (confidential): only names, counts and statuses.
//
// Paths come from the env the orchestrator sets: LOCAL_MIRROR_CONFIG / LOCAL_MIRROR_SIDECAR_DIR /
// VAULT_DIR / SBG_ENV_PATH (the brain's .env, holding NOTION_TOKEN_PERSONAL_HOME).
import { buildApi } from '../../../local-mirror/dist/server.js';

const name = process.env.LM_SOURCE ?? 'personal-home';
const durationMs = Number(process.env.LM_DURATION_MS ?? 120000);
const intervalMs = Number(process.env.LM_INTERVAL_MS ?? 1000);
const forceSync = process.env.LM_FORCE_SYNC === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = buildApi();

// Time-bounded (not cycle-bounded): all windows share one wall-clock window, so the lock holder
// runs several full syncs while the losers keep attempting (and skipping) throughout — real, even
// concurrency instead of the skippers finishing early and leaving the holder alone.
const deadline = Date.now() + durationMs;
let cycle = 0;
while (Date.now() < deadline) {
  const startedAt = new Date().toISOString();
  try {
    const freshness = await api.checkFreshness(name);
    let sync = null;
    if (forceSync || freshness.behind) sync = await api.sync(name);
    process.stdout.write(
      JSON.stringify({ pid: process.pid, cycle, startedAt, behind: freshness.behind, sync }) + '\n',
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ pid: process.pid, cycle, startedAt, error: error instanceof Error ? error.message : String(error) }) + '\n',
    );
  }
  cycle += 1;
  await sleep(intervalMs);
}

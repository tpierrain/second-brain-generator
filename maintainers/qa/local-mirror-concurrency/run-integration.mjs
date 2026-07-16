// Harness B — orchestrator (REAL Notion, deterministic binary verdict, ADR 0009 rung 2).
//
// Spawns N real node processes (N "windows") that concurrently sync the SAME throwaway QA brain's
// `personal-home` mirror against REAL Notion, while this orchestrator samples the shared state.json
// at high frequency. It asserts the cross-window integrity invariants that the single-flight lock +
// atomic state writes must guarantee:
//   1. state.json is ALWAYS valid JSON (never observed torn — atomic temp+rename).
//   2. the watermark is MONOTONIC across the whole run (never regresses — no lost update).
//   3. state ↔ vault coherence at the end: every tracked item's .md exists and its content hash
//      matches the state (no torn vault write under concurrent writers).
//   4. no worker crashes (every worker exits 0).
//
// Confidential: never prints page content — only names, hashes, counts, statuses.
// exit 0 → all invariants held. exit 1 → an invariant was violated (relay, do not pretend).
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const BRAIN = process.env.LM_BRAIN ?? `${process.env.HOME}/lm-qa-autorefresh`;
const SOURCE = process.env.LM_SOURCE ?? 'personal-home';
const WORKERS = Number(process.env.LM_WORKERS ?? 3);
const DURATION_MS = Number(process.env.LM_DURATION_MS ?? 120000);
const INTERVAL_MS = Number(process.env.LM_INTERVAL_MS ?? 1000);
const SAMPLE_MS = Number(process.env.LM_SAMPLE_MS ?? 80);

const statePath = join(BRAIN, '.local-mirror', `${SOURCE}.state.json`);
const vaultDir = join(BRAIN, 'vault');

const workerEnv = {
  ...process.env,
  LOCAL_MIRROR_CONFIG: join(BRAIN, 'local-mirror.config.json'),
  LOCAL_MIRROR_SIDECAR_DIR: join(BRAIN, '.local-mirror'),
  VAULT_DIR: vaultDir,
  SBG_ENV_PATH: join(BRAIN, '.env'),
  LM_SOURCE: SOURCE,
  LM_DURATION_MS: String(DURATION_MS),
  LM_INTERVAL_MS: String(INTERVAL_MS),
  LM_FORCE_SYNC: process.env.LM_FORCE_SYNC ?? '1',
};

function contentHash(markdown) {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

function readState() {
  const raw = readFileSync(statePath, 'utf-8'); // may throw ENOENT during a rename window (tolerated)
  return JSON.parse(raw); // a THROW here = torn/invalid JSON = invariant #1 violation
}

// --- high-frequency state.json sampler (invariants #1 and #2) ---
const violations = [];
let samples = 0;
let tornReads = 0;
let lastWatermark = null; // ISO string or null
let maxWatermark = null;

function ms(iso) {
  return iso ? new Date(iso).getTime() : -1; // null watermark sorts below any real timestamp
}

function sample() {
  if (!existsSync(statePath)) return;
  let state;
  try {
    state = readState();
  } catch (err) {
    // A rename-window ENOENT is benign; a JSON parse error is a TORN file = invariant #1 violation.
    if (err && err.code === 'ENOENT') return;
    tornReads += 1;
    violations.push(`torn/invalid state.json observed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  samples += 1;
  const wm = state.watermark ?? null;
  if (lastWatermark !== null && ms(wm) < ms(lastWatermark)) {
    violations.push(`watermark REGRESSED: ${lastWatermark} → ${wm}`);
  }
  lastWatermark = wm;
  if (ms(wm) > ms(maxWatermark)) maxWatermark = wm;
}

function runWorker(i) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, 'integration-worker.mjs')], {
      env: workerEnv,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = [];
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) lines.push(line);
      }
    });
    child.on('close', (code) => resolve({ i, code, lines }));
  });
}

console.error(`[integration] ${WORKERS} windows for ${DURATION_MS}ms @ ${INTERVAL_MS}ms on ${BRAIN} (force_sync=${workerEnv.LM_FORCE_SYNC})`);

const timer = setInterval(sample, SAMPLE_MS);
const results = await Promise.all(Array.from({ length: WORKERS }, (_, i) => runWorker(i)));
clearInterval(timer);
sample(); // final sample

// --- invariant #4: no worker crashed ---
const crashed = results.filter((r) => r.code !== 0);
if (crashed.length) violations.push(`${crashed.length} worker(s) exited non-zero: ${crashed.map((c) => c.code).join(',')}`);

// tally per-worker actions (from JSONL) — surfaces skips (lock working) vs errors
let syncOk = 0, syncPartial = 0, syncSkipped = 0, syncFailed = 0, workerErrors = 0;
for (const r of results) {
  for (const line of r.lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.error) { workerErrors += 1; continue; }
    if (!rec.sync) continue;
    if (rec.sync.status === 'ok') syncOk += 1;
    else if (rec.sync.status === 'partial') syncPartial += 1;
    else if (rec.sync.status === 'skipped') syncSkipped += 1;
    else if (rec.sync.status === 'failed') syncFailed += 1;
  }
}

// --- invariant #3: state ↔ vault coherence (final) ---
let itemsChecked = 0;
try {
  const finalState = readState();
  for (const [id, item] of Object.entries(finalState.items ?? {})) {
    const p = join(vaultDir, item.vaultPath);
    if (!existsSync(p)) { violations.push(`vault file MISSING for ${id}: ${item.vaultPath}`); continue; }
    const got = contentHash(readFileSync(p, 'utf-8'));
    if (got !== item.contentHash) violations.push(`vault/state hash MISMATCH for ${id}: state=${item.contentHash} file=${got}`);
    itemsChecked += 1;
  }
} catch (err) {
  violations.push(`final state.json unreadable: ${err instanceof Error ? err.message : String(err)}`);
}

console.error(`[integration] samples=${samples} tornReads=${tornReads} finalWatermark=${lastWatermark} maxWatermark=${maxWatermark}`);
console.error(`[integration] syncs: ok=${syncOk} partial=${syncPartial} skipped(lock)=${syncSkipped} failed=${syncFailed} workerErrors=${workerErrors}`);
console.error(`[integration] state↔vault items checked=${itemsChecked}`);

if (violations.length) {
  console.error(`❌ INTEGRITY VIOLATION(S) (${violations.length}):`);
  for (const v of violations) console.error(`   - ${v}`);
  process.exitCode = 1;
} else {
  console.error(`✅ All cross-window invariants held: valid state.json throughout, monotonic watermark, state↔vault coherent, no crash. Lock serialized ${syncSkipped} concurrent attempts.`);
  process.exitCode = 0;
}

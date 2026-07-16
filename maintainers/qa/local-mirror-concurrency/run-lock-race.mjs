// Harness A — orchestrator (offline, deterministic verdict à la verify-rag.mjs, ADR 0009 rung 2).
//
// Spawns N real node processes that hammer the REAL FsSyncLock on a shared temp sidecar dir,
// then sums the mutual-exclusion violations they observed. This is the sharp proof/kill for the
// Step 4c-iii TOCTOU: BEFORE the O_EXCL fix we expect races > 0 (the read→write window lets two
// processes both acquire); AFTER, races MUST be 0. Offline and confidential-free by construction.
//
// exit 0 → no race observed (mutual exclusion held). exit 1 → race reproduced (needs the fix).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const WORKERS = Number(process.env.LOCK_RACE_WORKERS ?? 3);
const CYCLES = Number(process.env.LOCK_RACE_CYCLES ?? 40000);
const SPIN = Number(process.env.LOCK_RACE_SPIN ?? 150);
const NAME = 'personal-home';

const sidecar = mkdtempSync(join(tmpdir(), 'lm-lockrace-'));

function runWorker() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(here, 'lock-race-worker.mjs'), sidecar, NAME, String(CYCLES), String(SPIN)],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`worker exited ${code}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch (e) {
        reject(new Error(`bad worker output: ${out}`));
      }
    });
  });
}

console.error(`[lock-race] ${WORKERS} processes × ${CYCLES} cycles on ${sidecar}`);
try {
  const results = await Promise.all(Array.from({ length: WORKERS }, runWorker));
  const totalAcquired = results.reduce((s, r) => s + r.acquired, 0);
  const totalRaces = results.reduce((s, r) => s + r.races, 0);
  for (const r of results) console.error(`  pid ${r.pid}: acquired=${r.acquired} races=${r.races}`);
  console.error(`[lock-race] total acquired=${totalAcquired} races=${totalRaces}`);
  if (totalRaces > 0) {
    console.error(`❌ TOCTOU REPRODUCED — ${totalRaces} mutual-exclusion violations across ${WORKERS} processes.`);
    process.exitCode = 1;
  } else {
    console.error(`✅ No mutual-exclusion violation over ${totalAcquired} acquisitions — lock holds across processes.`);
    process.exitCode = 0;
  }
} finally {
  rmSync(sidecar, { recursive: true, force: true });
}

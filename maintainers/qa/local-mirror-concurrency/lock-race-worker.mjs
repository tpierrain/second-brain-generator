// Harness A — lock-race worker (offline, no Notion).
//
// Hammers the REAL FsSyncLock.acquire()/release() in a hot loop to surface the
// cross-process TOCTOU (Step 4c-iii finding): read → check → write is not atomic,
// so two OS processes can both "acquire" the same source. Detection is direct: after
// acquire() returns true we own the lockfile, so it MUST still carry our pid; if a
// concurrent process clobbered it while we believed we held it, mutual exclusion was
// lost — that is the race. We report the count over stdout as one JSON line.
//
// Usage: node lock-race-worker.mjs <sidecarDir> <name> <cycles> <holdSpinIters>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FsSyncLock } from '../../../local-mirror/dist/adapters/fs-sync-lock.js';

const [, , sidecarDir, name, cyclesArg, spinArg] = process.argv;
const cycles = Number(cyclesArg ?? 20000);
const spinIters = Number(spinArg ?? 200);

const lock = new FsSyncLock({ sidecarDir });
const lockPath = join(sidecarDir, `${name}.sync.lock`);

let acquired = 0;
let races = 0;

for (let i = 0; i < cycles; i++) {
  if (!lock.acquire(name)) continue;
  acquired += 1;
  // Critical section: we believe we hold the lock exclusively. Spin briefly to widen the
  // overlap window, then verify the lockfile still names us. Anyone else clobbering it here
  // means they too passed acquire() at the same instant → mutual exclusion was violated.
  let sink = 0;
  for (let s = 0; s < spinIters; s++) sink += s;
  try {
    const rec = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (rec.pid !== process.pid) races += 1;
  } catch {
    // File vanished mid-CS (another holder released it) — also a mutual-exclusion violation.
    races += 1;
  }
  if (sink === -1) console.error('unreachable'); // keep the spin from being optimized away
  lock.release(name);
}

process.stdout.write(JSON.stringify({ pid: process.pid, acquired, races }) + '\n');

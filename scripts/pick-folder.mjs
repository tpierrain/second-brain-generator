// ─────────────────────────────────────────────────────────────────────────────
// pick-folder.mjs — thin CLI wrapper around the folder-picker seam. Pops the OS
// native folder dialog and prints the chosen ABSOLUTE path to stdout (exit 0), or
// exits NON-ZERO when the user cancels or there is no GUI (headless / CI / guard).
//
//   node scripts/pick-folder.mjs ["prompt text"]
//
// Used by the `import` skill so non-dev users don't copy-paste the path of their
// old brain. Separate from import-brain.mjs so the skill picks ONCE and reuses the
// path for both the plan and --apply (no double dialog). All logic lives in the
// tested seam scripts/lib/folder-picker.mjs (ADR 0009/0016).
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";

import { pickFolder } from "./lib/folder-picker.mjs";

const prompt = process.argv[2] || "Choose the folder of your previous brain";
const picked = pickFolder({ platform: process.platform, env: process.env, prompt, spawnSync });

if (picked) {
  process.stdout.write(picked + "\n");
  process.exit(0);
}
process.exit(1);

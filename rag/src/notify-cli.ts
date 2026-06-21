// ═══════════════════════════════════════════════════════════════════════════
// notify-cli.ts — fire ONE best-effort OS notification from the command line,
// reusing the already-tested notifyDone (notify.ts). Spawned by health-probe-run.mjs
// when a capability becomes NEWLY broken (ADR 0028, F7). Keeping the platform command
// strings in the single notify.ts (DRY) instead of re-deriving them in the .mjs child.
// Glue — notifyDone is unit-tested; this only forwards argv + the real spawn.
//
//   npx tsx rag/src/notify-cli.ts "<title>" "<body>"
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "child_process";
import { notifyDone } from "./lib/notify.js";

const [title, body] = process.argv.slice(2);
notifyDone({
  platform: process.platform,
  env: process.env,
  title: title ?? "Second brain",
  body: body ?? "",
  spawn: spawn as never,
});

// ─────────────────────────────────────────────────────────────────────────────
// auto-finalize.mjs — Layer A of ADR 0026. At the END of update-engine, after the
// new engine files are on disk, re-exec the FRESHLY-WRITTEN reconciler in a fresh
// `node` child process. A new process reads the just-written reconcile-brain.mjs +
// manifest from disk → escapes this process's in-memory module cache → runs the
// *just-installed* converge logic, collapsing the 2-cycle into a single invocation.
//
// Anti-loop (critical): the child runs RECONCILE ONLY — it never re-fetches and never
// re-finalizes (reconcile-brain's CLI entry has no auto-finalize step), so there is no
// recursion. It is given the same `sourceDir` the parent fetched (still on disk), so it
// converges from the same files without any network.
//
// `spawnChild` is injected (default execFileSync) so the wiring is unit-testable
// without spawning a real process. FAIL-SOFT: auto-finalize is a best-effort finisher
// on top of an already-successful update — if the child errors, we log loudly and
// return its failure, never throwing past update-engine's own success.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the reconciler script that lives NEXT TO this module in the brain, by path —
// so the child loads the on-disk (possibly just-updated) file, not a cached import.
const reconcilerPath = () => join(dirname(fileURLToPath(import.meta.url)), "reconcile-brain.mjs");

export async function defaultFinalizeReconcile({
  brainDir,
  sourceDir,
  spawnChild = (file, args) => execFileSync(file, args, { stdio: "inherit" }),
}) {
  const args = [reconcilerPath(), "--brainDir", brainDir, "--sourceDir", sourceDir];
  spawnChild(process.execPath, args);
}

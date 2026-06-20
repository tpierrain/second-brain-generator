import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultFinalizeReconcile } from "./auto-finalize.mjs";

// defaultFinalizeReconcile re-execs the reconciler in a FRESH node process (ADR 0026,
// Layer A). The spawn is injectable so we can assert the child command-line without
// spawning a real process.
test("defaultFinalizeReconcile — spawns node on the on-disk reconciler with --brainDir/--sourceDir", async () => {
  const spawned = [];
  await defaultFinalizeReconcile({
    brainDir: "/brains/acme",
    sourceDir: "/tmp/clone-xyz",
    spawnChild: (file, args) => spawned.push({ file, args }),
  });

  assert.equal(spawned.length, 1, "must spawn exactly one child process");
  const { file, args } = spawned[0];
  // A real, fresh `node` (not this process reused) → escapes the module cache.
  assert.equal(file, process.execPath);
  // It runs reconcile-brain.mjs (resolved next to auto-finalize.mjs, by path).
  assert.match(args[0], /reconcile-brain\.mjs$/);
  // …handed the brain + the fetched source as flags the CLI entry parses.
  assert.deepEqual(args.slice(1), ["--brainDir", "/brains/acme", "--sourceDir", "/tmp/clone-xyz"]);
});

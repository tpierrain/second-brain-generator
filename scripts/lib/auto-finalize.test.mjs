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

// #1 (code-review): auto-finalize runs on top of an ALREADY-successful, already-recorded
// update — a child failure must FAIL SOFT (its docstring: "never throwing past
// update-engine's own success"). A throwing spawn must be swallowed into a structured
// { finalized: false, error } result, NOT re-thrown, so update-engine never reports a
// successful update as a failure.
test("defaultFinalizeReconcile — a throwing child fails soft (returns { finalized:false }, never throws)", async () => {
  const result = await defaultFinalizeReconcile({
    brainDir: "/brains/acme",
    sourceDir: "/tmp/clone-xyz",
    spawnChild: () => {
      throw new Error("npm install failed in the fresh child");
    },
  });
  assert.equal(result.finalized, false);
  assert.match(result.error, /npm install failed/);
});

test("defaultFinalizeReconcile — a clean child reports { finalized: true }", async () => {
  const result = await defaultFinalizeReconcile({
    brainDir: "/brains/acme",
    sourceDir: "/tmp/clone-xyz",
    spawnChild: () => {},
  });
  assert.deepEqual(result, { finalized: true });
});

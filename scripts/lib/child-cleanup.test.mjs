import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTreeKill, terminateChild } from "./child-cleanup.mjs";

function fakeChild(pid = 4242) {
  const destroyed = [];
  const stream = (name) => ({ destroy: () => destroyed.push(name) });
  const state = { killed: false, unrefd: false, destroyed };
  return {
    pid,
    stdin: stream("stdin"),
    stdout: stream("stdout"),
    stderr: stream("stderr"),
    kill: () => (state.killed = true),
    unref: () => (state.unrefd = true),
    state,
  };
}

test("buildTreeKill on win32 returns a taskkill tree-kill for the pid", () => {
  assert.deepEqual(buildTreeKill("win32", 1234), {
    command: "taskkill",
    args: ["/pid", "1234", "/T", "/F"],
  });
});

test("buildTreeKill on POSIX returns null — plain child.kill() reaps the group there", () => {
  // On macOS/Linux killing the child is enough (no orphaned grandchild holding
  // the inherited stdout pipe), so no extra tree-kill is needed.
  assert.equal(buildTreeKill("darwin", 1234), null);
  assert.equal(buildTreeKill("linux", 1234), null);
});

test("buildTreeKill with no pid returns null — can't tree-kill an unknown process", () => {
  // A child that never spawned (or already gone) has no pid; never emit
  // `taskkill /pid undefined`.
  assert.equal(buildTreeKill("win32", undefined), null);
  assert.equal(buildTreeKill("win32", null), null);
});

test("terminateChild on win32 kills, tree-kills the orphan, destroys stdio, unrefs", () => {
  const child = fakeChild(4242);
  const calls = [];
  const spawn = (command, args, opts) => {
    calls.push({ command, args, opts });
    return { unref: () => {} };
  };

  terminateChild(child, { platform: "win32", spawn });

  assert.equal(child.state.killed, true, "child.kill() must be called");
  assert.deepEqual(
    calls,
    [
      {
        command: "taskkill",
        args: ["/pid", "4242", "/T", "/F"],
        opts: { stdio: "ignore", detached: true },
      },
    ],
    "must tree-kill the grandchild via a detached taskkill"
  );
  assert.deepEqual(child.state.destroyed.sort(), ["stderr", "stdin", "stdout"]);
  assert.equal(child.state.unrefd, true, "child.unref() releases the parent ref");
});

test("terminateChild on POSIX kills + cleans up but spawns no tree-kill", () => {
  const child = fakeChild(99);
  const calls = [];
  const spawn = (command, args, opts) => calls.push({ command, args, opts });

  terminateChild(child, { platform: "darwin", spawn });

  assert.equal(child.state.killed, true);
  assert.equal(calls.length, 0, "POSIX needs no taskkill — child.kill() is enough");
  assert.deepEqual(child.state.destroyed.sort(), ["stderr", "stdin", "stdout"]);
  assert.equal(child.state.unrefd, true);
});

test("terminateChild never throws on a half-dead child (missing streams / kill throws)", () => {
  // finish() can fire after the child already exited: streams gone, kill() throws.
  // Cleanup must stay best-effort and silent so it never masks the real result.
  const brokenChild = {
    pid: undefined,
    kill() {
      throw new Error("already dead");
    },
  };
  assert.doesNotThrow(() =>
    terminateChild(brokenChild, { platform: "win32", spawn: undefined })
  );
});

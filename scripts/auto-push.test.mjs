import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptPush } from "./auto-push.mjs";

// auto-push.mjs is the Stop hook: it pushes the pending commits ONCE per turn,
// best-effort. attemptPush() is the testable core — the git runner is injected,
// so no real network/process is involved. It returns a status describing the
// outcome: "pushed" | "skipped" | "failed". It must NEVER throw.

// Fake git runner: interprets the args the hook uses and records every call so
// tests can assert that no network push happened when it shouldn't.
function makeGit({ remote = "", autopush = false, upstream = false, unpushed = 0, pushOk = true } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(" "));
    switch (args[0]) {
      case "remote":
        return { out: remote, ok: true };
      case "config":
        return { out: autopush ? "true" : "", ok: true };
      case "rev-parse": // @{u} resolves only when an upstream is set
        return { out: upstream ? "origin/main" : "", ok: upstream };
      case "rev-list": // --count @{u}..HEAD
        return { out: String(unpushed), ok: true };
      case "push":
        return { out: pushOk ? "" : "fatal: unable to access", ok: pushOk };
      default:
        return { out: "", ok: true };
    }
  };
  return { git, calls };
}

const noSleep = () => {};

test("auto-push — no remote → skipped, push never called", () => {
  const { git, calls } = makeGit({ remote: "", autopush: true, upstream: true, unpushed: 3 });
  const status = attemptPush({ git, sleep: noSleep });
  assert.equal(status, "skipped");
  assert.ok(!calls.some((c) => c.startsWith("push")), "no network push attempted");
});

test("auto-push — remote+autopush+upstream+pending → pushed once", () => {
  const { git, calls } = makeGit({ remote: "origin", autopush: true, upstream: true, unpushed: 3 });
  const status = attemptPush({ git, sleep: noSleep });
  assert.equal(status, "pushed");
  assert.equal(calls.filter((c) => c.startsWith("push")).length, 1, "exactly one push");
});

test("auto-push — upstream set but nothing pending → skipped, no network push", () => {
  const { git, calls } = makeGit({ remote: "origin", autopush: true, upstream: true, unpushed: 0 });
  const status = attemptPush({ git, sleep: noSleep });
  assert.equal(status, "skipped");
  assert.ok(!calls.some((c) => c.startsWith("push")), "no network push when @{u}..HEAD empty");
});

test("auto-push — a throwing git runner is swallowed → failed, never propagates", () => {
  const git = () => { throw new Error("git binary missing"); };
  let status;
  assert.doesNotThrow(() => { status = attemptPush({ git, sleep: noSleep }); });
  assert.equal(status, "failed");
});

test("auto-push — push fails → 1 retry after a pause → still KO → failed", () => {
  const { git, calls } = makeGit({
    remote: "origin", autopush: true, upstream: true, unpushed: 3, pushOk: false,
  });
  let sleeps = 0;
  const status = attemptPush({ git, sleep: () => { sleeps += 1; } });
  assert.equal(status, "failed");
  assert.equal(calls.filter((c) => c.startsWith("push")).length, 2, "initial push + 1 retry");
  assert.equal(sleeps, 1, "one pause between the two attempts");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attemptPush,
  buildGit,
  realSleep,
  runHook,
  repoRoot,
  realWrite,
  realHookDeps,
  PUSH_FAILED_WARNING,
} from "./auto-push.mjs";

// auto-push.mjs is the Stop hook: it pushes the pending commits ONCE per turn,
// best-effort. attemptPush() is the testable core — the git runner is injected,
// so no real network/process is involved. It returns a status describing the
// outcome: "pushed" | "skipped" | "failed". It must NEVER throw.
//
// Mutation score 92.39 % — the 7 residual survivors are all documented equivalents:
//   • `Number(...out.trim())` losing its `.trim()` (Number() already trims surrounding
//     whitespace, so the mutant is behaviour-identical);
//   • the 6 mutants inside the `import.meta.url` entry-point guard (its condition +
//     body only run when THIS file IS the process — unreachable from a unit test).
// Effective 100 % on non-equivalent mutants.

// Fake git runner keyed on the FULL command (args.join(" ")), not just args[0],
// so mutating ANY arg string (e.g. "--get", "@{u}..HEAD") yields an unknown
// command → a broken/neutral {ok:false} answer that fails the happy path → the
// mutant is caught. Records every call so tests can assert push discipline.
function makeGit({ remote = "", autopush = false, upstream = false, unpushed = 0, pushOk = true } = {}) {
  const calls = [];
  // Real git output carries trailing newlines → the code must .trim(); we mirror
  // that so trim-removing mutants change the outcome.
  const responses = {
    "remote": { out: remote, ok: true },
    "config --get secondbrain.autopush": { out: autopush ? "true\n" : "", ok: true },
    "rev-parse --abbrev-ref --symbolic-full-name @{u}": {
      out: upstream ? "origin/main\n" : "",
      ok: upstream,
    },
    "rev-list --count @{u}..HEAD": { out: `${unpushed}\n`, ok: true },
    "push": { out: pushOk ? "" : "fatal: unable to access", ok: pushOk },
  };
  const git = (args) => {
    const key = args.join(" ");
    calls.push(key);
    return responses[key] ?? { out: "", ok: false };
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

test("auto-push — whitespace-only `git remote` output counts as no remote (trim) → skipped", () => {
  const { git, calls } = makeGit({ remote: "\n  ", autopush: true, upstream: true, unpushed: 3 });
  assert.equal(attemptPush({ git, sleep: noSleep }), "skipped");
  assert.ok(!calls.some((c) => c.startsWith("push")), "trimmed-empty remote → no push");
});

test("auto-push — remote+autopush+upstream+pending → pushed once", () => {
  const { git, calls } = makeGit({ remote: "origin", autopush: true, upstream: true, unpushed: 3 });
  const status = attemptPush({ git, sleep: noSleep });
  assert.equal(status, "pushed");
  assert.equal(calls.filter((c) => c.startsWith("push")).length, 1, "exactly one push");
});

test("auto-push — autopush disabled gates the push even when everything else is ready → skipped", () => {
  const { git, calls } = makeGit({ remote: "origin", autopush: false, upstream: true, unpushed: 3 });
  assert.equal(attemptPush({ git, sleep: noSleep }), "skipped");
  assert.ok(!calls.some((c) => c.startsWith("push")), "no push without secondbrain.autopush=true");
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

test("auto-push — first push KO, retry OK → pushed, pause is exactly 3000ms", () => {
  let pushAttempts = 0;
  const git = (args) => {
    switch (args[0]) {
      case "remote": return { out: "origin", ok: true };
      case "config": return { out: "true", ok: true };
      case "rev-parse": return { out: "origin/main", ok: true };
      case "rev-list": return { out: "3", ok: true };
      case "push":
        pushAttempts += 1;
        return { out: "", ok: pushAttempts >= 2 }; // 1st KO, 2nd OK
      default: return { out: "", ok: true };
    }
  };
  const sleepArgs = [];
  const status = attemptPush({ git, sleep: (ms) => sleepArgs.push(ms) });
  assert.equal(status, "pushed");
  assert.equal(pushAttempts, 2, "initial push + 1 retry");
  assert.deepEqual(sleepArgs, [3000], "one 3000ms pause before the retry");
});

// ── CLI seams (buildGit, runHook, realSleep) — the untested Stop-hook wiring ──
test("buildGit — maps a successful execFile to {out, ok:true} with the right git call", () => {
  const seen = [];
  const execFile = (bin, args, opts) => {
    seen.push({ bin, args, opts });
    return "some output";
  };
  const git = buildGit("/repo", execFile);
  const res = git(["remote"]);
  assert.deepEqual(res, { out: "some output", ok: true });
  assert.equal(seen[0].bin, "git");
  assert.deepEqual(seen[0].args, ["remote"]);
  assert.equal(seen[0].opts.cwd, "/repo");
  assert.equal(seen[0].opts.encoding, "utf8");
  assert.deepEqual(seen[0].opts.stdio, ["ignore", "pipe", "pipe"]);
});

test("buildGit — null execFile output becomes '' (ok:true)", () => {
  const git = buildGit("/repo", () => null);
  assert.deepEqual(git(["remote"]), { out: "", ok: true });
});

test("buildGit — a throwing execFile → {ok:false}, out = stdout+stderr concatenated", () => {
  const git = buildGit("/repo", () => {
    const e = new Error("boom");
    e.stdout = "OUT";
    e.stderr = "ERR";
    throw e;
  });
  assert.deepEqual(git(["push"]), { out: "OUTERR", ok: false });
});

test("buildGit — throwing execFile with no stdout/stderr → out = '' (ok:false)", () => {
  const git = buildGit("/repo", () => { throw new Error("boom"); });
  assert.deepEqual(git(["push"]), { out: "", ok: false });
});

test("runHook — push failed → writes the warning, returns 0", () => {
  const git = () => { throw new Error("git missing"); }; // → attemptPush returns "failed"
  const writes = [];
  const code = runHook({ git, sleep: () => {}, write: (s) => writes.push(s) });
  assert.equal(code, 0);
  assert.deepEqual(writes, [PUSH_FAILED_WARNING]);
});

test("runHook — nothing to push (skipped) → no warning, returns 0", () => {
  const { git } = makeGit({ remote: "", autopush: true, upstream: true, unpushed: 3 });
  const writes = [];
  const code = runHook({ git, sleep: () => {}, write: (s) => writes.push(s) });
  assert.equal(code, 0);
  assert.equal(writes.length, 0);
});

test("runHook — successful push → no warning, returns 0", () => {
  const { git } = makeGit({ remote: "origin", autopush: true, upstream: true, unpushed: 3 });
  const writes = [];
  const code = runHook({ git, sleep: () => {}, write: (s) => writes.push(s) });
  assert.equal(code, 0);
  assert.equal(writes.length, 0);
});

test("PUSH_FAILED_WARNING — mentions the push failure and the retry", () => {
  assert.match(PUSH_FAILED_WARNING, /PUSH FAILED/);
  assert.match(PUSH_FAILED_WARNING, /git push/);
});

test("realSleep — a 0ms pause returns immediately without throwing", () => {
  // Atomics.wait on an unchanged value with a 0ms timeout returns 'timed-out'.
  assert.equal(realSleep(0), "timed-out");
});

test("repoRoot — resolves ONE level up from the module (scripts/ → repo root)", () => {
  const here = fileURLToPath(import.meta.url);
  const expected = resolve(dirname(here), "..");
  assert.equal(repoRoot(import.meta.url), expected);
  // sanity: it is strictly a parent, not the scripts dir itself
  assert.notEqual(repoRoot(import.meta.url), dirname(here));
});

test("realWrite — forwards its argument to process.stdout.write", () => {
  const orig = process.stdout.write;
  const seen = [];
  process.stdout.write = (s) => { seen.push(s); return true; };
  try {
    realWrite("payload");
  } finally {
    process.stdout.write = orig;
  }
  assert.deepEqual(seen, ["payload"]);
});

test("realHookDeps — wires a git runner + the real sleep + the real writer", () => {
  const deps = realHookDeps(import.meta.url);
  assert.equal(typeof deps.git, "function");
  assert.equal(deps.sleep, realSleep);
  assert.equal(deps.write, realWrite);
});

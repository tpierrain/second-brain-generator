import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildNotifyCommand,
  shouldNotify,
  notifyDone,
  isNotifyWorthy,
  IndexingBurst,
} from "./notify.js";

test("isNotifyWorthy: nothing indexed → never notify", () => {
  assert.equal(isNotifyWorthy(0), false);
});

test("isNotifyWorthy: default min=1 → any indexed note is worth a toast (explicit/startup paths)", () => {
  assert.equal(isNotifyWorthy(1), true);
});

test("isNotifyWorthy: live-watcher bulk threshold — a single edit (1) under min=5 stays silent", () => {
  assert.equal(isNotifyWorthy(1, 5), false);
  assert.equal(isNotifyWorthy(4, 5), false);
});

test("isNotifyWorthy: live-watcher bulk threshold — an import-sized batch (>=5) notifies", () => {
  assert.equal(isNotifyWorthy(5, 5), true);
  assert.equal(isNotifyWorthy(304, 5), true);
});

test("buildNotifyCommand: darwin → osascript display notification", () => {
  assert.deepEqual(buildNotifyCommand("darwin", { title: "Second brain", body: "Indexing done" }), {
    command: "osascript",
    args: ["-e", 'display notification "Indexing done" with title "Second brain"'],
  });
});

test("buildNotifyCommand: win32 → powershell toast carrying title and body", () => {
  const cmd = buildNotifyCommand("win32", { title: "Second brain", body: "Indexing done" });
  assert.equal(cmd?.command, "powershell");
  assert.deepEqual(cmd?.args.slice(0, 2), ["-NoProfile", "-Command"]);
  assert.match(cmd!.args[2], /Second brain/);
  assert.match(cmd!.args[2], /Indexing done/);
});

test("buildNotifyCommand: darwin escapes a double-quote in the body so the AppleScript literal can't break (#8)", () => {
  // v3.3.0 routes health-check detail (incl. arbitrary spawn-error text) into the body.
  // A raw " would close the `display notification "..."` literal → osascript exits non-zero
  // → the toast is silently lost exactly when it matters.
  const cmd = buildNotifyCommand("darwin", { title: 'a "T" b', body: 'broke at "here"' });
  const script = cmd!.args[1];
  // Escaped form: \" never bare-closes the literal.
  assert.match(script, /display notification "broke at \\"here\\"" with title "a \\"T\\" b"/);
  // No bare (unescaped) double-quote inside the interpolated values.
  assert.ok(!/[^\\]"here"/.test(script), "the inner quote must be backslash-escaped, not bare");
});

test("buildNotifyCommand: win32 escapes backtick, double-quote and $ in body/title (#8)", () => {
  const cmd = buildNotifyCommand("win32", { title: "T", body: 'a "q" `b $env:x' });
  const ps = cmd!.args[2];
  // PowerShell double-quoted string: " → `" , ` → `` , $ → `$  (so the literal can't
  // break and $env:x is not interpolated into the toast).
  assert.match(ps, /`"q`"/, "a double-quote must be backtick-escaped");
  assert.match(ps, /`\$env:x/, "a $ must be backtick-escaped (no variable interpolation)");
  assert.ok(!/ "q" /.test(ps), "no bare double-quote may survive in the PS string");
});

test("buildNotifyCommand: linux → notify-send title body", () => {
  assert.deepEqual(buildNotifyCommand("linux", { title: "Second brain", body: "Indexing done" }), {
    command: "notify-send",
    args: ["Second brain", "Indexing done"],
  });
});

test("buildNotifyCommand: unknown platform → null", () => {
  assert.equal(buildNotifyCommand("aix" as NodeJS.Platform, { title: "t", body: "b" }), null);
});

test("shouldNotify: plain desktop session → true", () => {
  assert.equal(shouldNotify({}, "darwin"), true);
});

test("shouldNotify: SBG_NO_NOTIFY set → false (silences automated flows)", () => {
  assert.equal(shouldNotify({ SBG_NO_NOTIFY: "1" }, "darwin"), false);
});

test("shouldNotify: CI set → false", () => {
  assert.equal(shouldNotify({ CI: "true" }, "darwin"), false);
});

test("shouldNotify: linux headless (no DISPLAY/WAYLAND) → false", () => {
  assert.equal(shouldNotify({}, "linux"), false);
});

test("shouldNotify: linux with DISPLAY → true", () => {
  assert.equal(shouldNotify({ DISPLAY: ":0" }, "linux"), true);
});

test("notifyDone: desktop session → spawns detached and returns {notified:true}", () => {
  const calls: Array<{ command: string; args: readonly string[]; opts: any }> = [];
  let unrefed = false;
  const spawn = (command: string, args: readonly string[], opts: any) => {
    calls.push({ command, args, opts });
    return { unref: () => { unrefed = true; } } as any;
  };
  const res = notifyDone({
    platform: "darwin",
    env: {},
    title: "Second brain",
    body: "Indexing done",
    spawn,
  });
  assert.deepEqual(res, { notified: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "osascript");
  assert.equal(calls[0].opts.detached, true);
  assert.equal(calls[0].opts.stdio, "ignore");
  assert.equal(calls[0].opts.windowsHide, true); // no console flash on Windows (cross-OS parity)
  assert.equal(unrefed, true);
});

test("notifyDone: guard off (SBG_NO_NOTIFY) → no spawn, {notified:false}", () => {
  let called = false;
  const spawn = () => { called = true; return { unref() {} } as any; };
  const res = notifyDone({
    platform: "darwin",
    env: { SBG_NO_NOTIFY: "1" },
    title: "t",
    body: "b",
    spawn,
  });
  assert.deepEqual(res, { notified: false });
  assert.equal(called, false);
});

test("notifyDone: unknown platform (no command) → no spawn, {notified:false}", () => {
  let called = false;
  const spawn = () => { called = true; return { unref() {} } as any; };
  const res = notifyDone({
    platform: "aix" as NodeJS.Platform,
    env: {},
    title: "t",
    body: "b",
    spawn,
  });
  assert.deepEqual(res, { notified: false });
  assert.equal(called, false);
});

test("notifyDone: throwing spawn is swallowed → {notified:false}", () => {
  const spawn = () => { throw new Error("ENOENT"); };
  const res = notifyDone({ platform: "darwin", env: {}, title: "t", body: "b", spawn });
  assert.deepEqual(res, { notified: false });
});

// ── IndexingBurst (Obs 3 / F5): one truthful toast per settled burst ──────────
// A big sync/import lands in waves; the watcher reindexes each debounced batch.
// Firing a "done — 8 notes" per batch lies twice (premature "done" + partial
// count). The burst accumulates the per-pass `indexed` and only fires ONCE the
// watcher is quiescent (no pending/scheduled work), with the settled TOTAL.

test("IndexingBurst: a pass while more is coming → never fires, just accumulates", () => {
  const burst = new IndexingBurst();
  assert.deepEqual(burst.record(8, true, 5), { notify: false, total: 8 });
  assert.deepEqual(burst.record(10, true, 5), { notify: false, total: 18 });
});

test("IndexingBurst: settle (no more coming) → ONE final toast with the accumulated total", () => {
  const burst = new IndexingBurst();
  burst.record(8, true, 5);
  burst.record(10, true, 5);
  assert.deepEqual(burst.record(9, false, 5), { notify: true, total: 27 });
});

test("IndexingBurst: settled total under the bulk threshold → stays silent", () => {
  const burst = new IndexingBurst();
  assert.deepEqual(burst.record(2, false, 5), { notify: false, total: 2 });
});

test("IndexingBurst: a single settled bulk pass behaves like the old one-shot toast", () => {
  const burst = new IndexingBurst();
  assert.deepEqual(burst.record(8, false, 5), { notify: true, total: 8 });
});

test("IndexingBurst: after settling, the next burst counts from zero (no carry-over)", () => {
  const burst = new IndexingBurst();
  assert.deepEqual(burst.record(27, false, 1), { notify: true, total: 27 });
  assert.deepEqual(burst.record(3, false, 1), { notify: true, total: 3 });
});

test("IndexingBurst: a quiescent pass that indexed nothing → silent, total 0", () => {
  const burst = new IndexingBurst();
  assert.deepEqual(burst.record(0, false, 5), { notify: false, total: 0 });
});

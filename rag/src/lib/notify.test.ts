import { test } from "node:test";
import assert from "node:assert/strict";

import { buildNotifyCommand, shouldNotify, notifyDone, isNotifyWorthy } from "./notify.js";

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

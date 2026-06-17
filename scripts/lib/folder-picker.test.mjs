import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFolderPickerCommand, shouldPickFolder, pickFolder } from "./folder-picker.mjs";

test("buildFolderPickerCommand — darwin → osascript choose folder with prompt", () => {
  assert.deepEqual(buildFolderPickerCommand("darwin", "Pick your old brain"), {
    command: "osascript",
    args: ["-e", 'POSIX path of (choose folder with prompt "Pick your old brain")'],
  });
});

test("buildFolderPickerCommand — win32 → powershell FolderBrowserDialog, prints SelectedPath on OK", () => {
  const cmd = buildFolderPickerCommand("win32", "Pick your old brain");
  assert.equal(cmd.command, "powershell");
  assert.deepEqual(cmd.args.slice(0, 2), ["-NoProfile", "-Command"]);
  const script = cmd.args[2];
  assert.match(script, /FolderBrowserDialog/);
  assert.match(script, /Pick your old brain/);
  // only emit a path when the user clicked OK
  assert.match(script, /OK/);
  assert.match(script, /SelectedPath/);
});

test("buildFolderPickerCommand — linux → zenity directory selection with title", () => {
  assert.deepEqual(buildFolderPickerCommand("linux", "Pick your old brain"), {
    command: "zenity",
    args: ["--file-selection", "--directory", "--title=Pick your old brain"],
  });
});

test("buildFolderPickerCommand — unknown platform → null", () => {
  assert.equal(buildFolderPickerCommand("aix", "Pick your old brain"), null);
});

test("shouldPickFolder — plain desktop session → true", () => {
  assert.equal(shouldPickFolder({}, "darwin"), true);
});

test("shouldPickFolder — SBG_NO_PICKER set → false (escape hatch)", () => {
  assert.equal(shouldPickFolder({ SBG_NO_PICKER: "1" }, "darwin"), false);
});

test("shouldPickFolder — CI set → false", () => {
  assert.equal(shouldPickFolder({ CI: "true" }, "darwin"), false);
});

test("shouldPickFolder — linux headless (no DISPLAY/WAYLAND) → false", () => {
  assert.equal(shouldPickFolder({}, "linux"), false);
});

test("shouldPickFolder — linux with DISPLAY → true", () => {
  assert.equal(shouldPickFolder({ DISPLAY: ":0" }, "linux"), true);
});

test("pickFolder — success → runs the command and returns the trimmed path", () => {
  const calls = [];
  const spawnSync = (command, args, opts) => {
    calls.push({ command, args, opts });
    return { status: 0, stdout: "/Users/u/old-brain\n" };
  };
  const res = pickFolder({ platform: "darwin", env: {}, prompt: "Pick", spawnSync });
  assert.equal(res, "/Users/u/old-brain");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "osascript");
  assert.equal(calls[0].opts.encoding, "utf8");
});

test("pickFolder — cancel (non-zero status) → null", () => {
  const spawnSync = () => ({ status: 1, stdout: "" });
  assert.equal(pickFolder({ platform: "darwin", env: {}, prompt: "Pick", spawnSync }), null);
});

test("pickFolder — empty stdout (OK but nothing) → null", () => {
  const spawnSync = () => ({ status: 0, stdout: "   \n" });
  assert.equal(pickFolder({ platform: "darwin", env: {}, prompt: "Pick", spawnSync }), null);
});

test("pickFolder — guard off (SBG_NO_PICKER) → null, no spawn", () => {
  let called = false;
  const spawnSync = () => { called = true; return { status: 0, stdout: "/x" }; };
  assert.equal(pickFolder({ platform: "darwin", env: { SBG_NO_PICKER: "1" }, prompt: "P", spawnSync }), null);
  assert.equal(called, false);
});

test("pickFolder — unknown platform (no command) → null, no spawn", () => {
  let called = false;
  const spawnSync = () => { called = true; return { status: 0, stdout: "/x" }; };
  assert.equal(pickFolder({ platform: "aix", env: {}, prompt: "P", spawnSync }), null);
  assert.equal(called, false);
});

test("pickFolder — throwing spawnSync is swallowed → null", () => {
  const spawnSync = () => { throw new Error("ENOENT"); };
  assert.equal(pickFolder({ platform: "darwin", env: {}, prompt: "P", spawnSync }), null);
});

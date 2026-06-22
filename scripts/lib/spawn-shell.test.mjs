import { test } from "node:test";
import assert from "node:assert/strict";
import { needsShell } from "./spawn-shell.mjs";

// Since Node ≥ 18.20 / 20 (CVE-2024-27980 hardening), spawning a Windows `.cmd`/`.bat`
// shim (npm.cmd, npx.cmd) WITHOUT `shell:true` throws EINVAL. `needsShell` decides,
// per (command, platform), whether the spawn must go through a shell. macOS/Linux and
// real `.exe` (node, git) never need it — so the fix stays a no-op off Windows.

test("needsShell: a .cmd shim on win32 must go through a shell", () => {
  assert.equal(needsShell("npm.cmd", "win32"), true);
});

test("needsShell: off Windows, a .cmd never needs a shell (no-op on POSIX)", () => {
  assert.equal(needsShell("npm.cmd", "darwin"), false);
  assert.equal(needsShell("npm.cmd", "linux"), false);
});

test("needsShell: a real executable on win32 (node, git, cmd) stays shell-free", () => {
  assert.equal(needsShell("node", "win32"), false);
  assert.equal(needsShell("node.exe", "win32"), false);
  assert.equal(needsShell("git", "win32"), false);
  assert.equal(needsShell("cmd", "win32"), false); // cmd /c <tmp.cmd> — cmd itself is an .exe
});

test("needsShell: the extension match is case-insensitive (.CMD/.BAT)", () => {
  assert.equal(needsShell("NPM.CMD", "win32"), true);
  assert.equal(needsShell("setup.Bat", "win32"), true);
});

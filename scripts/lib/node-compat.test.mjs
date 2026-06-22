import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkNode,
  checkNativePrebuild,
  detectCppToolchain,
  hasPrebuiltBinary,
  NODE_WINDOW,
} from "./node-compat.mjs";

// The supported Node window for the RAG engine's native deps. Floor raised to 22:
// Node 20 is EOL (April 2026) and better-sqlite3 ≥ 12.10 no longer ships a Node-20
// (ABI 115) prebuild. Ceiling = highest declared support.
const WINDOW = { min: 22, max: 26 };

test("NODE_WINDOW: the shared constant matches the engine's native-dep window", () => {
  assert.deepEqual(NODE_WINDOW, { min: 22, max: 26 });
});

test("checkNode: a version inside the window is ok", () => {
  const verdict = checkNode("22.4.0", WINDOW);
  assert.equal(verdict.ok, true);
});

test("checkNode: below the floor is a hard fail with an actionable message", () => {
  const verdict = checkNode("18.20.0", WINDOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /18/); // names the detected version
  assert.match(verdict.message, /22/); // names the required floor
  assert.match(verdict.message, /nvm|volta|nodejs\.org/i); // tells how to switch
});

test("checkNode: Node 20 now fails (floor raised — Node 20 is EOL, no prebuilt binary)", () => {
  const verdict = checkNode("20.18.0", WINDOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /EOL|prebuilt|prebuild/i); // explains why 20 is dropped
});

test("checkNode: Node 21 is below the new floor and fails", () => {
  const verdict = checkNode("21.7.0", WINDOW);
  assert.equal(verdict.ok, false);
});

test("checkNode: above the declared ceiling warns but still allows (forward-friendly)", () => {
  const verdict = checkNode("28.0.0", WINDOW);
  assert.equal(verdict.ok, true); // never block a newer Node
  assert.equal(verdict.warn, true);
  assert.match(verdict.message, /28/); // names the detected version
  assert.match(verdict.message, /26/); // names the tested ceiling
});

test("checkNode: exactly on the ceiling is plainly ok (no warning)", () => {
  const verdict = checkNode("26.9.0", WINDOW);
  assert.equal(verdict.ok, true);
  assert.ok(!verdict.warn);
});

test("checkNode: exactly on the floor is ok (the floor is inclusive)", () => {
  const verdict = checkNode("22.0.0", WINDOW);
  assert.equal(verdict.ok, true);
  assert.ok(!verdict.warn);
});

// ── checkNativePrebuild — does a better-sqlite3 prebuilt binary exist for the
//    running {platform, arch, abi}? If not, a C++ toolchain must build it from
//    source — else fail fast (ADR 0009/0020, Bug 4). ABI = process.versions.modules.
test("checkNativePrebuild: an in-window ABI on a mainstream platform is ok (prebuilt ships, no toolchain needed)", () => {
  const verdict = checkNativePrebuild({ platform: "win32", arch: "x64", abi: 127 }, { hasToolchain: false });
  assert.equal(verdict.ok, true);
  assert.ok(!verdict.warn);
});

test("checkNativePrebuild: no prebuilt ABI and no toolchain is a hard fail with an actionable message", () => {
  // Node 28-ish ABI (above the tested ceiling) — better-sqlite3 ships no prebuild for it yet.
  const verdict = checkNativePrebuild({ platform: "win32", arch: "x64", abi: 999 }, { hasToolchain: false });
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /better-sqlite3/);
  assert.match(verdict.message, /22.*26|22–26|22-26/); // points at the prebuilt-safe window
  assert.match(verdict.message, /nvm|volta|toolchain|build/i); // tells how to fix
});

test("checkNativePrebuild: no prebuilt ABI but a C++ toolchain is present → ok, warns it will build from source", () => {
  const verdict = checkNativePrebuild({ platform: "win32", arch: "x64", abi: 999 }, { hasToolchain: true });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.warn, true);
  assert.match(verdict.message, /source/i); // explains the slower from-source path
});

test("checkNativePrebuild: an in-window ABI on an exotic arch needs a toolchain (no prebuild for that arch)", () => {
  const verdict = checkNativePrebuild({ platform: "linux", arch: "arm", abi: 127 }, { hasToolchain: false });
  assert.equal(verdict.ok, false);
});

// ── detectCppToolchain — best-effort, injected probe (testable). True iff a
//    C/C++ compiler answers on PATH. Conservative: unknown → false (safe nudge
//    to an in-window Node, which always ships a prebuilt binary).
test("detectCppToolchain: a probe that finds a compiler → true", () => {
  const probe = (cmd) => ({ ok: cmd === "cc" });
  assert.equal(detectCppToolchain(probe, "linux"), true);
});

test("detectCppToolchain: no compiler answers anywhere → false", () => {
  const probe = () => ({ ok: false });
  assert.equal(detectCppToolchain(probe, "linux"), false);
});

test("hasPrebuiltBinary: true for an in-window ABI on a mainstream platform, false otherwise", () => {
  assert.equal(hasPrebuiltBinary({ platform: "win32", arch: "x64", abi: 127 }), true);
  assert.equal(hasPrebuiltBinary({ platform: "win32", arch: "x64", abi: 999 }), false); // ABI not prebuilt
  assert.equal(hasPrebuiltBinary({ platform: "linux", arch: "arm", abi: 127 }), false); // arch not prebuilt
});

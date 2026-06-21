import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addVaultToObsidianConfig,
  shouldRegisterObsidian,
  obsidianConfigPath,
  registerVaultInObsidian,
  isObsidianRunning,
} from "./obsidian-register.mjs";

// A recording set of injected I/O seams for registerVaultInObsidian tests.
function makeSeams({ files = {}, isRunning = false } = {}) {
  const store = { ...files };
  const writes = [];
  const backups = [];
  return {
    platform: "darwin",
    env: {},
    home: "/Users/u",
    now: () => 1000,
    isObsidianRunning: () => isRunning,
    existsSync: (p) => p in store,
    readFileSync: (p) => store[p],
    writeFileSync: (p, data) => {
      store[p] = data;
      writes.push({ path: p, data });
    },
    copyFileSync: (src, dest) => {
      store[dest] = store[src];
      backups.push({ src, dest });
    },
    _store: store,
    _writes: writes,
    _backups: backups,
  };
}

test("addVaultToObsidianConfig — empty config gains one vault pointing at the path", () => {
  const result = addVaultToObsidianConfig({}, "/home/u/brain/vault");
  const entries = Object.values(result.vaults);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/home/u/brain/vault");
});

test("addVaultToObsidianConfig — keeps the user's other vaults (never clobbers)", () => {
  const existing = { vaults: { abc123: { path: "/home/u/other-vault", ts: 42 } } };
  const result = addVaultToObsidianConfig(existing, "/home/u/brain/vault");
  assert.deepEqual(result.vaults.abc123, { path: "/home/u/other-vault", ts: 42 });
  assert.equal(Object.values(result.vaults).length, 2);
});

test("addVaultToObsidianConfig — idempotent: registering the same path twice adds no duplicate", () => {
  const once = addVaultToObsidianConfig({}, "/home/u/brain/vault");
  const twice = addVaultToObsidianConfig(once, "/home/u/brain/vault");
  assert.equal(Object.values(twice.vaults).length, 1);
});

test("addVaultToObsidianConfig — re-registering preserves the existing ts (truly idempotent → wrapper can skip the write)", () => {
  const once = addVaultToObsidianConfig({}, "/home/u/brain/vault", { ts: 111 });
  const twice = addVaultToObsidianConfig(once, "/home/u/brain/vault", { ts: 999 });
  assert.deepEqual(twice, once);
});

test("addVaultToObsidianConfig — a path already registered under Obsidian's OWN random id is not duplicated (#7)", () => {
  // The user opened the brain folder via Obsidian's "Open folder as vault" → Obsidian
  // stored it under its own random id, not our deterministic SHA id. Re-registering must
  // detect the SAME PATH and no-op, never add a second switcher entry for the same vault.
  const existing = { vaults: { "9f3c1ea7b2d04c81": { path: "/home/u/brain/vault", ts: 7 } } };
  const result = addVaultToObsidianConfig(existing, "/home/u/brain/vault");
  assert.equal(Object.values(result.vaults).length, 1, "no duplicate entry for the same path");
  assert.deepEqual(result.vaults["9f3c1ea7b2d04c81"], { path: "/home/u/brain/vault", ts: 7 });
});

test("registerVaultInObsidian — vault already registered under Obsidian's own id → already-registered, no write (#7)", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const pre = { vaults: { "abcd1234deadbeef": { path: "/Users/u/brain/vault", ts: 3 } } };
  const seams = makeSeams({ files: { [cfg]: JSON.stringify(pre) } });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: true, reason: "already-registered" });
  assert.equal(seams._writes.length, 0);
  assert.equal(seams._backups.length, 0);
});

test("addVaultToObsidianConfig — on a case-insensitive FS, a path differing only in case is deduped (#7)", () => {
  // macOS (APFS) and Windows are case-insensitive: ".../Brain/vault" and ".../brain/vault"
  // are the SAME folder, so registering one when the other is present must NOT duplicate.
  const existing = { vaults: { "deadbeefcafe0001": { path: "/Users/u/Brain/vault", ts: 9 } } };
  const result = addVaultToObsidianConfig(existing, "/Users/u/brain/vault", { caseInsensitive: true });
  assert.equal(Object.values(result.vaults).length, 1, "no duplicate for the same folder under a different case");
});

test("addVaultToObsidianConfig — on a case-sensitive FS (Linux), different-case paths stay distinct vaults", () => {
  // Linux is case-sensitive: /data/Notes and /data/notes are genuinely different folders,
  // so we must NOT merge them — register the second.
  const existing = { vaults: { "deadbeefcafe0002": { path: "/data/Notes", ts: 9 } } };
  const result = addVaultToObsidianConfig(existing, "/data/notes", { caseInsensitive: false });
  assert.equal(Object.values(result.vaults).length, 2, "case-sensitive FS → distinct folders stay distinct");
});

test("registerVaultInObsidian — macOS dedups a manually-registered vault that differs only in case (#7)", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const pre = { vaults: { "f00dabcd12345678": { path: "/Users/u/Brain/vault", ts: 3 } } };
  const seams = makeSeams({ files: { [cfg]: JSON.stringify(pre) } }); // platform: "darwin"
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: true, reason: "already-registered" });
  assert.equal(seams._writes.length, 0, "no second entry written for the same case-insensitive folder");
});

test("shouldRegisterObsidian — plain desktop session → true", () => {
  assert.equal(shouldRegisterObsidian({}, "darwin"), true);
});

test("shouldRegisterObsidian — SBG_NO_OBSIDIAN_REGISTER opts out → false", () => {
  assert.equal(shouldRegisterObsidian({ SBG_NO_OBSIDIAN_REGISTER: "1" }, "darwin"), false);
});

test("shouldRegisterObsidian — CI → false", () => {
  assert.equal(shouldRegisterObsidian({ CI: "true" }, "darwin"), false);
});

test("shouldRegisterObsidian — headless Linux (no DISPLAY) → false", () => {
  assert.equal(shouldRegisterObsidian({}, "linux"), false);
  assert.equal(shouldRegisterObsidian({ DISPLAY: ":0" }, "linux"), true);
});

test("obsidianConfigPath — macOS → ~/Library/Application Support/obsidian/obsidian.json", () => {
  assert.equal(
    obsidianConfigPath("darwin", {}, "/Users/u"),
    "/Users/u/Library/Application Support/obsidian/obsidian.json"
  );
});

test("obsidianConfigPath — Windows → %APPDATA%\\obsidian\\obsidian.json", () => {
  assert.equal(
    obsidianConfigPath("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u"),
    "C:\\Users\\u\\AppData\\Roaming\\obsidian\\obsidian.json"
  );
});

test("obsidianConfigPath — Linux → ~/.config/obsidian/obsidian.json (XDG_CONFIG_HOME honored)", () => {
  assert.equal(
    obsidianConfigPath("linux", {}, "/home/u"),
    "/home/u/.config/obsidian/obsidian.json"
  );
  assert.equal(
    obsidianConfigPath("linux", { XDG_CONFIG_HOME: "/home/u/.myconfig" }, "/home/u"),
    "/home/u/.myconfig/obsidian/obsidian.json"
  );
});

test("registerVaultInObsidian — config absent (Obsidian not installed) → not-installed, no write", () => {
  const seams = makeSeams({ files: {} });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: false, reason: "not-installed" });
  assert.equal(seams._writes.length, 0);
});

test("registerVaultInObsidian — Obsidian running → skip (it would clobber on quit), no write", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const seams = makeSeams({ files: { [cfg]: "{}" }, isRunning: true });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: false, reason: "running" });
  assert.equal(seams._writes.length, 0);
});

test("registerVaultInObsidian — closed + not yet registered → backs up then writes the vault in", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const seams = makeSeams({ files: { [cfg]: '{"vaults":{}}' } });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: true, reason: "registered" });
  // backup taken before the write
  assert.equal(seams._backups.length, 1);
  assert.equal(seams._backups[0].src, cfg);
  // the written config registers the vault path
  const written = JSON.parse(seams._store[cfg]);
  const paths = Object.values(written.vaults).map((v) => v.path);
  assert.ok(paths.includes("/Users/u/brain/vault"));
});

test("registerVaultInObsidian — already registered → no write, no backup (idempotent)", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const pre = addVaultToObsidianConfig({ vaults: {} }, "/Users/u/brain/vault", { ts: 5 });
  const seams = makeSeams({ files: { [cfg]: JSON.stringify(pre) } });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: true, reason: "already-registered" });
  assert.equal(seams._writes.length, 0);
  assert.equal(seams._backups.length, 0);
});

test("registerVaultInObsidian — malformed obsidian.json → fail soft (unreadable-config), no write", () => {
  const cfg = "/Users/u/Library/Application Support/obsidian/obsidian.json";
  const seams = makeSeams({ files: { [cfg]: "{ not json" } });
  const result = registerVaultInObsidian("/Users/u/brain/vault", seams);
  assert.deepEqual(result, { registered: false, reason: "unreadable-config" });
  assert.equal(seams._writes.length, 0);
});

test("isObsidianRunning — macOS pgrep finds the process (status 0) → true", () => {
  let called;
  const exec = (command, args) => {
    called = { command, args };
    return { status: 0, stdout: "501\n" };
  };
  assert.equal(isObsidianRunning("darwin", exec), true);
  assert.equal(called.command, "pgrep");
});

test("isObsidianRunning — macOS pgrep finds nothing (status 1) → false", () => {
  const exec = () => ({ status: 1, stdout: "" });
  assert.equal(isObsidianRunning("darwin", exec), false);
});

test("isObsidianRunning — Windows tasklist lists Obsidian.exe → true, absent → false", () => {
  const present = (command, args) => {
    assert.equal(command, "tasklist");
    return { status: 0, stdout: "Obsidian.exe  1234 Console  1  120,000 K\n" };
  };
  const absent = () => ({ status: 0, stdout: "INFO: No tasks are running.\n" });
  assert.equal(isObsidianRunning("win32", present), true);
  assert.equal(isObsidianRunning("win32", absent), false);
});

test("isObsidianRunning — exec throws → assume running (fail-soft, never clobber)", () => {
  const exec = () => {
    throw new Error("pgrep not found");
  };
  assert.equal(isObsidianRunning("darwin", exec), true);
});

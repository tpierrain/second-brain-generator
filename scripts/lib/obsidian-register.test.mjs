import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addVaultToObsidianConfig,
  shouldRegisterObsidian,
  obsidianConfigPath,
} from "./obsidian-register.mjs";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { isInstallerStub, INSTALLER_STUB_MARKER } from "./claude-md.mjs";

const stub = `${INSTALLER_STUB_MARKER}\n# Not installed yet\nRun node installer.mjs\n`;

test("isInstallerStub — true when the bootstrap-stub marker is present", () => {
  assert.equal(isInstallerStub(stub), true);
});

test("isInstallerStub — false for a real user constitution", () => {
  const real = "# CLAUDE.md — Project rules my-brain\n\nPersonal rules, no stub.\n";
  assert.equal(isInstallerStub(real), false);
});

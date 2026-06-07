import { test } from "node:test";
import assert from "node:assert/strict";
import { isInstallerStub, INSTALLER_STUB_MARKER } from "./claude-md.mjs";

const stub = `${INSTALLER_STUB_MARKER}\n# Pas encore installé\nLance node installer.mjs\n`;

test("isInstallerStub — vrai quand le marqueur d'amorce est présent", () => {
  assert.equal(isInstallerStub(stub), true);
});

test("isInstallerStub — faux pour une vraie constitution utilisateur", () => {
  const real = "# CLAUDE.md — Règles projet mon-cerveau\n\nRègles perso, aucune amorce.\n";
  assert.equal(isInstallerStub(real), false);
});

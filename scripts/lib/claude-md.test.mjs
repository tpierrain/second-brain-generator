import { test } from "node:test";
import assert from "node:assert/strict";
import { isBootstrapStub, BOOTSTRAP_STUB_MARKER } from "./claude-md.mjs";

const stub = `${BOOTSTRAP_STUB_MARKER}\n# Pas encore installé\nLance node bootstrap.mjs\n`;

test("isBootstrapStub — vrai quand le marqueur d'amorce est présent", () => {
  assert.equal(isBootstrapStub(stub), true);
});

test("isBootstrapStub — faux pour une vraie constitution utilisateur", () => {
  const real = "# CLAUDE.md — Règles projet mon-cerveau\n\nRègles perso, aucune amorce.\n";
  assert.equal(isBootstrapStub(real), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readActiveUniverseWith } from "./active-universe.js";
import { DEFAULT_UNIVERSE } from "./universe.js";

// The active universe is a per-machine session pointer read by the MCP server to
// inject the search scope (ADR 0034). Absent/blank → the default universe, so a
// single-universe brain (no state file yet) behaves exactly as today.

test("reads and trims the persisted active universe", () => {
  const active = readActiveUniverseWith({
    existsSync: () => true,
    readFileSync: () => "  acme\n",
  });

  assert.equal(active, "acme");
});

test("falls back to the default universe when no state file exists", () => {
  const active = readActiveUniverseWith({
    existsSync: () => false,
    readFileSync: () => {
      throw new Error("must not read a missing file");
    },
  });

  assert.equal(active, DEFAULT_UNIVERSE);
});

test("falls back to the default universe when the state file is blank", () => {
  const active = readActiveUniverseWith({
    existsSync: () => true,
    readFileSync: () => "   \n",
  });

  assert.equal(active, DEFAULT_UNIVERSE);
});

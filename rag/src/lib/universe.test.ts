import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_UNIVERSE } from "./universe.js";

// The default universe is interpolated verbatim into SQL schema literals
// (`... DEFAULT '${DEFAULT_UNIVERSE}'` in vector-store), so it MUST be a safe,
// non-empty identifier: a quote or an empty value would corrupt the schema. These
// invariants pin the sentinel that the whole soft-scope feature relies on.
test("the default universe is a non-empty string", () => {
  assert.equal(typeof DEFAULT_UNIVERSE, "string");
  assert.ok(DEFAULT_UNIVERSE.length > 0);
});

test("the default universe is SQL-literal-safe (no single quote)", () => {
  assert.ok(!DEFAULT_UNIVERSE.includes("'"));
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { ensureEnvPlaceholder } from "./env-placeholder.mjs";

test("missing var → appends a single `<VAR>=` placeholder line", () => {
  assert.equal(ensureEnvPlaceholder("FOO=1\n", "NOTION_TOKEN_PASC"), "FOO=1\nNOTION_TOKEN_PASC=\n");
});

test("existing empty placeholder → unchanged (idempotent)", () => {
  assert.equal(ensureEnvPlaceholder("FOO=1\nNOTION_TOKEN_PASC=\n", "NOTION_TOKEN_PASC"), "FOO=1\nNOTION_TOKEN_PASC=\n");
});

test("existing FILLED line → unchanged (never clobbers a pasted token)", () => {
  assert.equal(ensureEnvPlaceholder("NOTION_TOKEN_PASC=ntn_secret\n", "NOTION_TOKEN_PASC"), "NOTION_TOKEN_PASC=ntn_secret\n");
});

test("duplicate lines (filled + empty) → collapse to ONE, keeping the filled (R2-3 dedup)", () => {
  assert.equal(
    ensureEnvPlaceholder("NOTION_TOKEN_PASC=ntn_secret\nFOO=1\nNOTION_TOKEN_PASC=\n", "NOTION_TOKEN_PASC"),
    "NOTION_TOKEN_PASC=ntn_secret\nFOO=1\n",
  );
});

test("duplicate lines (empty first, filled later) → kept line is the filled one, at the first position", () => {
  assert.equal(
    ensureEnvPlaceholder("NOTION_TOKEN_PASC=\nFOO=1\nNOTION_TOKEN_PASC=ntn_secret\n", "NOTION_TOKEN_PASC"),
    "NOTION_TOKEN_PASC=ntn_secret\nFOO=1\n",
  );
});

test("empty content → just the placeholder line", () => {
  assert.equal(ensureEnvPlaceholder("", "NOTION_TOKEN_PASC"), "NOTION_TOKEN_PASC=\n");
});

test("no trailing newline → placeholder appended on its own line", () => {
  assert.equal(ensureEnvPlaceholder("FOO=1", "NOTION_TOKEN_PASC"), "FOO=1\nNOTION_TOKEN_PASC=\n");
});

test("a different var sharing a prefix is NOT matched", () => {
  assert.equal(
    ensureEnvPlaceholder("NOTION_TOKEN_PASC_OLD=x\n", "NOTION_TOKEN_PASC"),
    "NOTION_TOKEN_PASC_OLD=x\nNOTION_TOKEN_PASC=\n",
  );
});

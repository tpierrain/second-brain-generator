import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHandoff } from "./install-handoff.mjs";

// The single most-missed step (field QA, PR #10): the install window is the
// LAUNCHER, not the brain — the brain only works in a NEW conversation ROOTED in
// its folder, Desktop first. This builder makes that hand-off deterministic so it
// can never silently collapse back to a bare `cd … && claude` line again.
const ARGS = {
  target: "/Users/sam/brainy",
  name: "brainy",
  platform: "darwin",
  demo: "Who won the laziness trophy?",
};

test("buildHandoff — shouts that THIS window is the installer, NOT the brain", () => {
  const text = buildHandoff(ARGS).join("\n");
  assert.match(text, /installer|launcher/i);
  assert.match(text, /not your (second )?brain/i);
});

test("buildHandoff — tells the user to open a NEW conversation/window rooted in the brain folder", () => {
  const text = buildHandoff(ARGS).join("\n");
  assert.match(text, /new (conversation|window)/i);
  assert.match(text, /\/Users\/sam\/brainy/, "the brain folder path must appear");
});

test("buildHandoff — Desktop FIRST, the CLI line second (never the sole/first instruction)", () => {
  const text = buildHandoff(ARGS).join("\n");
  const desktopAt = text.search(/desktop/i);
  const cliAt = text.indexOf("cd /Users/sam/brainy && claude");
  assert.ok(desktopAt !== -1, "must mention Claude Desktop");
  assert.ok(cliAt !== -1, "must still give the CLI command");
  assert.ok(desktopAt < cliAt, "Desktop must come before the terminal command");
});

test("buildHandoff — Desktop step names the brain so the folder chip is findable", () => {
  const text = buildHandoff(ARGS).join("\n");
  assert.match(text, /brainy/);
});

test("buildHandoff — purge uses clear-example-notes.mjs, NEVER re-running the installer", () => {
  const text = buildHandoff(ARGS).join("\n");
  assert.match(text, /clear-example-notes\.mjs/, "purging example notes = the brain-side script");
  assert.doesNotMatch(text, /installer\.mjs/, "must not tell the user to re-run the installer for this brain");
});

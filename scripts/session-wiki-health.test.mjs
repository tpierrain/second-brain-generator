import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sessionWikiHealth } from "./session-wiki-health.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// sessionWikiHealth is the Track-F SessionStart core: it reads the vault (injected),
// runs the deterministic lint + consolidation scans, and emits the chat nudge ONLY
// when there is something actionable (dangling links or consolidation candidates).
// Fail-open: it never throws, so it can never disturb session start.

// A capture note under a capture zone, citing a target that has no page yet — a
// new-page consolidation candidate that makes the nudge fire.
const captureCitingMissingPage = {
  path: "meetings/2026-07-10.md",
  frontmatter: { type: "meeting", created: "2026-07-10", updated: "2026-07-10", tags: ["m"] },
  body: "Met with [[Acme Corp]] about the roadmap.",
};

function seams(overrides = {}) {
  const calls = { emitted: [] };
  const base = {
    vaultDir: "/brain/vault",
    readNotes: () => [captureCitingMissingPage],
    emit: (msg) => calls.emitted.push(msg),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("sessionWikiHealth — empty vault → emits nothing (quiet)", () => {
  const { args, calls } = seams({ readNotes: () => [] });
  sessionWikiHealth(args);
  assert.deepEqual(calls.emitted, []);
});

test("sessionWikiHealth — a capture citing a page-less entity → emits the consolidation nudge", () => {
  const { args, calls } = seams();
  sessionWikiHealth(args);
  assert.equal(calls.emitted.length, 1);
  assert.match(calls.emitted[0], /1 consolidation candidates/);
  assert.match(calls.emitted[0], /\/consolidate/);
});

test("sessionWikiHealth — reads FROM the given vaultDir", () => {
  const seen = [];
  const { args } = seams({ readNotes: (dir) => (seen.push(dir), []) });
  sessionWikiHealth(args);
  assert.deepEqual(seen, ["/brain/vault"]);
});

test("sessionWikiHealth — fail-open: a throwing readNotes never propagates, emits nothing", () => {
  const { args, calls } = seams({
    readNotes: () => {
      throw new Error("vault unreadable");
    },
  });
  sessionWikiHealth(args); // must NOT throw
  assert.deepEqual(calls.emitted, []);
});

test("settings.json.template wires session-wiki-health as a SessionStart hook, AFTER session-self-heal", () => {
  const settings = JSON.parse(
    readFileSync(join(REPO_ROOT, ".claude", "settings.json.template"), "utf8"),
  );
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  const wikiIdx = commands.findIndex((c) => c.includes("session-wiki-health.mjs"));
  const selfHealIdx = commands.findIndex((c) => c.includes("session-self-heal.mjs"));
  assert.ok(wikiIdx >= 0, "session-wiki-health.mjs must be wired on SessionStart");
  assert.ok(selfHealIdx >= 0, "session-self-heal.mjs must stay wired on SessionStart");
  assert.ok(selfHealIdx < wikiIdx, "wiki-health must run after self-heal (the restart nudge keeps priority)");
});

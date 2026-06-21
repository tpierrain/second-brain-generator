import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSelfHealGap } from "./self-heal-detect.mjs";

// detectSelfHealGap is now a PURE gate over EXPLICIT desired-state lists (F-B7 2g):
// the wrapper derives `wantedSkillDirs` (engine merge skills ∪ staged engine-skills/)
// and `wantedServerIds` (keys of the DELIVERED .mcp.json.template) and feeds them in.
// The gate no longer reads a manifest itself — it just diffs wanted vs present.
const WANTED = {
  wantedSkillDirs: [".claude/skills/local-mirror", ".claude/skills/update-engine"],
  wantedServerIds: ["vault-rag", "local-mirror"],
};

test("detectSelfHealGap — converged brain (all skills + servers present) → not needed", () => {
  const gap = detectSelfHealGap({
    ...WANTED,
    skillDirExists: () => true,
    mcpServerRegistered: () => true,
  });
  assert.equal(gap.needed, false);
});

test("detectSelfHealGap — a freshly-shipped skill not yet installed → needed, named", () => {
  const gap = detectSelfHealGap({
    ...WANTED,
    skillDirExists: (dir) => dir !== ".claude/skills/local-mirror",
    mcpServerRegistered: () => true,
  });
  assert.equal(gap.needed, true);
  assert.deepEqual(gap.missingSkills, [".claude/skills/local-mirror"]);
  assert.deepEqual(gap.missingServers, []);
});

test("detectSelfHealGap — a freshly-shipped MCP server not yet registered → needed, named", () => {
  const gap = detectSelfHealGap({
    ...WANTED,
    skillDirExists: () => true,
    mcpServerRegistered: (id) => id !== "local-mirror",
  });
  assert.equal(gap.needed, true);
  assert.deepEqual(gap.missingSkills, []);
  assert.deepEqual(gap.missingServers, ["local-mirror"]);
});

test("detectSelfHealGap — empty wanted lists → never needed (a brain that delivers no spec yet)", () => {
  const gap = detectSelfHealGap({
    wantedSkillDirs: [],
    wantedServerIds: [],
    skillDirExists: () => false,
    mcpServerRegistered: () => false,
  });
  assert.equal(gap.needed, false);
});

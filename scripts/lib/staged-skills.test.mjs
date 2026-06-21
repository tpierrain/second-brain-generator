import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { installStagedSkills } from "./staged-skills.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// staged-skills — the engine delivers upgrader-bound skills at a NON-sacred staging
// path `engine-skills/<name>/` (the sacred scrub forbids delivering under
// `.claude/skills/`, ADR 0026). installStagedSkills install-if-absent's each staged
// skill into `<brainDir>/.claude/skills/<name>/`, never overwriting a present skill.
// ─────────────────────────────────────────────────────────────────────────────

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function freshDirs(t) {
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-staged-src-"));
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-staged-brain-"));
  t.after(() => {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(brainDir, { recursive: true, force: true });
  });
  return { sourceDir, brainDir };
}

test("installStagedSkills — copies a staged skill the brain is MISSING into .claude/skills/, returns its name", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  const body = "---\nname: local-mirror\n---\nMirror a Notion zone into the vault.\n";
  writeFile(sourceDir, "engine-skills/local-mirror/SKILL.md", body);

  const installed = installStagedSkills({ sourceDir, brainDir });

  assert.deepEqual(installed, ["local-mirror"]);
  assert.equal(readFileSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md"), "utf8"), body);
});

test("installStagedSkills — a skill the brain ALREADY has is preserved byte-identical, not reported", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  writeFile(sourceDir, "engine-skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nEngine default.\n");
  const mine = "---\nname: local-mirror\n---\nMY OWN tweaks — do not overwrite.\n";
  writeFile(brainDir, ".claude/skills/local-mirror/SKILL.md", mine);

  const installed = installStagedSkills({ sourceDir, brainDir });

  assert.deepEqual(installed, [], "a present skill is not (re)installed");
  assert.equal(readFileSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md"), "utf8"), mine, "the user's skill is untouched");
});

test("installStagedSkills — idempotent: a second run installs nothing", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  writeFile(sourceDir, "engine-skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror.\n");

  assert.deepEqual(installStagedSkills({ sourceDir, brainDir }), ["local-mirror"]);
  assert.deepEqual(installStagedSkills({ sourceDir, brainDir }), [], "re-running is a no-op");
});

test("installStagedSkills — copies the WHOLE skill subtree (nested files), not just SKILL.md", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  writeFile(sourceDir, "engine-skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror.\n");
  writeFile(sourceDir, "engine-skills/local-mirror/reference/notes.md", "deep ref\n");

  installStagedSkills({ sourceDir, brainDir });

  assert.ok(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")));
  assert.equal(readFileSync(join(brainDir, ".claude/skills/local-mirror/reference/notes.md"), "utf8"), "deep ref\n");
});

test("installStagedSkills — installs only the MISSING staged skills, returns them sorted by directory order", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  writeFile(sourceDir, "engine-skills/alpha/SKILL.md", "---\nname: alpha\n---\nA.\n");
  writeFile(sourceDir, "engine-skills/beta/SKILL.md", "---\nname: beta\n---\nB.\n");
  writeFile(brainDir, ".claude/skills/alpha/SKILL.md", "---\nname: alpha\n---\nmine.\n");

  const installed = installStagedSkills({ sourceDir, brainDir });

  assert.deepEqual(installed, ["beta"], "only the missing one is installed");
  assert.ok(existsSync(join(brainDir, ".claude/skills/beta/SKILL.md")));
});

test("installStagedSkills — no engine-skills/ staging dir → returns [], creates nothing", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);

  assert.deepEqual(installStagedSkills({ sourceDir, brainDir }), []);
  assert.ok(!existsSync(join(brainDir, ".claude")), "no skills dir is created when there is nothing to stage");
});

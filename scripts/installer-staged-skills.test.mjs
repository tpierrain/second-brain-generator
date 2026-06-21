import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// F-B7 2f — a FRESH install must deliver the upgrader-bound skills into
// `.claude/skills/`. The launcher's bulk copy only brings the NON-sacred staging
// source `engine-skills/<name>/` (the sacred scrub forbids the engine from writing
// under `.claude/skills/`, ADR 0026); nothing else lays the skill on disk for a
// brand-new brain. So the installer MUST call `installStagedSkills({ sourceDir:
// TARGET, brainDir: TARGET })` after the bulk copy + locale overlay.
//
// installer.mjs is one big top-level script with no injectable seam (same reason as
// installer-postflight.test.mjs), so we pin the invariant at the source level: the
// helper is imported AND invoked. The install-if-absent behaviour itself is proven
// by staged-skills.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

const installerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "installer.mjs"),
  "utf8",
);

test("installer imports installStagedSkills from the staged-skills helper", () => {
  assert.match(
    installerSrc,
    /import\s*\{[^}]*\binstallStagedSkills\b[^}]*\}\s*from\s*["']\.\/scripts\/lib\/staged-skills\.mjs["']/,
    "installer.mjs must import installStagedSkills from ./scripts/lib/staged-skills.mjs",
  );
});

test("installer calls installStagedSkills with the TARGET as both source and brain", () => {
  assert.match(
    installerSrc,
    /installStagedSkills\(\s*\{[^}]*sourceDir:\s*TARGET[^}]*brainDir:\s*TARGET[^}]*\}\s*\)/s,
    "a fresh install must install-if-absent the staged skills into the new brain (sourceDir === brainDir === TARGET)",
  );
});

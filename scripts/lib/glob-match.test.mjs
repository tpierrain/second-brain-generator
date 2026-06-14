import { test } from "node:test";
import assert from "node:assert/strict";

import { globToRegExp, matchesAny } from "./glob-match.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// glob-match — the single manifest glob dialect. Pins the contract two libs lean
// on (engine-source provenance selection, engine-apply-plan safety allowlist).
// ═══════════════════════════════════════════════════════════════════════════

test("exact entry matches only itself", () => {
  const re = globToRegExp("CLAUDE.md");
  assert.equal(re.test("CLAUDE.md"), true);
  assert.equal(re.test("docs/CLAUDE.md"), false);
  assert.equal(re.test("CLAUDE.md.bak"), false);
});

test("`*` matches a single path segment, never a slash", () => {
  const re = globToRegExp("scripts/*.mjs");
  assert.equal(re.test("scripts/auto-commit.mjs"), true);
  assert.equal(re.test("scripts/lib/helper.mjs"), false, "* must not cross a directory boundary");
});

test("`**` matches a whole subtree, including slashes", () => {
  const re = globToRegExp(".claude/skills/coach/**");
  assert.equal(re.test(".claude/skills/coach/SKILL.md"), true);
  assert.equal(re.test(".claude/skills/coach/lib/deep/x.mjs"), true);
  assert.equal(re.test(".claude/skills/other/SKILL.md"), false);
});

test("matchesAny — true iff at least one glob matches", () => {
  const globs = ["rag/src/**", "rag/package.json"];
  assert.equal(matchesAny(globs, "rag/src/lib/embedder.ts"), true);
  assert.equal(matchesAny(globs, "vault/note.md"), false);
});

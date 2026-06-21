import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { INSTALLER_STUB_MARKER } from "./claude-md.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// P0 — Portable maintainer conventions (repo-carried, brain-safe).
//
// The maintainer rules are consolidated in maintainers/CONVENTIONS.md and the
// root CLAUDE.md (the bootstrap stub) points to them, so they travel with the
// repo to any clone/machine. Two independent barriers keep them OUT of any
// generated brain:
//   (1) the stub is overwritten at install (it carries the installer-stub
//       marker), so its maintainer pointer never survives into a brain;
//   (2) CLAUDE.md.template (the brain constitution) references no maintainer
//       convention, so nothing leaks through the generated path either.
// These tests lock both barriers.
// ═══════════════════════════════════════════════════════════════════════════

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

test("the root CLAUDE.md stub points DEVELOPING-the-launcher readers to maintainers/CONVENTIONS.md", () => {
  assert.match(read("CLAUDE.md"), /maintainers\/CONVENTIONS\.md/);
});

// Barrier (1): the stub is overwritten at install, so its maintainer pointer never
// survives into a brain. If this marker is ever dropped, the pointer would leak.
test("the root CLAUDE.md still carries the installer-stub marker (so the installer overwrites it)", () => {
  assert.ok(read("CLAUDE.md").includes(INSTALLER_STUB_MARKER));
});

// Barrier (2): the brain constitution template references no maintainer convention,
// so nothing leaks through the generated path either (both locales).
for (const tpl of ["CLAUDE.md.template", "templates/fr/CLAUDE.md.template"]) {
  test(`${tpl} (the brain constitution) references no maintainer convention`, () => {
    const content = read(tpl);
    assert.doesNotMatch(content, /CONVENTIONS\.md/);
    assert.doesNotMatch(content, /maintainers\//);
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// F-B7b 5e — a FRESH install must seed the runtime health-check note into the vault.
// The note's source now ships at the NON-sacred staging path engine-health/health-
// check.md (vault/ is sacred, ADR 0026); the bulk copy brings that staging source
// over but NOT the runtime vault note. So the installer MUST call
// seedHealthNote({ sourceDir: TARGET, brainDir: TARGET }) after the bulk copy +
// locale overlay, mirroring installStagedSkills.
//
// installer.mjs is one big top-level script with no injectable seam, so we pin the
// invariant at the source level: the helper is imported AND invoked. The seed
// behaviour itself is proven by staged-health-note.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

const installerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "installer.mjs"),
  "utf8",
);

test("installer imports seedHealthNote from the staged-health-note helper", () => {
  assert.match(
    installerSrc,
    /import\s*\{[^}]*\bseedHealthNote\b[^}]*\}\s*from\s*["']\.\/scripts\/lib\/staged-health-note\.mjs["']/,
    "installer.mjs must import seedHealthNote from ./scripts/lib/staged-health-note.mjs",
  );
});

test("installer calls seedHealthNote with the TARGET as both source and brain", () => {
  assert.match(
    installerSrc,
    /seedHealthNote\(\s*\{[^}]*sourceDir:\s*TARGET[^}]*brainDir:\s*TARGET[^}]*\}\s*\)/s,
    "a fresh install must seed the vault health note from the staged copy (sourceDir === brainDir === TARGET)",
  );
});

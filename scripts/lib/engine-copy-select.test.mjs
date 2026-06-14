import { test } from "node:test";
import assert from "node:assert/strict";

import { localeOwnedPaths, selectEngineFilesToCopy } from "./engine-copy-select.mjs";

// ── localeOwnedPaths: which rel paths a locale OWNS (from templates/<locale>/<rel>) ──
test("localeOwnedPaths — derives the owned rel from templates/<locale>/<rel>", () => {
  const owned = localeOwnedPaths([
    "templates/fr/scripts/lib/demo-locale.mjs",
    "templates/fr/CLAUDE.md.template",
    "templates/en/scripts/lib/demo-locale.mjs",
    "scripts/lib/demo-locale.mjs", // a ROOT file is not locale-owned
    "rag/src/index.ts",
  ]);
  assert.ok(owned.has("scripts/lib/demo-locale.mjs"), "demo-locale.mjs is owned by a locale");
  assert.ok(owned.has("CLAUDE.md.template"), "the constitution template is locale-owned");
  assert.equal(owned.has("rag/src/index.ts"), false, "a plain engine file is not locale-owned");
});

// ── F1: the dev-only files under scripts/lib/** must never be copied to a brain ──
test("selectEngineFilesToCopy — F1: drops dev-only (eval-*, mcp-search) even when the glob is scripts/lib/**", () => {
  const sourceFiles = [
    "rag/src/index.ts",
    "scripts/lib/engine-fetch.mjs", // a real engine lib → copied
    "scripts/lib/eval-set.mjs", // dev-only → NOT copied
    "scripts/lib/eval-run.test.mjs", // dev-only → NOT copied
    "scripts/lib/mcp-search.mjs", // dev-only → NOT copied
  ];
  const copyGlobs = ["rag/src/**", "scripts/lib/**"];

  const selected = selectEngineFilesToCopy({ sourceFiles, copyGlobs });

  assert.ok(selected.includes("rag/src/index.ts"));
  assert.ok(selected.includes("scripts/lib/engine-fetch.mjs"));
  assert.equal(selected.includes("scripts/lib/eval-set.mjs"), false, "eval-* must not leak into a brain");
  assert.equal(selected.includes("scripts/lib/eval-run.test.mjs"), false);
  assert.equal(selected.includes("scripts/lib/mcp-search.mjs"), false, "mcp-search must not leak into a brain");
});

// ── F2: the locale-owned demo-locale.mjs must be KEPT (not overwritten by the root) ──
test("selectEngineFilesToCopy — F2: excludes locale-owned files so the brain keeps its installed locale", () => {
  const sourceFiles = [
    "rag/src/index.ts",
    "scripts/lib/demo-locale.mjs", // ROOT (en) → matches scripts/lib/** but is locale-owned → NOT copied
    "templates/fr/scripts/lib/demo-locale.mjs", // the fr owner (under templates/, never copied anyway)
    "templates/en/scripts/lib/demo-locale.mjs",
  ];
  const copyGlobs = ["rag/src/**", "scripts/lib/**"];

  const selected = selectEngineFilesToCopy({ sourceFiles, copyGlobs });

  assert.ok(selected.includes("rag/src/index.ts"));
  assert.equal(
    selected.includes("scripts/lib/demo-locale.mjs"),
    false,
    "demo-locale.mjs is locale-owned → update-engine must not overwrite the brain's installed locale (fr→en regression)",
  );
});

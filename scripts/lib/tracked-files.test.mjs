import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLsFilesZ, filterCopyable } from "./tracked-files.mjs";

test("parseLsFilesZ — splits on NUL and ignores the trailing empty entry", () => {
  assert.deepEqual(parseLsFilesZ("a\0b/c\0"), ["a", "b/c"]);
});

test("parseLsFilesZ — empty output → []", () => {
  assert.deepEqual(parseLsFilesZ(""), []);
});

test("filterCopyable — excludes DEVELOPING.md (launcher-only file)", () => {
  assert.deepEqual(
    filterCopyable(["README.md", "DEVELOPING.md", "rag/src/index.ts"]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — excludes EN-QUOI-C-EST-DIFFERENT.md (launcher positioning sheet)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "EN-QUOI-C-EST-DIFFERENT.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — excludes the whole maintainers/ folder (generator's dev context)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "maintainers/README.md",
      "maintainers/decisions/0001-launcher-vs-brain.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — excludes the rag/scripts/ measurement tooling (dev-only: tune EMBED_BATCH, default = confidential vault)", () => {
  assert.deepEqual(
    filterCopyable([
      "rag/src/index.ts", // RAG engine: copied
      "rag/scripts/measure-batch.mts",
    ]),
    ["rag/src/index.ts"],
  );
});

test("filterCopyable — excludes templates/ (locale sources are overlaid, not bulk-copied)", () => {
  assert.deepEqual(
    filterCopyable([
      "README.md",
      "templates/en/CLAUDE.md.template",
      "templates/fr/vault/README.md",
      "rag/src/index.ts",
    ]),
    ["README.md", "rag/src/index.ts"],
  );
});

test("filterCopyable — KEEPS the update-engine core + its libs (a brain must self-carry its updater)", () => {
  // The engine must travel into every brain WITH its own machinery, or a brain
  // installed by this launcher can never be cleanly upgraded (plan Step 4, the
  // self-carry invariant). A future DEV_ONLY_PREFIX must never strand these.
  const engine = [
    "scripts/update-engine.mjs",
    "scripts/lib/engine-fetch.mjs",
    "scripts/lib/engine-apply-plan.mjs",
    "scripts/lib/engine-source.mjs",
    "scripts/lib/reindex-trigger.mjs",
    "scripts/lib/glob-match.mjs",
    "scripts/lib/fs-walk.mjs",
  ];
  assert.deepEqual(filterCopyable(engine), engine);
});

test("filterCopyable — KEEPS the brain-side update-engine SKILL (it must ship into every brain)", () => {
  // Step 6: the conversational driver (ADR 0016) is installed into the brain like
  // the other engine skills (manifest `merge` list) — it must survive the copy. The
  // FR variant is layered on afterwards by the locale overlay (templates/fr/**).
  const skill = ".claude/skills/update-engine/SKILL.md";
  assert.deepEqual(filterCopyable([skill, "README.md"]), [skill, "README.md"]);
});

test("filterCopyable — excludes install-handoff (launcher-only: the installer's end banner, no use in a brain)", () => {
  assert.deepEqual(
    filterCopyable([
      "scripts/verify-rag.mjs", // brain-side: copied
      "scripts/lib/install-handoff.mjs",
      "scripts/lib/install-handoff.test.mjs",
      "rag/src/index.ts",
    ]),
    ["scripts/verify-rag.mjs", "rag/src/index.ts"],
  );
});

test("filterCopyable — excludes node-compat (launcher-only: install-time Node preflight, no use in a brain)", () => {
  assert.deepEqual(
    filterCopyable([
      "scripts/verify-rag.mjs", // brain-side: copied
      "scripts/lib/node-compat.mjs",
      "scripts/lib/node-compat.test.mjs",
      "rag/src/index.ts",
    ]),
    ["scripts/verify-rag.mjs", "rag/src/index.ts"],
  );
});

test("filterCopyable — excludes the eval-set tooling (dev-only: used to choose the launcher's embedder)", () => {
  assert.deepEqual(
    filterCopyable([
      "scripts/verify-rag.mjs", // stays copied (used inside the brain)
      "scripts/run-eval.mjs",
      "scripts/lib/eval-judge.mjs",
      "scripts/lib/eval-judge.test.mjs",
      "scripts/lib/eval-run.mjs",
      "scripts/lib/eval-set.mjs",
      "scripts/lib/mcp-search.mjs",
      "scripts/lib/mcp-search.test.mjs",
      "rag/src/index.ts",
    ]),
    ["scripts/verify-rag.mjs", "rag/src/index.ts"],
  );
});

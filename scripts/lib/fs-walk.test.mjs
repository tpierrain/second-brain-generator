import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listFilesRelPosix } from "./fs-walk.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// fs-walk — the ONE recursive file walk shared by the engine-manifest consumers
// (engine-source's provenance scan, update-engine's apply-from-source). Returns
// every file path relative to the root, POSIX-separated, skipping VCS/build dirs.
// ═══════════════════════════════════════════════════════════════════════════

function fixture(tree) {
  const dir = mkdtempSync(join(tmpdir(), "sbg-walk-"));
  for (const [rel, content] of Object.entries(tree)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("listFilesRelPosix — lists nested files relative to the root, POSIX-separated", (t) => {
  const dir = fixture({ "a.txt": "1", "rag/src/index.ts": "2", "scripts/lib/x.mjs": "3" });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(
    listFilesRelPosix(dir).sort(),
    ["a.txt", "rag/src/index.ts", "scripts/lib/x.mjs"],
  );
});

test("listFilesRelPosix — never descends into .git or node_modules", (t) => {
  const dir = fixture({
    "keep.mjs": "1",
    ".git/HEAD": "ref",
    "node_modules/dep/index.js": "x",
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(listFilesRelPosix(dir), ["keep.mjs"]);
});

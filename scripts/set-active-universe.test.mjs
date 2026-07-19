import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { realIo } from "./set-active-universe.mjs";
import { runSwitchCli, readActiveUniverse, readRegistry } from "./lib/universes.mjs";

// Proves the REAL fs adapter (realIo) — not the in-memory fake — actually creates
// the .vault-rag dir, writes the registry + pointer and reads them back. Uses a
// throwaway temp dir so the repo is never touched.
test("realIo: create-and-switch round-trips through the real filesystem", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "universe-")), ".vault-rag");
  try {
    const res = runSwitchCli(realIo, dir, ["create", "Acme Corp"]);

    assert.equal(res.code, 0);
    assert.ok(existsSync(join(dir, "universes.json")));
    assert.deepEqual(readRegistry(realIo, dir), ["acme-corp"]);
    assert.equal(readActiveUniverse(realIo, dir), "acme-corp");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

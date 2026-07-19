import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, runImport } from "../import-brain.mjs";

const CLI = resolve(fileURLToPath(import.meta.url), "../../import-brain.mjs");

test("parseArgs — positional is the source, --apply is a flag", () => {
  assert.deepEqual(parseArgs(["/old/brain"]), { source: "/old/brain", apply: false, universe: "" });
  assert.deepEqual(parseArgs(["/old/brain", "--apply"]), { source: "/old/brain", apply: true, universe: "" });
  assert.deepEqual(parseArgs(["--apply", "/old/brain"]), { source: "/old/brain", apply: true, universe: "" });
});

test("parseArgs — --universe <name> is captured, not mistaken for the source", () => {
  // space form, anywhere in argv
  assert.deepEqual(parseArgs(["/old/brain", "--universe", "acme"]), {
    source: "/old/brain",
    apply: false,
    universe: "acme",
  });
  assert.deepEqual(parseArgs(["--universe", "acme", "/old/brain", "--apply"]), {
    source: "/old/brain",
    apply: true,
    universe: "acme",
  });
  // = form
  assert.deepEqual(parseArgs(["/old/brain", "--universe=acme"]), {
    source: "/old/brain",
    apply: false,
    universe: "acme",
  });
});

test("runImport — missing source fails loud", () => {
  assert.throws(() => runImport({ source: undefined, dest: "/x", apply: false }), /missing source/i);
});

test("runImport — --universe threads through to stamp + route the note under vault/<universe>/", () => {
  const old = mkdtempSync(join(tmpdir(), "old-brain-"));
  const brain = mkdtempSync(join(tmpdir(), "new-brain-"));
  try {
    mkdirSync(join(old, "vault", "daily"), { recursive: true });
    writeFileSync(join(old, "vault", "daily", "2026-04-16.md"), "---\ntype: daily\n---\n\n# Day\n");
    mkdirSync(join(brain, "vault"));

    runImport({ source: old, dest: brain, apply: true, universe: "Acme" });

    const noteAt = join(brain, "vault", "acme", "daily", "2026-04-16.md");
    assert.equal(existsSync(noteAt), true);
    assert.match(readFileSync(noteAt, "utf8"), /universe: acme/);
  } finally {
    rmSync(old, { recursive: true });
    rmSync(brain, { recursive: true });
  }
});

test("import-brain CLI — plan then --apply copies into the brain's vault (smoke)", () => {
  const old = mkdtempSync(join(tmpdir(), "old-brain-"));
  const brain = mkdtempSync(join(tmpdir(), "new-brain-"));
  try {
    // a fake old brain with one real note + one demo note
    mkdirSync(join(old, "vault", "topics"), { recursive: true });
    writeFileSync(join(old, "vault", "topics", "ddd.md"), "# DDD\n");
    writeFileSync(join(old, "vault", "demo.md"), "---\ntags: [exemple]\n---\n# Demo\n");
    // the new brain ships the CLI + libs under scripts/ + an empty vault
    mkdirSync(join(brain, "vault"));
    mkdirSync(join(brain, "scripts", "lib"), { recursive: true });
    cpSync(CLI, join(brain, "scripts", "import-brain.mjs"));
    cpSync(resolve(CLI, "../lib"), join(brain, "scripts", "lib"), { recursive: true });

    const cli = join(brain, "scripts", "import-brain.mjs");
    const plan = execFileSync("node", [cli, old], { encoding: "utf8" });
    assert.match(plan, /1 note/); // ddd.md only (demo skipped)
    assert.equal(existsSync(join(brain, "vault", "topics", "ddd.md")), false); // plan = no writes

    const applied = execFileSync("node", [cli, old, "--apply"], { encoding: "utf8" });
    assert.match(applied, /1 note.*copied/i);
    assert.equal(existsSync(join(brain, "vault", "topics", "ddd.md")), true);
    assert.equal(existsSync(join(brain, "vault", "demo.md")), false); // demo never travels
  } finally {
    rmSync(old, { recursive: true });
    rmSync(brain, { recursive: true });
  }
});

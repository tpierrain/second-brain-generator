import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isExampleNote, findExampleNotes, clearExampleNotes } from "./example-notes.mjs";

const fmExemple = "---\ntype: topic\ntags: [exemple, architecture]\n---\n\n# Demo\n";
const fmHarness = "---\ntype: backlog\ntags: [harness, backlog]\n---\n\n# Frictions\n";
const noFm = "# vault/ — Your content\n\nDoc, not a note.\n";

test("isExampleNote — true if the exemple tag is present", () => {
  assert.equal(isExampleNote(fmExemple), true);
});

test("isExampleNote — false if no exemple tag", () => {
  assert.equal(isExampleNote(fmHarness), false);
});

test("isExampleNote — false without frontmatter", () => {
  assert.equal(isExampleNote(noFm), false);
});

function makeVault() {
  const dir = mkdtempSync(join(tmpdir(), "vault-ex-"));
  mkdirSync(join(dir, "topics"), { recursive: true });
  mkdirSync(join(dir, "backlog"), { recursive: true });
  writeFileSync(join(dir, "topics", "demo.md"), fmExemple);
  writeFileSync(join(dir, "backlog", "harness.md"), fmHarness);
  writeFileSync(join(dir, "README.md"), noFm);
  return dir;
}

test("findExampleNotes — returns only the notes tagged exemple", () => {
  const dir = makeVault();
  try {
    const found = findExampleNotes(dir);
    assert.deepEqual(found, [join(dir, "topics", "demo.md")]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("clearExampleNotes — removes the examples, keeps the machinery", () => {
  const dir = makeVault();
  try {
    const deleted = clearExampleNotes(dir);
    assert.deepEqual(deleted, [join(dir, "topics", "demo.md")]);
    assert.equal(existsSync(join(dir, "topics", "demo.md")), false);
    assert.equal(existsSync(join(dir, "backlog", "harness.md")), true);
    assert.equal(existsSync(join(dir, "README.md")), true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearExamples } from "./clear-example-notes.mjs";

const fmExemple = "---\ntype: topic\ntags: [exemple, architecture]\n---\n\n# Demo\n";
const fmHarness = "---\ntype: backlog\ntags: [harness, backlog]\n---\n\n# Frictions\n";

function makeBrain() {
  const root = mkdtempSync(join(tmpdir(), "brain-clear-"));
  mkdirSync(join(root, "vault", "topics"), { recursive: true });
  mkdirSync(join(root, "vault", "backlog"), { recursive: true });
  writeFileSync(join(root, "vault", "topics", "flemmr.md"), fmExemple);
  writeFileSync(join(root, "vault", "backlog", "harness.md"), fmHarness);
  return root;
}

test("clearExamples — removes the exemple-tagged notes under <root>/vault, keeps the rest", () => {
  const root = makeBrain();
  try {
    const deleted = clearExamples(root);
    assert.deepEqual(deleted, [join(root, "vault", "topics", "flemmr.md")]);
    assert.equal(existsSync(join(root, "vault", "topics", "flemmr.md")), false);
    assert.equal(existsSync(join(root, "vault", "backlog", "harness.md")), true);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("clearExamples — returns [] when there is no vault/ (nothing to do)", () => {
  const root = mkdtempSync(join(tmpdir(), "brain-novault-"));
  try {
    assert.deepEqual(clearExamples(root), []);
  } finally {
    rmSync(root, { recursive: true });
  }
});

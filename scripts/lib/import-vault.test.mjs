import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planImport, applyImport, formatPlan, formatApplyResult } from "./import-vault.mjs";

// ── helpers ──────────────────────────────────────────────────────────────────
function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// A source brain + dest brain pair, each with an empty vault. Returns roots and
// a cleanup. The callback receives { source, dest, srcVault, destVault }.
function withBrains(run) {
  const source = tmp("import-src-");
  const dest = tmp("import-dest-");
  const srcVault = join(source, "vault");
  const destVault = join(dest, "vault");
  mkdirSync(srcVault);
  mkdirSync(destVault);
  try {
    run({ source, dest, srcVault, destVault });
  } finally {
    rmSync(source, { recursive: true });
    rmSync(dest, { recursive: true });
  }
}

// ── 1a. source resolution ──────────────────────────────────────────────────
test("planImport — a brain root resolves to its <root>/vault dir", () => {
  const root = tmp("import-src-");
  try {
    mkdirSync(join(root, "vault"));
    writeFileSync(join(root, "vault", "note.md"), "# Note\n");
    const dest = tmp("import-dest-");
    try {
      mkdirSync(join(dest, "vault"));
      const plan = planImport({ source: root, dest });
      assert.equal(plan.sourceVault, join(root, "vault"));
    } finally {
      rmSync(dest, { recursive: true });
    }
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("planImport — a non-existent source throws a clear error", () => {
  const dest = tmp("import-dest-");
  try {
    mkdirSync(join(dest, "vault"));
    assert.throws(
      () => planImport({ source: join(dest, "does-not-exist"), dest }),
      /source/i,
    );
  } finally {
    rmSync(dest, { recursive: true });
  }
});

test("planImport — source === dest throws (cannot import a brain into itself)", () => {
  const root = tmp("import-self-");
  try {
    mkdirSync(join(root, "vault"));
    assert.throws(() => planImport({ source: root, dest: root }), /itself|same/i);
  } finally {
    rmSync(root, { recursive: true });
  }
});

// ── 1b. classification ──────────────────────────────────────────────────────
test("planImport — a brand-new note lands in notes (relpath preserved)", () => {
  withBrains(({ source, dest, srcVault }) => {
    writeFileSync(join(srcVault, "idea.md"), "# Idea\n");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, ["idea.md"]);
    assert.deepEqual(plan.collisions, []);
    assert.deepEqual(plan.skippedExamples, []);
  });
});

test("planImport — a note whose relpath exists in dest is a collision, not a note", () => {
  withBrains(({ source, dest, srcVault, destVault }) => {
    writeFileSync(join(srcVault, "idea.md"), "# Idea (mine)\n");
    writeFileSync(join(destVault, "idea.md"), "# Idea (already there)\n");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, []);
    assert.deepEqual(plan.collisions, ["idea.md"]);
  });
});

test("planImport — an example note (tags: [exemple]) is skipped, not imported", () => {
  withBrains(({ source, dest, srcVault }) => {
    writeFileSync(join(srcVault, "demo.md"), "---\ntype: topic\ntags: [exemple, architecture]\n---\n\n# Demo\n");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, []);
    assert.deepEqual(plan.skippedExamples, ["demo.md"]);
  });
});

test("planImport — nested subfolders and accented filenames are preserved in relpaths", () => {
  withBrains(({ source, dest, srcVault }) => {
    mkdirSync(join(srcVault, "réunions", "2026"), { recursive: true });
    writeFileSync(join(srcVault, "réunions", "2026", "réflexion stratégique.md"), "# Réflexion\n");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, ["réunions/2026/réflexion stratégique.md"]);
  });
});

// ── 1c. attachments & hidden entries ────────────────────────────────────────
test("planImport — a non-.md attachment travels with the notes", () => {
  withBrains(({ source, dest, srcVault }) => {
    mkdirSync(join(srcVault, "assets"));
    writeFileSync(join(srcVault, "assets", "diagram.png"), "PNGDATA");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, ["assets/diagram.png"]);
  });
});

test("planImport — hidden/system entries (.obsidian, dotfiles) are ignored", () => {
  withBrains(({ source, dest, srcVault }) => {
    mkdirSync(join(srcVault, ".obsidian"));
    writeFileSync(join(srcVault, ".obsidian", "workspace.json"), "{}");
    writeFileSync(join(srcVault, ".DS_Store"), "junk");
    writeFileSync(join(srcVault, "keep.md"), "# Keep\n");
    const plan = planImport({ source, dest });
    assert.deepEqual(plan.notes, ["keep.md"]);
  });
});

test("planImport — an empty source vault throws (likely the wrong folder)", () => {
  withBrains(({ source, dest }) => {
    assert.throws(() => planImport({ source, dest }), /nothing to import|empty/i);
  });
});

// ── 1d. applyImport — copy, structure-preserving, non-destructive ───────────
test("applyImport — copies planned notes into dest vault, preserving subfolders", () => {
  withBrains(({ source, dest, srcVault, destVault }) => {
    mkdirSync(join(srcVault, "topics"));
    writeFileSync(join(srcVault, "topics", "ddd.md"), "# DDD\n");
    const plan = planImport({ source, dest });
    const result = applyImport(plan, { dest });
    assert.deepEqual(result.copied, ["topics/ddd.md"]);
    assert.equal(existsSync(join(destVault, "topics", "ddd.md")), true);
    assert.equal(readFileSync(join(destVault, "topics", "ddd.md"), "utf8"), "# DDD\n");
  });
});

test("applyImport — a collision is skipped (never overwritten) and reported", () => {
  withBrains(({ source, dest, srcVault, destVault }) => {
    writeFileSync(join(srcVault, "idea.md"), "# Idea (mine)\n");
    writeFileSync(join(destVault, "idea.md"), "# Idea (already there)\n");
    const plan = planImport({ source, dest });
    const result = applyImport(plan, { dest });
    assert.deepEqual(result.copied, []);
    assert.deepEqual(result.skipped, ["idea.md"]);
    // the destination file is untouched
    assert.equal(readFileSync(join(destVault, "idea.md"), "utf8"), "# Idea (already there)\n");
  });
});

// ── formatters (pure, drive the CLI + skill report) ─────────────────────────
test("formatPlan — reports the counts of each bucket", () => {
  const out = formatPlan({
    sourceVault: "/old/vault",
    notes: ["a.md", "b.md"],
    collisions: ["c.md"],
    skippedExamples: ["demo.md"],
  });
  assert.match(out, /2/); // notes to import
  assert.match(out, /1 .*(collision|skip)/i);
  assert.match(out, /\/old\/vault/);
});

test("formatApplyResult — reports copied + skipped counts", () => {
  const out = formatApplyResult({ copied: ["a.md", "b.md"], skipped: ["c.md"] });
  assert.match(out, /2 .*(copied|imported)/i);
  assert.match(out, /1 .*skip/i);
});

test("planImport — a dir that is already a vault is used as-is", () => {
  const srcVault = tmp("import-srcvault-");
  try {
    writeFileSync(join(srcVault, "note.md"), "# Note\n");
    const dest = tmp("import-dest-");
    try {
      mkdirSync(join(dest, "vault"));
      const plan = planImport({ source: srcVault, dest });
      assert.equal(plan.sourceVault, srcVault);
    } finally {
      rmSync(dest, { recursive: true });
    }
  } finally {
    rmSync(srcVault, { recursive: true });
  }
});

// ── 1e. universe-scoped import (ADR 0034 Step 6) ─────────────────────────────
test("import --universe stamps every .md note and routes files under vault/<universe>/", () => {
  withBrains(({ source, dest, srcVault, destVault }) => {
    mkdirSync(join(srcVault, "daily"));
    writeFileSync(join(srcVault, "daily", "2026-04-16.md"), "---\ntype: daily\ntags: [x]\n---\n\n# Day\n");
    writeFileSync(join(srcVault, "photo.png"), "PNGBYTES");

    const plan = planImport({ source, dest, universe: "Acme Corp" });
    assert.equal(plan.universe, "acme-corp"); // normalized to a safe slug
    const result = applyImport(plan, { dest });

    // The note lands under the universe subtree, stamped, other frontmatter intact.
    const noteAt = join(destVault, "acme-corp", "daily", "2026-04-16.md");
    assert.equal(existsSync(noteAt), true);
    const noteText = readFileSync(noteAt, "utf8");
    assert.match(noteText, /universe: acme-corp/);
    assert.match(noteText, /type: daily/);
    assert.match(noteText, /tags: \[x\]/);

    // The attachment travels under the same subtree, byte-for-byte (never stamped).
    const photoAt = join(destVault, "acme-corp", "photo.png");
    assert.equal(existsSync(photoAt), true);
    assert.equal(readFileSync(photoAt, "utf8"), "PNGBYTES");

    // Nothing at the root — the universe scopes the whole import.
    assert.equal(existsSync(join(destVault, "daily", "2026-04-16.md")), false);
    assert.deepEqual(result.copied.sort(), ["daily/2026-04-16.md", "photo.png"]);
  });
});

test("import --universe: a same-named ROOT note is NOT a collision (the universe prefix separates them)", () => {
  withBrains(({ source, dest, srcVault, destVault }) => {
    writeFileSync(join(srcVault, "idea.md"), "# Idea (source)\n");
    // A note with the same relpath exists at the ROOT of dest, but the import is
    // universe-scoped → target is vault/acme/idea.md, so there is no clash.
    writeFileSync(join(destVault, "idea.md"), "# Idea (root, mine)\n");

    const plan = planImport({ source, dest, universe: "acme" });
    assert.deepEqual(plan.collisions, []);
    const result = applyImport(plan, { dest });

    assert.deepEqual(result.copied, ["idea.md"]);
    assert.equal(existsSync(join(destVault, "acme", "idea.md")), true);
    // The root note is left untouched.
    assert.equal(readFileSync(join(destVault, "idea.md"), "utf8"), "# Idea (root, mine)\n");
  });
});

test("import without --universe is unchanged: root routing, no stamping", () => {
  withBrains(({ source, dest, destVault }) => {
    writeFileSync(join(source, "vault", "note.md"), "---\ntype: topic\n---\n\n# N\n");
    const plan = planImport({ source, dest });
    assert.equal(plan.universe, "");
    applyImport(plan, { dest });
    const text = readFileSync(join(destVault, "note.md"), "utf8");
    assert.doesNotMatch(text, /universe:/);
  });
});

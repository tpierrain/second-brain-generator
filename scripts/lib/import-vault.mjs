// ═══════════════════════════════════════════════════════════════════════════
// import-vault.mjs — pure core for the `import` skill (ADR 0019).
// ═══════════════════════════════════════════════════════════════════════════

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { listFilesRelPosix } from "./fs-walk.mjs";
import { isExampleNote } from "./example-notes.mjs";
import { normalizeUniverseName, DEFAULT_UNIVERSE } from "./universes.mjs";
import { stampUniverse } from "./stamp-universe.mjs";

// Resolves `source` to its vault dir: a brain root resolves to <source>/vault;
// a dir that is already a vault is used as-is.
function resolveSourceVault(source) {
  const nested = join(source, "vault");
  if (existsSync(nested) && statSync(nested).isDirectory()) return nested;
  return source;
}

export function planImport({ source, dest, universe }) {
  if (!source || !existsSync(source)) {
    throw new Error(`import: source not found — no such folder: ${source}`);
  }
  const sourceVault = resolveSourceVault(source);
  const destVault = join(dest, "vault");
  if (sourceVault === destVault || source === dest) {
    throw new Error("import: source and destination are the same brain — cannot import a brain into itself");
  }
  // A non-default universe scopes the whole import under its own subtree (ADR 0034
  // Step 6). "" means the default (root routing, no stamping — today's behaviour).
  const norm = normalizeUniverseName(universe);
  const uni = norm && norm !== DEFAULT_UNIVERSE ? norm : "";

  const notes = [];
  const collisions = [];
  const skippedExamples = [];
  for (const relpath of listFilesRelPosix(sourceVault)) {
    // Hidden/system entries (.obsidian, .DS_Store, any dotfile/dot-dir) never travel.
    if (relpath.split("/").some((seg) => seg.startsWith("."))) continue;
    // Demo notes never travel (guard the new brain's RAG). Only .md can be one.
    if (relpath.endsWith(".md") && isExampleNote(readFileSync(join(sourceVault, relpath), "utf8"))) {
      skippedExamples.push(relpath);
      continue;
    }
    // Everything else — notes AND attachments — is an import candidate, unless it
    // would clobber an existing file at its TARGET path (which the universe prefixes).
    const targetRel = uni ? `${uni}/${relpath}` : relpath;
    if (existsSync(join(destVault, targetRel))) {
      collisions.push(relpath);
      continue;
    }
    notes.push(relpath);
  }
  if (notes.length + collisions.length + skippedExamples.length === 0) {
    throw new Error(`import: nothing to import — no notes found under ${sourceVault} (is this the right folder?)`);
  }
  return { sourceVault, notes, collisions, skippedExamples, universe: uni };
}

// Human summary of a plan (counts + where it read from). Pure → unit-tested; the
// CLI entry and the `import` skill only print it.
export function formatPlan(plan) {
  return [
    `📋 Import plan (read from ${plan.sourceVault}):`,
    `   • ${plan.notes.length} note(s)/attachment(s) to import`,
    `   • ${plan.collisions.length} collision(s) (already in your vault → will be skipped, never overwritten)`,
    `   • ${plan.skippedExamples.length} example note(s) skipped (demo content)`,
  ].join("\n");
}

// Human summary of an apply result. Pure → unit-tested.
export function formatApplyResult(result) {
  return [
    `✅ Import done: ${result.copied.length} note(s)/attachment(s) copied into your vault.`,
    `   • ${result.skipped.length} skipped (name collision — your existing notes were left untouched).`,
  ].join("\n");
}

// Copies the planned notes into <dest>/vault, preserving subfolders. Never
// overwrites: a collision is skipped and reported. No business logic — drives
// off the plan produced by planImport.
export function applyImport(plan, { dest }) {
  const destVault = join(dest, "vault");
  const uni = plan.universe || "";
  const copied = [];
  for (const relpath of plan.notes) {
    const source = join(plan.sourceVault, relpath);
    const target = uni ? join(destVault, uni, relpath) : join(destVault, relpath);
    mkdirSync(dirname(target), { recursive: true });
    if (uni && relpath.endsWith(".md")) {
      // Stamp the note's frontmatter with the universe (additive), then write it —
      // attachments and un-scoped imports are copied byte-for-byte, untouched.
      writeFileSync(target, stampUniverse(readFileSync(source, "utf8"), uni));
    } else {
      copyFileSync(source, target);
    }
    copied.push(relpath);
  }
  // Collisions are never overwritten — they are reported, untouched.
  return { copied, skipped: [...plan.collisions] };
}

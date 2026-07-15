#!/usr/bin/env node
// Targeted mutation re-run for a NON-REGRESSION check: mutate only the production
// files that changed versus a base ref, grouped by package. Fast feedback on the
// files you actually touched, instead of the full 30s+ per-package audit.
//
//   node maintainers/mutation/mutate-changed.mjs [baseRef]   (default: main)
//
// Exit 0 if nothing relevant changed, or if every changed file's mutants are killed
// to the package threshold; non-zero (Stryker's own) otherwise. `scripts/**` is
// reported but NOT auto-run here: it is destructive inPlace and must run in a
// disposable git worktree (see RESULTS.md). Dev-only; never shipped to a brain.
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseRef = process.argv[2] ?? "main";

const strykerBin = resolve(
  repoRoot,
  "maintainers/mutation/node_modules/@stryker-mutator/core/bin/stryker.js"
);

// package key -> { config, match(file) }
const PACKAGES = [
  {
    key: "rag",
    config: "maintainers/mutation/stryker.rag.config.mjs",
    match: (f) => f.startsWith("rag/src/lib/"),
  },
  {
    key: "local-mirror",
    config: "maintainers/mutation/stryker.local-mirror.config.mjs",
    match: (f) => f.startsWith("local-mirror/src/"),
  },
];

const isProdTs = (f) =>
  f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts");

function changedFiles() {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...HEAD`],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const changed = changedFiles().filter(isProdTs);

const droppedScripts = changed.filter((f) => f.startsWith("scripts/"));
if (droppedScripts.length) {
  console.log(
    `⚠️  ${droppedScripts.length} scripts/** file(s) changed — run those in a disposable worktree (see RESULTS.md), skipped here:\n   ${droppedScripts.join("\n   ")}`
  );
}

let ranSomething = false;
for (const pkg of PACKAGES) {
  const files = changed.filter(pkg.match);
  if (!files.length) continue;
  ranSomething = true;
  console.log(`\n▶ Mutating ${files.length} changed ${pkg.key} file(s):\n   ${files.join("\n   ")}`);
  // --mutate takes ONE comma-separated list (a repeated flag would keep only the
  // last). Run from repo root (Stryker's project root).
  const args = [strykerBin, "run", pkg.config, "--mutate", files.join(",")];
  execFileSync("node", args, { cwd: repoRoot, stdio: "inherit" });
}

if (!ranSomething && !droppedScripts.length) {
  console.log(`No changed production files under rag/ or local-mirror/ vs ${baseRef} — nothing to mutate.`);
}

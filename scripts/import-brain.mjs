// ─────────────────────────────────────────────────────────────────────────────
// import-brain.mjs — THE CLI entry for the `import` skill (ADR 0019). Thin: it
// parses `<source> [--apply]`, drives the deterministic core (import-vault.mjs),
// and prints the plan (or the apply result). It holds NO business logic — the
// real, tested work lives in scripts/lib/import-vault.mjs (ADR 0009/0016).
//
//   node scripts/import-brain.mjs <source>           → print the plan (no writes)
//   node scripts/import-brain.mjs <source> --apply    → copy + print the result
//
// The brain to import INTO is the one this script lives in (<brain>/scripts/… →
// dest = its parent). FAIL LOUD: any error → stderr + non-zero exit (the project's
// strategy) — never pretend it worked.
// ─────────────────────────────────────────────────────────────────────────────
import { realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { planImport, applyImport, formatPlan, formatApplyResult } from "./lib/import-vault.mjs";

// True when this file is the process entry point. realpath both sides so a symlinked
// path (e.g. macOS $TMPDIR → /private/var) doesn't defeat the comparison.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export function parseArgs(argv) {
  const apply = argv.includes("--apply");
  let universe = "";
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") continue;
    if (a === "--universe") {
      universe = argv[++i] ?? ""; // the next token is the name, not the source
      continue;
    }
    if (a.startsWith("--universe=")) {
      universe = a.slice("--universe=".length);
      continue;
    }
    if (a.startsWith("--")) continue; // unknown flags are ignored
    positionals.push(a);
  }
  return { source: positionals[0], apply, universe };
}

export function runImport({ source, dest, apply, universe }) {
  if (!source) throw new Error("import: missing source — usage: import-brain.mjs <source> [--universe <name>] [--apply]");
  const plan = planImport({ source, dest, universe });
  if (!apply) return formatPlan(plan);
  const result = applyImport(plan, { dest });
  return `${formatPlan(plan)}\n\n${formatApplyResult(result)}`;
}

if (isMain()) {
  const dest = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const { source, apply, universe } = parseArgs(process.argv.slice(2));
    process.stdout.write(runImport({ source, dest, apply, universe }) + "\n");
    process.exit(0);
  } catch (e) {
    process.stderr.write(`\n❌ import failed — nothing was changed past this point.\n${e?.message ?? e}\n`);
    process.exit(1);
  }
}

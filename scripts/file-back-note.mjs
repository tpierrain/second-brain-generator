#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// file-back-note.mjs — run FROM the brain folder to file a distilled answer back
// into the vault as a durable, taxonomy-conformant note (Axis 1, Track B).
//
// Deterministic, fail-loud, binary (ADR 0009): it reads a JSON filing spec on
// stdin, stamps today's date, and writes a note whose path + frontmatter + woven
// [[links]] are conformant BY CONSTRUCTION (so `/lint` stays green on it). It
// NEVER overwrites an existing note — filing back is additive; refining a living
// page is a confirmed, conversational gesture, not a silent clobber.
//
//   echo '<json spec>' | node scripts/file-back-note.mjs
//
// Spec: { type, title, tags[], body, links?[], date? } — date required for
// dated types (decision, meeting). Exits 0 when written, 1 when refused/error.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { renderFiledNote } from "./lib/filed-note.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

// Real wiring — the side effects, injected so runFileBack stays unit-testable.
export const realFileBackDeps = {
  cwd: () => process.cwd(),
  today: () => new Date().toISOString().slice(0, 10),
  readInput: () => readFileSync(0, "utf8"),
  exists: (p) => existsSync(p),
  writeFile: (p, content) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  },
  log: (...a) => console.log(...a),
  error: (...a) => console.error(...a),
};

// Read a JSON filing spec, render a conformant note, and write it under the
// brain's vault/. Returns the process exit code: 0 written, 1 refused/error.
export function runFileBack(argv, deps = realFileBackDeps) {
  let spec;
  try {
    spec = JSON.parse(deps.readInput());
  } catch (err) {
    deps.error(`✗ Invalid JSON spec on stdin: ${err.message}`);
    return 1;
  }

  let note;
  try {
    note = renderFiledNote({ ...spec, today: deps.today() });
  } catch (err) {
    deps.error(`✗ ${err.message}`);
    return 1;
  }

  const absPath = join(deps.cwd(), "vault", note.path);
  if (deps.exists(absPath)) {
    deps.error(
      `✗ vault/${note.path} already exists — filing back never overwrites. ` +
        `Refine that living page by appending a dated section instead.`,
    );
    return 1;
  }

  deps.writeFile(absPath, note.content);
  deps.log(`✓ Filed back: vault/${note.path}`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  process.exit(runFileBack(process.argv.slice(2)));
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Engine version vector (engine-packaging Phase 0, ADR 0012). The Engine is
 * several layers, so its version is a **vector**, not one number. Step 2
 * implements the `rag` layer end-to-end (real semver in `rag/package.json`);
 * `constitutionTemplate` and `scripts` join the vector from the manifest (Step 3)
 * once those layers earn their own bump discipline.
 */
export interface EngineVersionVector {
  rag: string;
}

/** PURE: derive the version vector from a parsed `package.json` (testable). */
export function engineVersionVector(pkg: { version: string }): EngineVersionVector {
  return { rag: pkg.version };
}

// rag/package.json relative to this module (rag/src/lib → rag/). Read at call
// time (not import) so the version reflects the file actually shipped, never a
// value frozen into the bundle.
const PACKAGE_JSON = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../package.json"
);

/** Loads the Engine version vector from the live `rag/package.json`. */
export function loadEngineVersion(): EngineVersionVector {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  return engineVersionVector(pkg);
}

/**
 * PURE: the `vault_stats` "Engine" section. Surfaces the version vector and the
 * index schema version as **both** the running constant and the value stamped on
 * the index, so a drift (running ≠ stamped, i.e. a stale index) is visible at a
 * glance. A never-stamped index reads as "—" (grandfathered), never `null`.
 */
export function formatEngineVersionReport(
  version: EngineVersionVector,
  schema: { stamped: number | null; running: number }
): string {
  const stamped = schema.stamped === null ? "—" : String(schema.stamped);
  return (
    `**Engine**\n` +
    `- Version: rag ${version.rag}\n` +
    `- Index schema version: running ${schema.running}, stamped ${stamped}`
  );
}

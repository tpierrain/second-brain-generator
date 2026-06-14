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

/**
 * The brain-root `engine-manifest.json` shape we care about here: the
 * install-time provenance (`source.ref` = the git tag the brain was generated /
 * last-updated from) plus the mechanical engine vector as a last-resort fallback.
 */
export interface EngineManifest {
  source?: { ref?: string };
  engineVersion?: { rag?: string };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * PURE: the **user-facing** engine version = the git TAG recorded at install
 * (`source.ref`), mirroring `scripts/lib/engine-version.mjs` `formatEngineVersion`.
 * This is the SINGLE SOURCE OF TRUTH for "what version am I?" (ADR 0017): the
 * conversational answer must land here, never on the `rag` mechanical vector.
 *
 * Fallbacks (never invent a version): tag verbatim (semver OR branch/commit) →
 * `engineVersion.rag` (the launcher records no `source`) → null (caller falls
 * back, never throws).
 */
export function manifestEngineVersion(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== "object") return null;
  const m = manifest as EngineManifest;
  if (nonEmpty(m.source?.ref)) return m.source!.ref!;
  if (nonEmpty(m.engineVersion?.rag)) return m.engineVersion!.rag!;
  return null;
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

// engine-manifest.json lives at the BRAIN ROOT, one level above rag/ — i.e.
// three levels above this module (rag/src/lib → rag/src → rag → brain root).
// Read at call time so the value reflects the manifest actually shipped.
const ENGINE_MANIFEST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../engine-manifest.json"
);

/**
 * Loads the user-facing engine version (the install-time git TAG) from the
 * brain-root `engine-manifest.json`. Fail-silent: if the manifest is absent or
 * unreadable (e.g. a bare launcher with no manifest at that path) → null, never
 * throws. The caller falls back to the mechanical vector.
 */
export function loadManifestEngineVersion(): string | null {
  try {
    return manifestEngineVersion(JSON.parse(readFileSync(ENGINE_MANIFEST, "utf-8")));
  } catch {
    return null;
  }
}

/**
 * PURE: the `vault_stats` "Engine" section. The headline **Version** is the
 * user-facing engine TAG (`source.ref`, the SINGLE SOURCE OF TRUTH per ADR 0017)
 * — so whatever path the brain takes to answer "what version am I?", it lands on
 * the same value the status-line shows. The mechanical `rag` vector and the index
 * schema versions are DEMOTED to a clearly-labelled "internal build" line: kept
 * for debug / reindex-staleness diagnostics (a drift running ≠ stamped means a
 * stale index), but never again presented as "the version".
 *
 * `engineVersion` is the tag from `loadManifestEngineVersion()`; when it is null
 * (a bare launcher with no manifest provenance) the headline falls back to the
 * mechanical `rag` vector so it is never blank. A never-stamped index reads as
 * "—" (grandfathered), never `null`.
 */
export function formatEngineVersionReport(
  engineVersion: string | null,
  mechanics: EngineVersionVector,
  schema: { stamped: number | null; running: number }
): string {
  const stamped = schema.stamped === null ? "—" : String(schema.stamped);
  const headline = engineVersion ?? `rag ${mechanics.rag}`;
  return (
    `**Engine**\n` +
    `- Version: ${headline}\n` +
    `- internal build: rag ${mechanics.rag} · index schema running ${schema.running}, stamped ${stamped}`
  );
}

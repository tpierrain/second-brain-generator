// ─────────────────────────────────────────────────────────────────────────────
// engine-copy-select.mjs — PURE. Picks the rel paths `update-engine` should REALLY
// copy from a fetched source, applying the SAME two refinements the installer does
// over the manifest globs (the divergence that caused the PR #10 QA findings):
//   • F1 — drop the DEV-ONLY files (`filterCopyable`, e.g. scripts/lib/eval-*,
//     mcp-search.*): the engine globs include `scripts/lib/**`, which would
//     otherwise leak the eval/measurement tooling into a user brain.
//   • F2 — KEEP the LOCALE-OWNED files (e.g. scripts/lib/demo-locale.mjs): they are
//     installed from templates/<locale>/ and belong to the brain's install locale.
//     An update must not overwrite the brain's `demo-locale.mjs` (fr→en regression).
// This is an EXCLUSION from the copy, never a re-overlay (overlayLocale wipes vault/
// and would violate the safety core — see the fix plan).
// ─────────────────────────────────────────────────────────────────────────────
import { matchesAny } from "./glob-match.mjs";
import { filterCopyable } from "./tracked-files.mjs";

// The rel paths a LOCALE owns, derived from the source's templates/<locale>/<rel>
// tree: `templates/fr/scripts/lib/demo-locale.mjs` → `scripts/lib/demo-locale.mjs`.
// Locale-agnostic and future-proof: any new localized artefact is covered the moment
// it appears under templates/<*>/, with no list to maintain here.
export function localeOwnedPaths(sourceFiles) {
  const owned = new Set();
  for (const rel of sourceFiles) {
    const m = /^templates\/[^/]+\/(.+)$/.exec(rel);
    if (m) owned.add(m[1]);
  }
  return owned;
}

// The rel paths to ACTUALLY copy: matching the engine copy globs, MINUS the dev-only
// files, MINUS the locale-owned files. `localeOwnedRel` may be injected (tests); it
// defaults to the set derived from `sourceFiles`.
export function selectEngineFilesToCopy({ sourceFiles, copyGlobs, localeOwnedRel }) {
  const owned = localeOwnedRel ?? localeOwnedPaths(sourceFiles);
  return filterCopyable(sourceFiles).filter(
    (rel) => matchesAny(copyGlobs, rel) && !owned.has(rel),
  );
}

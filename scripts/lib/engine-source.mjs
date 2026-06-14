// ─────────────────────────────────────────────────────────────────────────────
// engine-source.mjs — pure helpers the installer uses to enrich a freshly-created
// brain's engine-manifest.json with:
//   • source: { repo, ref } — where (and at which launcher tag/commit) a future
//     `update-engine` should pull a newer Engine from;
//   • provenance — a base sha256 per `merge`-bucket file, seeding the Phase 2
//     3-way merge at no extra cost now (study §7 Q4, plan Step 1).
// PURE by design: the installer performs the git/FS I/O and passes the facts in.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { globToRegExp } from "./glob-match.mjs";
import { listFilesRelPosix } from "./fs-walk.mjs";

// Self-describing digest so the manifest records WHICH algorithm produced it
// (future-proofs the Phase 2 3-way if the hash ever changes).
export function fingerprint(content) {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

// The concrete files (from `candidates`) that fall under the manifest's `merge`
// regime — i.e. the files that get a provenance base seed. Selection is by the
// manifest's globs ONLY: a file the manifest never names is, by construction, the
// user's property and is never fingerprinted (the founding principle, ADR 0012).
export function selectMergeFiles(manifest, candidates) {
  const matchers = (manifest?.regimes?.merge ?? []).map(globToRegExp);
  return candidates.filter((path) => matchers.some((re) => re.test(path)));
}

// The provenance base map: { relPath: fingerprint(content) } over a file→content
// map the installer prepared (already restricted to the merge files). This is the
// base Phase 2's 3-way merge will diff against to detect user edits.
export function buildProvenance(fileMap) {
  return Object.fromEntries(
    Object.entries(fileMap).map(([path, content]) => [path, fingerprint(content)]),
  );
}

// The source record { repo, ref } the brain records so a future `update-engine`
// knows where (and at which launcher point) to pull a newer Engine from. The ref
// prefers an exact tag at HEAD (most reproducible + `git clone --branch`-able),
// then the branch, then the bare commit as a last resort.
export function buildSource({ repo, tag, branch, commit }) {
  const trimmed = (repo ?? "").trim();
  return { repo: trimmed || null, ref: tag || branch || commit };
}

// Returns a NEW manifest with `source` and `provenance` set, every other field
// preserved. Never mutates the input (the brain's freshly-copied manifest).
export function enrichManifest(manifest, { source, provenance }) {
  return { ...manifest, source, provenance };
}

// After an update-engine swap, refresh the provenance base for ONLY the merge files
// the engine actually re-delivered (`deliveredFileMap` = {rel: new content}). Files
// the engine replaces outright (rag/src…) never carry a base — same as at install.
// User merge files the swap never touched (CLAUDE.md/settings/skills) keep their
// prior base untouched, so Phase 2's 3-way still detects the user's edits against
// the version the engine last delivered. (Plan Step 5.)
export function reseedProvenance({ priorProvenance, manifest, deliveredFileMap }) {
  const redelivered = selectMergeFiles(manifest, Object.keys(deliveredFileMap));
  const refreshed = buildProvenance(
    Object.fromEntries(redelivered.map((rel) => [rel, deliveredFileMap[rel]])),
  );
  return { ...priorProvenance, ...refreshed };
}

// ─── I/O orchestrator (the installer's thin wiring) ──────────────────────────
// Real fs on the brain dir; the launcher git facts are passed in as data (no git
// spawn / network here → unit-testable on a temp fixture brain). Walks the brain
// (shared fs-walk), fingerprints exactly the `merge` files, records where to pull a
// future update from, and writes the enriched engine-manifest.json back in place.

export function recordSourceAndProvenance({ brainDir, git }) {
  const manifestPath = join(brainDir, "engine-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const mergeFiles = selectMergeFiles(manifest, listFilesRelPosix(brainDir));
  const fileMap = Object.fromEntries(
    mergeFiles.map((rel) => [rel, readFileSync(join(brainDir, rel), "utf8")]),
  );

  const enriched = enrichManifest(manifest, {
    source: buildSource(git),
    provenance: buildProvenance(fileMap),
  });
  writeFileSync(manifestPath, JSON.stringify(enriched, null, 2) + "\n");
  return enriched;
}

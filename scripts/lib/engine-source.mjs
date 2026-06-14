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
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Self-describing digest so the manifest records WHICH algorithm produced it
// (future-proofs the Phase 2 3-way if the hash ever changes).
export function fingerprint(content) {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

// Minimal glob → RegExp (same dialect as the manifest's regimes):
//   **  → any run of characters, including "/" (whole subtrees)
//   *   → any run of characters except "/" (a single path segment)
// Everything else is matched literally; the match is anchored (^…$) so a glob
// never selects a path that merely starts/ends with it.
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*/g, " ") // placeholder so "*" below doesn't eat "**"
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, ".*");
  return new RegExp("^" + body + "$");
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

// ─── I/O orchestrator (the installer's thin wiring) ──────────────────────────
// Real fs on the brain dir; the launcher git facts are passed in as data (no git
// spawn / network here → unit-testable on a temp fixture brain). Walks the brain,
// fingerprints exactly the `merge` files, records where to pull a future update
// from, and writes the enriched engine-manifest.json back in place.

// All file paths under `dir`, relative + POSIX-separated, skipping VCS/build dirs
// that are never Engine content (and don't exist yet at install time anyway).
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      out.push(...listFiles(join(dir, entry.name), base));
    } else if (entry.isFile()) {
      out.push(relative(base, join(dir, entry.name)).split(sep).join("/"));
    }
  }
  return out;
}

export function recordSourceAndProvenance({ brainDir, git }) {
  const manifestPath = join(brainDir, "engine-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const mergeFiles = selectMergeFiles(manifest, listFiles(brainDir));
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

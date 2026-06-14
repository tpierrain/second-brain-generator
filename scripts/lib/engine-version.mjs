// ─────────────────────────────────────────────────────────────────────────────
// engine-version.mjs — pure helper that turns an engine-manifest.json into the
// short, user-facing version label shown OFFLINE in the status-line (ADR 0017).
//
// The displayed version is the git TAG the brain was generated / last-updated
// from — i.e. the manifest's `source.ref`, recorded at install (Phase 1). It is
// NOT a hand-maintained number: a tag is an intentional, maintainer-controlled
// release act, read here with zero network and zero coupling.
//
// Fallbacks (never invent a version):
//   • `source.ref` present (any string — semver tag OR a branch/commit) → show it
//     verbatim. The semver-vs-not distinction only matters to the (deferred)
//     "update available" check, never to this display.
//   • no usable `source.ref` (e.g. the launcher records no `source`) → last
//     resort `engineVersion.rag`.
//   • nothing usable / missing / invalid manifest → null (the caller emits no
//     segment — fail-silent).
// ─────────────────────────────────────────────────────────────────────────────

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function formatEngineVersion(manifest) {
  if (!manifest || typeof manifest !== "object") return null;

  const ref = manifest.source?.ref;
  if (nonEmptyString(ref)) return `engine ${ref}`;

  const rag = manifest.engineVersion?.rag;
  if (nonEmptyString(rag)) return `engine ${rag}`;

  return null;
}

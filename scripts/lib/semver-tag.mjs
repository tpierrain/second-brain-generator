// ─────────────────────────────────────────────────────────────────────────────
// semver-tag.mjs — pure selection of the latest semver release tag (vX.Y.Z).
// The brain's "Version" is a GitHub release tag (ADR 0017); update-engine pulls
// the HIGHEST one from the remote. No I/O: takes a list of tag strings, returns
// the highest, or null when none is a (stable) semver tag.
// ─────────────────────────────────────────────────────────────────────────────

// Parse a `vX.Y.Z` (the leading `v` optional) into {major,minor,patch}, or null
// if it is not a STABLE semver tag. Pre-releases (a `-suffix`) are deliberately
// ignored — there is no release channel yet, only stable tags advance a brain.
export function parseSemverTag(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? "");
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function pickLatestSemverTag(tags) {
  let best = null;
  let bestParsed = null;
  for (const tag of tags ?? []) {
    const parsed = parseSemverTag(tag);
    if (!parsed) continue;
    if (bestParsed === null || isHigher(parsed, bestParsed)) {
      best = tag;
      bestParsed = parsed;
    }
  }
  return best;
}

// Numeric (not lexical) comparison: v3.10.0 > v3.2.0.
function isHigher(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

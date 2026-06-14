// ─────────────────────────────────────────────────────────────────────────────
// glob-match.mjs — the ONE glob dialect shared by every engine-manifest consumer
// (engine-source's provenance selection, engine-apply-plan's safety allowlist), so
// "which files does this glob own" has a single, identical answer everywhere.
//   **  → any run of characters, including "/" (whole subtrees)
//   *   → any run of characters except "/" (a single path segment)
// Everything else is literal; the match is anchored (^…$) so a glob never selects a
// path that merely starts/ends with it.
// ─────────────────────────────────────────────────────────────────────────────

export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*/g, " ") // placeholder so "*" below doesn't eat "**"
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, ".*");
  return new RegExp("^" + body + "$");
}

// True iff any of `globs` matches `path`.
export function matchesAny(globs, path) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

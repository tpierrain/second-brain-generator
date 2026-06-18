// ─────────────────────────────────────────────────────────────────────────────
// env-placeholder.mjs — deterministic, idempotent `.env` placeholder writer.
//
// The golden-source onboarding needs ONE token line `<VAR>=` in `.env` for the
// user to fill in place — never a chat paste-block AND a file placeholder (the
// duplicate the model then had to self-repair, R2-3). This pure function ensures
// EXACTLY ONE `^<VAR>=` line: it appends the placeholder if absent, leaves a
// single existing line untouched (idempotent — a pasted token is preserved), and
// collapses duplicates to one (deterministic dedup, keeping a filled value over an
// empty one). No I/O here; the CLI wrapper reads/writes the file and opens it.
// ─────────────────────────────────────────────────────────────────────────────

/** Ensures `content` holds exactly one `<varName>=` line. Pure + idempotent. */
export function ensureEnvPlaceholder(content, varName) {
  const prefix = varName + "=";
  const isMatch = (line) => line.startsWith(prefix);
  const isFilled = (line) => line.slice(prefix.length).trim() !== "";

  const lines = content.split("\n");
  const matches = lines.filter(isMatch);

  if (matches.length === 0) {
    const body = content === "" ? "" : content.endsWith("\n") ? content : content + "\n";
    return body + prefix + "\n";
  }

  // Collapse duplicates to ONE, preferring a filled line over an empty placeholder.
  const kept = matches.find(isFilled) ?? matches[0];
  let emitted = false;
  const result = lines.filter((line) => {
    if (!isMatch(line)) return true;
    if (emitted) return false;
    emitted = true;
    return true;
  });
  // Place the kept (possibly filled) line at the position of the first match.
  for (let i = 0; i < result.length; i++) {
    if (isMatch(result[i])) {
      result[i] = kept;
      break;
    }
  }
  return result.join("\n");
}

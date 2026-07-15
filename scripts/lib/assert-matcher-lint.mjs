// Deterministic test-quality guard (ADR 0009 spirit): flag `assert.throws(…)` /
// `assert.rejects(…)` calls with NO second argument — a bare "it threw" assertion
// that survives StringLiteral / `throw ''` mutants (the C1 cluster the 2026-07 mutation
// retrospective found recurring). See maintainers/CONVENTIONS.md §5ter and the global
// tdd-discipline skill: assert the message/matcher, not just the fact that it threw.
//
// Cheap + conservative BY DESIGN: we only flag the zero-second-argument shape (the one we
// can detect mechanically without a full JS parser). A string-only 2nd arg is still loose
// but is left to the written rule — no false positives here.

const METHODS = ["throws", "rejects"];

// Scans one source string, returns [{ line, method }] for every loose call.
export function findLooseAssertions(source) {
  const findings = [];
  for (const method of METHODS) {
    const needle = `assert.${method}(`;
    let from = 0;
    for (;;) {
      const at = source.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      if (!hasSecondArgument(source, from)) {
        findings.push({ line: lineOf(source, at), method });
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

// From just after the opening `(`, walk the argument list tracking nesting and skipping
// string literals. A top-level comma (nesting back at 1) ⇒ there is a 2nd argument.
// Reaching the matching close paren first ⇒ no 2nd argument (loose).
function hasSecondArgument(source, start) {
  let nesting = 1; // we are already inside the initial `(`
  let quote = null;
  let afterComma = false; // seen a top-level comma; awaiting a real token vs `)`
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++; // skip the escaped char
      else if (ch === quote) quote = null;
      continue;
    }
    // A top-level comma only counts if a REAL token follows it — a comma directly
    // before the closing paren is a trailing comma, not a 2nd argument.
    if (afterComma && !/\s/.test(ch)) {
      return !(ch === ")" && nesting === 1);
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      nesting++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      nesting--;
      if (nesting === 0) return false; // closed the call with no top-level comma
    } else if (ch === "," && nesting === 1) {
      afterComma = true; // decide on the next non-whitespace char
    }
  }
  return false; // unbalanced source — treat as loose rather than crash
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

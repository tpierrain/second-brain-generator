// ═══════════════════════════════════════════════════════════════════════════
// tracked-files.mjs — PURE parsing of `git ls-files -z` output. No I/O.
// ═══════════════════════════════════════════════════════════════════════════

// `git ls-files -z` separates each path with a NUL (\0) — robust to spaces and
// accents in names — and terminates the list with a trailing NUL. We split on
// \0 and drop the trailing empty entry (and any empty entry).
export function parseLsFilesZ(output) {
  return output.split("\0").filter((p) => p !== "");
}

// TRACKED launcher files/folders that must NOT be copied into the brain: they
// only concern the development of the generator itself. They are all tracked (so
// listed by `ls-files`) and travel between the maintainer's machines, but must
// never land on the end user's side.
//   - DEVELOPING.md: the dev notice at the root.
//   - EN-QUOI-C-EST-DIFFERENT.md: the generator's positioning sheet (for whoever
//     evaluates the launcher) — points to the maintainers/ ADRs, no use in a brain.
//   - maintainers/: all the dev context (decisions, plans, archives).
//   - the EVAL-SET tooling (scripts/run-eval.mjs, scripts/lib/eval-*, mcp-search):
//     the instrument used to CHOOSE the launcher's embedder (Gemini vs local
//     measurement). No value in a user brain (Flemmr notes purged → everything FAILs).
//     Excluded by PREFIX → covers the .mjs AND their .test.mjs at once.
//   - scripts/lib/install-handoff: the installer's end-of-install banner. Purely
//     launcher-side (like installer.mjs) — printed once at install time, no use in
//     a brain. Excluded by PREFIX → covers the .mjs AND its .test.mjs.
//   - rag/scripts/: engine MEASUREMENT tooling (measure-batch — tune EMBED_BATCH
//     on a dense corpus; measure-contention — prove that search and indexing share
//     a warm session). Dev-only: imports the TS source and targets a confidential
//     local vault by default; no value (or place) in a user brain.
const DEV_ONLY_FILES = new Set(["DEVELOPING.md", "EN-QUOI-C-EST-DIFFERENT.md"]);
const DEV_ONLY_PREFIXES = [
  "maintainers/",
  "scripts/run-eval.mjs",
  "scripts/lib/eval-",
  "scripts/lib/mcp-search",
  // install-handoff: the installer's end-of-install banner (buildHandoff). Pure
  // launcher-side, like installer.mjs itself — useless in a brain. Covers the .mjs
  // AND its .test.mjs via the prefix.
  "scripts/lib/install-handoff",
  // node-compat: the installer's pre-`npm install` Node-version preflight
  // (checkNode). Pure launcher-side, like installer.mjs — useless in a brain.
  // Covers the .mjs AND its .test.mjs via the prefix.
  "scripts/lib/node-compat",
  "rag/scripts/",
  // Localized artefact sources (constitution, skills, demo vault) live under
  // templates/<locale>/. They are NOT bulk-copied: the installer overlays only
  // the chosen locale onto the brain (cf. resolveLocale/chooseLocale).
  "templates/",
];

// Keeps, among the tracked paths, those to copy into the generated brain.
export function filterCopyable(paths) {
  return paths.filter(
    (p) =>
      !DEV_ONLY_FILES.has(p) && !DEV_ONLY_PREFIXES.some((dir) => p.startsWith(dir)),
  );
}

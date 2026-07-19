// ─────────────────────────────────────────────────────────────────────────────
// consolidation-candidates.mjs — the pure, I/O-free core of the Axis-1 Track C
// consolidation gesture (ADR 0009 rung 1: correctness lives in a function with no
// I/O). Given already-parsed notes it surfaces WHAT needs consolidating, grouped
// by target page, so the LLM fan-out (sync-sources shape) only has to do the
// merge (judgment) and the write reuses Track B's deterministic builder.
//
// Resumability is STATELESS (no state file to seed or corrupt): a capture drives
// consolidation purely because it is fresher than the page it feeds — or that
// page doesn't exist yet. Once a page is refreshed its `updated:` moves past the
// capture, so the candidate drops off on its own.
// ─────────────────────────────────────────────────────────────────────────────

import { extractWikiLinks, buildResolver, isUnderZone } from "./wiki-lint.mjs";

// Path prefixes whose notes are raw captures — the inputs consolidation promotes
// FROM (meeting notes, daily logs, transcripts, inbox dumps).
const DEFAULT_CAPTURE_ZONES = ["meetings/", "daily/", "raw-sources/", "inbox/"];

// Frontmatter `type` values that make a note a curated entity/topic page — the
// pages consolidation promotes INTO (and the only ones a fresher capture can
// mark for refresh). Mirrors the stale rule's entity set in wiki-lint.
const DEFAULT_ENTITY_TYPES = ["person", "topic", "company", "project", "concept"];

// A capture lives in a capture zone, insensitively to a leading `<universe>/`
// segment (ADR 0034) — shared with wiki-lint's orphan exclusions, which had the
// same universe blind spot. So `acme/meetings/x.md` is recognised like `meetings/x.md`.
function isCapture(path, captureZones) {
  return captureZones.some((prefix) => isUnderZone(path, prefix));
}

// Record `source` under `key` in a group map (key → path → source), deduping by
// source path so a capture citing the same target twice counts once.
function addSource(groups, key, source) {
  if (!groups.has(key)) groups.set(key, new Map());
  groups.get(key).set(source.path, source);
}

// Materialize a group map into candidates, deterministically: groups sorted by
// key, each group's sources sorted by path, then projected through `build`.
function sortedCandidates(groups, build) {
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sources]) =>
      build(key, [...sources.values()].sort((a, b) => a.path.localeCompare(b.path))),
    );
}

// Scan already-parsed `notes` ({ path, frontmatter, body }) and report the
// consolidation candidates, grouped by target page. Pure: no I/O, deterministic.
export function consolidationCandidates(notes, options = {}) {
  const captureZones = options.captureZones ?? DEFAULT_CAPTURE_ZONES;
  const entityTypes = options.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const resolve = buildResolver(notes);
  const byPath = new Map(notes.map((n) => [n.path, n]));

  // Group the captures' unresolved mentions by target page (new-page candidates),
  // and the fresher-than-their-page mentions by resolved page (refresh candidates).
  const newPageSources = new Map(); // target → Map(sourcePath → { path, updated })
  const refreshSources = new Map(); // page path → Map(sourcePath → { path, updated })
  for (const note of notes) {
    if (!isCapture(note.path, captureZones)) continue;
    const source = { path: note.path, updated: note.frontmatter.updated };
    for (const target of extractWikiLinks(note.body)) {
      const resolved = resolve(target);
      if (!resolved) {
        addSource(newPageSources, target, source); // no page yet → new-page candidate
        continue;
      }
      // Resolves to an existing page: a refresh candidate when that page is a
      // curated entity/topic left behind — the capture is fresher than its `updated:`.
      const page = byPath.get(resolved);
      if (!entityTypes.includes(page.frontmatter.type)) continue;
      if (!(Date.parse(source.updated) > Date.parse(page.frontmatter.updated))) continue;
      addSource(refreshSources, resolved, source);
    }
  }
  const newPages = sortedCandidates(newPageSources, (target, sources) => ({ target, sources }));
  const refreshes = sortedCandidates(refreshSources, (page, sources) => ({
    page,
    updated: byPath.get(page).frontmatter.updated,
    sources,
  }));
  return { newPages, refreshes };
}

// True when the report holds at least one candidate in either category — the
// signal the CLI turns into a binary exit code (0 nothing to consolidate / 1).
export function hasCandidates(report) {
  return report.newPages.length > 0 || report.refreshes.length > 0;
}

// The report as human-readable lines. Honest and binary: one reassuring line
// when there's nothing to consolidate, one titled section per category otherwise.
export function reportLines(report) {
  if (!hasCandidates(report)) return ["✓ Nothing to consolidate"];
  const lines = ["✗ Consolidation candidates found"];
  const section = (title, items) => {
    if (items.length === 0) return;
    lines.push("", `${title} (${items.length}):`);
    for (const item of items) lines.push(`  ${item}`);
  };
  section(
    "New pages to create",
    report.newPages.map(
      (c) => `[[${c.target}]] — cited by ${c.sources.length}: ${c.sources.map((s) => s.path).join(", ")}`,
    ),
  );
  section(
    "Entity pages to refresh",
    report.refreshes.map(
      (r) =>
        `${r.page} (updated ${r.updated}) — ${r.sources.length} fresher: ${r.sources
          .map((s) => s.path)
          .join(", ")}`,
    ),
  );
  return lines;
}

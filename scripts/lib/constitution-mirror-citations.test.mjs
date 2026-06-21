import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// B (F-B7e) — the dual-link mirror-citation directive must live in EVERY
// constitution template, EN and FR alike. When Claude cites a note that came
// from a local mirror (`vault/mirrors/…`), it must relay BOTH links the
// `search_vault` output already emits — 🧠 the local copy AND 🔗 the source —
// instead of paraphrasing them into one. The directive is the ONLY thing that
// makes Claude relay the links as-is; without it the two emoji-links collapse.
//
// The FR template has carried it since `5d61ce6`; the EN template had NO citation
// directive at all (verified 2026-06-21) — so even a FRESH English brain was
// missing it. This parity test locks both templates so neither can silently drift.
// (Delivering this directive to ALREADY-INSTALLED brains is the separate
// engine-managed-block work; this test only guards the template content.)
// ═══════════════════════════════════════════════════════════════════════════

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

for (const tpl of ["CLAUDE.md.template", "templates/fr/CLAUDE.md.template"]) {
  test(`${tpl} tells Claude to relay BOTH mirror-citation links (🧠 local + 🔗 source)`, () => {
    const text = read(tpl);
    assert.match(text, /🧠/, "must mention the 🧠 local-copy link");
    assert.match(text, /🔗/, "must mention the 🔗 source link");
    assert.match(
      text,
      /vault\/mirrors/,
      "the directive must be scoped to local-mirror notes (vault/mirrors/…)"
    );
  });
}

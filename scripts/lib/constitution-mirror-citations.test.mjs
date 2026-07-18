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
// missing it. This parity test locks the EFFECTIVE constitution so neither locale
// can silently drift. Since the two-layer split (Gate 1 "green"), the directive is
// generic engine machinery → it lives in the CLAUDE.engine.md layer that the thin
// sacred CLAUDE.md.template @imports; the test asserts on the UNION so it stays
// correct wherever the directive sits. (Delivering it to ALREADY-INSTALLED brains
// is the separate engine-managed propagation work; this test guards content only.)
// ═══════════════════════════════════════════════════════════════════════════

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

const CONSTITUTIONS = [
  { locale: "EN", layers: ["CLAUDE.md.template", "CLAUDE.engine.md"] },
  { locale: "FR", layers: ["templates/fr/CLAUDE.md.template", "templates/fr/CLAUDE.engine.md"] },
];

for (const { locale, layers } of CONSTITUTIONS) {
  test(`${locale} constitution tells Claude to relay BOTH mirror-citation links (🧠 local + 🔗 source)`, () => {
    const text = layers.map(read).join("\n");
    assert.match(text, /🧠/, "must mention the 🧠 local-copy link");
    assert.match(text, /🔗/, "must mention the 🔗 source link");
    assert.match(
      text,
      /vault\/mirrors/,
      "the directive must be scoped to local-mirror notes (vault/mirrors/…)"
    );
  });
}

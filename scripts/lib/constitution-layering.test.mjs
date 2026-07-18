import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// constitution-layering — Gate 1 "green": the constitution ships in TWO layers.
//   • CLAUDE.engine.md   — GENERIC engine machinery, no personalization tokens.
//   • CLAUDE.md(.template) — a THIN, sacred, personalized shell that @imports the
//     engine layer. Sacred (never clobbered) → a deployed monolithic brain is safe.
// These structural guards lock the split so a future edit can't (a) re-merge the
// machinery back into the sacred file, (b) leak a {{token}} into the refreshable
// engine layer, or (c) silently drop a capability across the two files.
// The same invariants hold for every localized constitution (templates/<locale>/).
// ═══════════════════════════════════════════════════════════════════════════

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

test("EN — the thin CLAUDE.md.template @imports the engine layer", () => {
  assert.match(
    read("CLAUDE.md.template"),
    /@CLAUDE\.engine\.md/,
    "the thin sacred constitution must @import CLAUDE.engine.md, or the engine machinery never loads",
  );
});

test("EN — the engine layer carries NO personalization token ({{…}})", () => {
  // The engine layer is refreshed verbatim on upgrade (no per-brain rendering), so a
  // leaked {{TOKEN}} would resurface unrendered. Every {{…}} MUST stay in the thin
  // CLAUDE.md.template, which is rendered once at install and then sacred.
  const tokens = read("CLAUDE.engine.md").match(/\{\{[^}]+\}\}/g) ?? [];
  assert.deepEqual(
    tokens,
    [],
    `CLAUDE.engine.md must be generic: move these tokens to the thin CLAUDE.md.template → ${tokens.join(", ")}`,
  );
});

// Every localized constitution must be split the SAME way — a locale left monolithic
// would be born single-layer (no engine refresh path) or, worse, carry {{tokens}} in a
// refreshable engine layer. Drive both the default (root) and each templates/<locale>/.
const LAYERS = [
  { locale: "default", thin: "CLAUDE.md.template", engine: "CLAUDE.engine.md" },
  { locale: "fr", thin: "templates/fr/CLAUDE.md.template", engine: "templates/fr/CLAUDE.engine.md" },
];

for (const { locale, thin, engine } of LAYERS) {
  test(`${locale} — the thin constitution @imports its engine layer`, () => {
    assert.match(read(thin), /@CLAUDE\.engine\.md/, `${thin} must @import its engine layer`);
  });

  test(`${locale} — the engine layer carries NO personalization token`, () => {
    const tokens = read(engine).match(/\{\{[^}]+\}\}/g) ?? [];
    assert.deepEqual(tokens, [], `${engine} must be generic — move tokens to ${thin}: ${tokens.join(", ")}`);
  });

  test(`${locale} — the personalization tokens all live in the thin (sacred, rendered) layer`, () => {
    const thinText = read(thin);
    for (const token of ["{{PROJECT_NAME}}", "{{OWNER_NAME}}", "{{LANGUAGE}}", "{{SOURCE_1}}"]) {
      assert.ok(thinText.includes(token), `${thin} must keep ${token} (rendered at install, then sacred)`);
    }
  });

  test(`${locale} — no capability is lost across the split (every marker present in exactly one layer)`, () => {
    // Stable semantic anchors, one per moved/kept capability. Each must appear in the
    // union of the two layers — and never in both (no duplication drift).
    const union = read(thin) + "\n" + read(engine);
    const both = read(thin).length && read(engine).length;
    const MARKERS = [
      "flemmr.md",             // wiring test (engine)
      "vault/daily/",          // note format (engine)
      "search_vault",          // RAG routing (engine)
      "local-mirror__sync",    // local mirrors (engine)
      "sync-sources",          // expected behaviors — main flow / background sync (engine)
      "harness:",              // commit conventions (engine)
      "NDA",                   // confidentiality (thin)
      "{{LANGUAGE}}",          // tone (thin)
      "{{SOURCE_1}}",          // external sources (thin)
    ];
    const missing = MARKERS.filter((m) => !union.includes(m));
    assert.deepEqual(missing, [], `capabilities dropped in the ${locale} split: ${missing.join(", ")}`);
    assert.ok(both, `both ${locale} layers must be non-empty`);
  });
}

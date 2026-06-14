import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Guard: every generated brain must bake the autocompact threshold into its
// settings (Chantier B, plan post-phase1). The value lives as a STATIC literal
// in the `env` block of .claude/settings.json.template — gen() only substitutes
// {{…}} placeholders, so a literal env block flows through verbatim. We mirror
// that substitution here (the raw template isn't valid JSON until placeholders
// are filled), then parse and assert.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = join(REPO, ".claude", "settings.json.template");

function generatedSettings() {
  let content = readFileSync(TEMPLATE, "utf8");
  const replacements = {
    "{{NODE}}": "node",
    "{{PROJECT_ROOT}}": "/brain",
    "{{TMP_DIR}}": "/tmp",
  };
  for (const [k, v] of Object.entries(replacements)) content = content.split(k).join(v);
  return JSON.parse(content);
}

test("settings template bakes CLAUDE_CODE_AUTO_COMPACT_WINDOW=350000 into env", () => {
  const settings = generatedSettings();
  assert.equal(settings.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "350000");
});

test("the autocompact threshold is a STRING (env values must be strings)", () => {
  const settings = generatedSettings();
  assert.equal(typeof settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "string");
});

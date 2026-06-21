import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// F5 — regression guard. A brain touches Notion two completely different ways:
// the NATIVE Notion connector (live, ad hoc) and the local MIRROR (a one-way local
// copy for the RAG). The field QA confirmed the brain disambiguates them well; this
// guard pins that the `local-mirror` skill keeps naming BOTH modes — in the
// frontmatter description (the trigger surface Claude loads) AND in the body's
// routing copy — so a future edit can't silently collapse the two into one and
// re-introduce the confusion.

// The skill's canonical source relocated to the NON-sacred staged path
// `engine-skills/local-mirror/` (F-B7 2b): the sacred scrub forbids the engine from
// delivering under `.claude/skills/`, so an upgrader-bound skill ships staged and is
// install-if-absent'd into the brain. This guard reads the staged source.
const SKILL = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../engine-skills/local-mirror/SKILL.md"
  ),
  "utf8"
);

// Split off the YAML frontmatter (the description Claude routes on) from the body.
const frontmatter = SKILL.split("---")[1] ?? "";

test("local-mirror skill — the frontmatter trigger names BOTH the native connector and the local mirror", () => {
  // The mirror half (what this skill IS).
  assert.match(frontmatter, /local mirror/i, "frontmatter must name the local mirror");
  // The native-connector half (what this skill is explicitly NOT) — the disambiguation
  // that keeps Claude from onboarding a mirror for a one-off live read.
  assert.match(
    frontmatter,
    /native Notion connector/i,
    "frontmatter must name the native Notion connector as the other mode"
  );
});

test("local-mirror skill — the body routes the two modes explicitly (live/ad-hoc vs durable/offline)", () => {
  assert.match(SKILL, /native Notion connector/i);
  // The durable / offline mirror framing that distinguishes the two.
  assert.match(SKILL, /offline/i);
  // The balanced 2-option disambiguation must stay (one-off/live vs durable/local mirror).
  assert.match(SKILL, /one-off/i);
  assert.match(SKILL, /durable/i);
});

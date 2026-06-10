import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DEMO_BY_LOCALE, DEMO_EXPECT } from "./demo.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// One grep-proof spec per locale. `base` is the vault root for that locale (the
// repo root holds the `en` default; `templates/fr/vault` holds the preserved fr
// vault). `notes` is the cluster carrying the canary answer (Flemmr): a grep must
// reach NONE of them via a question word → that is what makes the proof semantic.
// `stopwords` are the non-distinctive grammatical words excluded from the check,
// and `wordRe` matches content words for that language.
const SPECS = {
  en: {
    base: join(REPO_ROOT, "vault"),
    notes: [
      "decisions/2025-11-20-inertia-trophy.md",
      "topics/flemmr.md",
      "people/jean-kevin-de-la-glandee.md",
    ],
    wordRe: /[a-z]{4,}/g,
    stopwords: new Set([
      "which", "what", "whats", "have", "having", "most", "more", "than", "that",
      "this", "with", "from", "your", "their", "them", "they", "then", "there",
      "here", "only", "also", "some", "such", "each", "very", "just", "like",
      "about", "into", "over", "when", "where", "anyone", "everyone", "anybody",
      "everybody", "will", "would", "could", "should", "been", "were", "been",
    ]),
  },
  fr: {
    base: join(REPO_ROOT, "templates", "fr", "vault"),
    notes: [
      "decisions/2025-11-20-trophee-de-l-inertie.md",
      "topics/flemmr.md",
      "people/jean-kevin-de-la-glandee.md",
    ],
    wordRe: /[a-zàâäéèêëîïôöûüç]{4,}/g,
    stopwords: new Set([
      "quel", "quelle", "quels", "quelles", "depuis", "dans", "avec", "pour",
      "sans", "mais", "donc", "leur", "leurs", "cette", "elle", "elles", "ils",
      "vous", "nous", "être", "avoir", "fait", "plus", "très", "tout", "tous",
    ]),
  },
};

test("DEMO_EXPECT tells a VAULT answer (Mollecuisse) from an admission of ignorance (RAG down)", () => {
  assert.ok(DEMO_EXPECT.test("The winner is Pélagie de Mollecuisse, with a record DNR of 98.7%."));
  assert.ok(!DEMO_EXPECT.test("I have no information about this company in your notes.")); // RAG down
});

for (const [locale, spec] of Object.entries(SPECS)) {
  const question = DEMO_BY_LOCALE[locale];
  const paths = spec.notes.map((rel) => join(spec.base, rel));

  test(`grep-proof (${locale}): no content word of the question appears in the answer cluster`, () => {
    // The invariant that makes the canary a true SEMANTIC proof: if a question
    // word existed in a cluster note, a plain `grep <word> vault/` would lead
    // there — finding "Mollecuisse" would then no longer prove the answer came
    // through meaning. We require an EMPTY intersection between the question's
    // content words and EACH note of the Flemmr cluster.
    assert.ok(typeof question === "string" && question.length > 0, `missing question for locale "${locale}"`);
    for (const p of paths) {
      assert.ok(existsSync(p), `cluster note missing: ${p}`);
    }
    const cluster = paths.map((p) => readFileSync(p, "utf8").toLowerCase());
    const contentWords = (question.toLowerCase().match(spec.wordRe) ?? []).filter(
      (w) => !spec.stopwords.has(w),
    );
    assert.ok(contentWords.length >= 4, "the question must keep enough content words to anchor meaning");
    for (const word of contentWords) {
      for (let i = 0; i < cluster.length; i++) {
        assert.ok(
          !cluster[i].includes(word),
          `"${word}" is in ${paths[i]} → a grep would suffice, this is no longer semantic`,
        );
      }
    }
  });
}

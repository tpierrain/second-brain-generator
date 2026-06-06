import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DEMO_QUESTION, DEMO_EXPECT } from "./demo.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANARI_NOTE = join(REPO_ROOT, "vault", "intel", "2026-01-12-rapport-espion-empire.md");

// Mots grammaticaux FR : non distinctifs, exclus du contrôle grep-proof.
const STOPWORDS = new Set([
  "quel", "quelle", "quels", "quelles", "depuis", "dans", "avec", "pour",
  "sans", "mais", "donc", "leur", "leurs", "cette", "elle", "elles", "ils",
  "vous", "nous", "être", "avoir", "fait", "plus", "très", "tout", "tous",
]);

test("DEMO_EXPECT distingue une réponse DU VAULT (Mahault) d'une réponse du canon (Leia)", () => {
  assert.ok(DEMO_EXPECT.test("Il a deux demi-sœurs jumelles cachées, Ella et Mahault."));
  assert.ok(!DEMO_EXPECT.test("Sa sœur jumelle est Leia Organa.")); // réponse depuis le canon = RAG down
});

test("grep-proof : aucun mot de contenu de la question n'apparaît dans la note de réponse", () => {
  // L'invariant qui fait du canari une vraie preuve SÉMANTIQUE : si un mot de la
  // question existait dans la note, un simple `grep <mot> vault/` la remonterait —
  // retrouver « Mahault » ne prouverait alors plus le passage par le sens. On exige
  // donc une intersection vide entre les mots de contenu de la question et la note.
  const note = readFileSync(CANARI_NOTE, "utf8").toLowerCase();
  const motsContenu = (DEMO_QUESTION.toLowerCase().match(/[a-zàâäéèêëîïôöûüç]{4,}/g) ?? [])
    .filter((m) => !STOPWORDS.has(m));
  assert.ok(motsContenu.length >= 4, "la question doit garder assez de mots de contenu pour ancrer le sens");
  for (const mot of motsContenu) {
    assert.ok(!note.includes(mot), `« ${mot} » est dans la note → un grep suffirait, ce n'est plus sémantique`);
  }
});

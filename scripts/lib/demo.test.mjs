import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DEMO_QUESTION, DEMO_EXPECT } from "./demo.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Le cluster de notes qui porte la réponse canari (Flemmr). Un grep ne doit pouvoir
// atteindre AUCUNE d'elles via un mot de la question → vraie preuve sémantique.
const CANARI_CLUSTER = [
  join(REPO_ROOT, "vault", "decisions", "2025-11-20-trophee-de-l-inertie.md"),
  join(REPO_ROOT, "vault", "topics", "flemmr.md"),
  join(REPO_ROOT, "vault", "people", "jean-kevin-de-la-glandee.md"),
];

// Mots grammaticaux FR : non distinctifs, exclus du contrôle grep-proof.
const STOPWORDS = new Set([
  "quel", "quelle", "quels", "quelles", "depuis", "dans", "avec", "pour",
  "sans", "mais", "donc", "leur", "leurs", "cette", "elle", "elles", "ils",
  "vous", "nous", "être", "avoir", "fait", "plus", "très", "tout", "tous",
]);

test("DEMO_EXPECT distingue une réponse DU VAULT (Mollecuisse) d'un aveu d'ignorance (RAG down)", () => {
  assert.ok(DEMO_EXPECT.test("La lauréate est Pélagie de Mollecuisse, avec un TRF de 98,7 %."));
  assert.ok(!DEMO_EXPECT.test("Je n'ai aucune information sur cette entreprise dans tes notes.")); // RAG down
});

test("grep-proof : aucun mot de contenu de la question n'apparaît dans le cluster de réponse", () => {
  // L'invariant qui fait du canari une vraie preuve SÉMANTIQUE : si un mot de la
  // question existait dans une note du cluster, un simple `grep <mot> vault/` y
  // mènerait — retrouver « Mollecuisse » ne prouverait alors plus le passage par le
  // sens. On exige une intersection vide entre les mots de contenu de la question et
  // CHAQUE note du cluster Flemmr.
  const cluster = CANARI_CLUSTER.map((p) => readFileSync(p, "utf8").toLowerCase());
  const motsContenu = (DEMO_QUESTION.toLowerCase().match(/[a-zàâäéèêëîïôöûüç]{4,}/g) ?? [])
    .filter((m) => !STOPWORDS.has(m));
  assert.ok(motsContenu.length >= 4, "la question doit garder assez de mots de contenu pour ancrer le sens");
  for (const mot of motsContenu) {
    for (let i = 0; i < cluster.length; i++) {
      assert.ok(!cluster[i].includes(mot), `« ${mot} » est dans ${CANARI_CLUSTER[i]} → un grep suffirait, ce n'est plus sémantique`);
    }
  }
});

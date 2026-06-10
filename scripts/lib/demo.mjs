// ─────────────────────────────────────────────────────────────────────────────
// demo.mjs — the CANARY demo question + assertion. Single source of truth,
// shared by the installer (post-flight when a key is set) and verify-rag.mjs
// (post-key check).
//
// The example vault describes a PARODY, INVENTED company (Flemmr, which
// "industrializes procrastination"). It is a THREE-stage canary:
//   1. Routing — the subject is private/invented → Claude has NO answer in memory,
//      so it is forced to call search_vault (unlike a public topic such as Star
//      Wars, which it would answer from memory without ever querying the RAG).
//   2. Provenance — the answer ("Pélagie de Mollecuisse", "DNR 98.7%") exists
//      nowhere else on Earth → if it comes out, it came from the vault.
//   3. Semantics — the question shares NO content word with the answer notes (it
//      describes by synonyms: "overworking", "publicly honored", "loafed the
//      most"; the notes say "Do-Nothing Rate", "Inertia Trophy", "highest DNR").
//      So a `grep` of any question word finds NOTHING → only meaning-based search
//      makes the link. Invariant locked by demo.test.mjs (grep-proof).
// The assertion targets the unique token "Mollecuisse": proof that the right
// content surfaced, not merely that some source was cited.
//
// Locale-aware (cf. demo-locale.mjs): the brain installed with --lang fr gets the
// French question; everything else (the en default at the launcher root) gets the
// English one. The "Mollecuisse" canary token is identical across locales.
// ─────────────────────────────────────────────────────────────────────────────
import { BRAIN_LOCALE } from "./demo-locale.mjs";

export const DEMO_BY_LOCALE = {
  en: "At the outfit that helps folks quit overworking, which worker got publicly honored for having loafed the most of anyone — and at what percentage?",
  fr: "Dans la boîte qui aide les gens à arrêter de se surmener, quel salarié a été mis à l'honneur pour en avoir fichu le moins de tous — et avec quel pourcentage ?",
};

export const DEMO_QUESTION = DEMO_BY_LOCALE[BRAIN_LOCALE] ?? DEMO_BY_LOCALE.en;
export const DEMO_EXPECT = /Mollecuisse/i;

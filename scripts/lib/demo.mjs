// ─────────────────────────────────────────────────────────────────────────────
// demo.mjs — question de démo CANARI + assertion. Source de vérité unique,
// partagée par le bootstrap (post-flight si clé) et verify-rag.mjs (vérif post-clé).
//
// C'est un canari à DEUX étages :
//   1. Provenance — la réponse (deux demi-sœurs cachées, Ella et Mahault) est
//      INTROUVABLE hors du vault (elle contredit le canon Star Wars) → si Claude la
//      sort, c'est qu'il a lu le vault, pas Internet.
//   2. Sémantique — la question ne partage AUCUN mot de contenu avec la note de
//      réponse (Luke y est désigné par paraphrase : « jeune pilote blond qui détruit
//      l'Étoile de la Mort » ; la note dit « Luke Skywalker »). Un `grep` d'un mot de
//      la question sur la note ne remonte donc RIEN → seule la recherche par le sens
//      peut faire le lien. Invariant verrouillé par demo.test.mjs (grep-proof).
// L'assertion porte sur le token unique « Mahault » : preuve que le bon contenu
// remonte, pas juste qu'une source est citée.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_QUESTION =
  "Le jeune pilote blond qui détruit l'Étoile de la Mort a-t-il de la famille qu'on lui a cachée depuis l'enfance ?";
export const DEMO_EXPECT = /Mahault/i;

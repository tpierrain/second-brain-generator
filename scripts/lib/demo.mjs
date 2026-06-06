// ─────────────────────────────────────────────────────────────────────────────
// demo.mjs — question de démo CANARI + assertion. Source de vérité unique,
// partagée par le bootstrap (post-flight si clé) et verify-rag.mjs (vérif post-clé).
//
// C'est un canari : la réponse (deux demi-sœurs cachées, Ella et Mahault) est
// INTROUVABLE hors du vault (elle contredit le canon Star Wars). Et la question ne
// partage AUCUN mot rare avec la note de réponse → seule la recherche SÉMANTIQUE du
// RAG peut faire le lien (un grep échouerait). L'assertion porte sur le token unique
// « Mahault » : preuve que le bon contenu remonte, pas juste qu'une source est citée.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_QUESTION = "Quel est le secret autour de Luke Skywalker ?";
export const DEMO_EXPECT = /Mahault/i;

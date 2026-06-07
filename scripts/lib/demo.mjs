// ─────────────────────────────────────────────────────────────────────────────
// demo.mjs — question de démo CANARI + assertion. Source de vérité unique,
// partagée par l'installeur (post-flight si clé) et verify-rag.mjs (vérif post-clé).
//
// Le vault d'exemple décrit une entreprise PARODIQUE et INVENTÉE (Flemmr, qui
// « industrialise la procrastination »). C'est un canari à TROIS étages :
//   1. Routage — le sujet est privé/inventé → Claude n'a AUCUNE réponse en mémoire,
//      il est donc forcé d'appeler search_vault (contrairement à un sujet public
//      comme Star Wars, qu'il répondait de tête sans interroger le RAG).
//   2. Provenance — la réponse (« Pélagie de Mollecuisse », « TRF 98,7 % ») n'existe
//      nulle part ailleurs sur Terre → si elle sort, c'est qu'elle vient du vault.
//   3. Sémantique — la question ne partage AUCUN mot de contenu avec les notes de
//      réponse (elle décrit par synonymes : « se surmener », « mis à l'honneur »,
//      « en avoir fichu le moins » ; les notes disent « productivité », « Trophée de
//      l'Inertie », « TRF le plus élevé »). Un `grep` d'un mot de la question ne
//      remonte donc RIEN → seule la recherche par le sens fait le lien. Invariant
//      verrouillé par demo.test.mjs (grep-proof).
// L'assertion porte sur le token unique « Mollecuisse » : preuve que le bon contenu
// remonte, pas juste qu'une source est citée.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_QUESTION =
  "Dans la boîte qui aide les gens à arrêter de se surmener, quel salarié a été mis à l'honneur pour en avoir fichu le moins de tous — et avec quel pourcentage ?";
export const DEMO_EXPECT = /Mollecuisse/i;

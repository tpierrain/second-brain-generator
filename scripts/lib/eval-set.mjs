// ─────────────────────────────────────────────────────────────────────────────
// eval-set.mjs — le jeu d'évaluation RAG (Étape 2 du plan embedder).
//
// Source de vérité : 10 questions FR sur le VAULT D'EXEMPLE livré (Flemmr, la boîte
// parodique qui « industrialise la procrastination »). Chaque item = une question en
// langage naturel + la réponse ATTENDUE (ground-truth que la bonne récupération doit
// permettre de donner). Le juge (Claude) ne note QUE si les passages remontés par
// search_vault suffisent à répondre — cf. eval-judge.mjs.
//
// Pourquoi le vault d'exemple et pas un vrai cerveau : il est INVENTÉ (public-safe),
// VERSIONNÉ et REPRODUCTIBLE → la baseline Gemini est rejouable par n'importe qui.
// Pour discriminer finement des embedders (Étape 4), on pourra pointer le même
// harnais sur un corpus plus riche. La 1ʳᵉ question reprend le canari grep-proof de
// demo.mjs (cf. eval-set.test.mjs) pour rester arrimé à la preuve sémantique.
//
// Mélange volontaire : des questions « faciles » (le terme-réponse est dans les notes
// → testent le plancher) et des questions par synonymes (grep-résistantes → testent
// le sens). Un embedder faible décroche sur les secondes.
// ─────────────────────────────────────────────────────────────────────────────
import { DEMO_QUESTION } from "./demo.mjs";

export const EVAL_SET = [
  {
    // Canari grep-proof (cf. demo.mjs) : décrit la réponse par synonymes, aucun mot
    // de contenu partagé avec les notes → seule la recherche sémantique fait le lien.
    question: DEMO_QUESTION,
    expect: "Pélagie de Mollecuisse, avec un Taux de Rien Foutu (TRF) record de 98,7 %.",
  },
  {
    question: "Quel est le seul indicateur suivi par le board de Flemmr ?",
    expect: "Le Taux de Rien Foutu (TRF).",
  },
  {
    question: "Combien Flemmr a-t-elle levé en série A, et pour quoi faire ?",
    expect: "14 M€, levés pour ne rien produire.",
  },
  {
    question: "Qui dirige Flemmr et quel titre porte-t-il ?",
    expect: "Jean-Kévin de la Glandée, fondateur et Chief Inertia Officer.",
  },
  {
    question:
      "Comment s'appelle la récompense annuelle de la personne la plus oisive, et de quand date la décision qui l'a créée ?",
    expect: "Le Trophée de l'Inertie, instauré par la décision du 20 novembre 2025.",
  },
  {
    question: "Quelle conviction personnelle le fondateur défend-il sur le travail ?",
    expect: "Que « la valeur naît du repos ».",
  },
  {
    question: "Quelle offre par abonnement permet de garder son hamac à demeure ?",
    expect: "Le Hamac as a Service (HaaS).",
  },
  {
    question: "Combien coûte le séminaire résidentiel d'oisiveté de Flemmr ?",
    expect: "12 000 € HT (le Séminaire d'Immobilisme en résidentiel).",
  },
  {
    question:
      "Qu'est-ce qui reste à organiser et à acheter dans le backlog, autour du trophée et des séminaires ?",
    expect:
      "Caler la cérémonie de remise du Trophée de l'Inertie, et commander des plaids connectés pour le prochain séminaire d'immobilisme.",
  },
  {
    question: "Quel est le slogan de Flemmr ?",
    expect: "« Ne faites rien. On s'en occupe. »",
  },
];

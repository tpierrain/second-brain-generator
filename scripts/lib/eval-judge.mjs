// ─────────────────────────────────────────────────────────────────────────────
// eval-judge.mjs — cœur PUR de l'eval-set RAG (Étape 2 du plan embedder).
// Le juge est Claude (`claude -p`, en sous-process côté orchestrateur) ; ici on ne
// fait que le déterministe et testable : construire le prompt, lire son verdict,
// agréger en un score chiffré reproductible. Aucune I/O.
// ─────────────────────────────────────────────────────────────────────────────

// Lit le verdict rendu par le juge. Contrat : le juge termine par une ligne
// `VERDICT: PASS` (les passages remontés permettent de répondre) ou `VERDICT: FAIL`.
export function parseVerdict(output) {
  if (/VERDICT:\s*PASS/i.test(output)) return { pass: true };
  if (/VERDICT:\s*FAIL/i.test(output)) return { pass: false };
  return { pass: false, unreadable: true };
}

// Agrège les verdicts d'une passe d'eval en un score chiffré reproductible.
export function scoreEval(results) {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const unreadable = results.filter((r) => r.unreadable).length;
  return { passed, total, unreadable, score: total === 0 ? 0 : passed / total };
}

// Construit le prompt du juge (Claude) : la question, la réponse attendue, les
// passages réellement remontés par search_vault, et la consigne de verdict.
export function buildJudgePrompt(item, retrievedText) {
  return [
    "Tu es un juge d'évaluation RAG. On a posé une question à un moteur de recherche",
    "sémantique sur un vault de notes ; voici la réponse ATTENDUE et les passages",
    "qu'il a réellement remontés. Juge UNIQUEMENT si ces passages contiennent",
    "l'information permettant de répondre correctement (peu importe la formulation).",
    "Ne te fie pas à tes connaissances : seuls les passages comptent.",
    "",
    `Question : ${item.question}`,
    `Réponse attendue : ${item.expect}`,
    "",
    "Passages remontés :",
    retrievedText,
    "",
    "Termine ta réponse par une ligne EXACTEMENT au format suivant :",
    "VERDICT: PASS  (si les passages suffisent à répondre)",
    "VERDICT: FAIL  (s'ils ne suffisent pas)",
  ].join("\n");
}

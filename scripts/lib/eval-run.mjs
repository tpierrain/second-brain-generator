// ─────────────────────────────────────────────────────────────────────────────
// eval-run.mjs — orchestration PURE de l'eval-set : pour chaque item, recherche
// (search), construction du prompt, jugement (judge = Claude), lecture du verdict,
// puis agrégation en un score. `search` et `judge` sont INJECTÉS → testable sans
// spawner MCP ni `claude`. L'exécutable run-eval.mjs câble les vraies impls.
// ─────────────────────────────────────────────────────────────────────────────
import { buildJudgePrompt, parseVerdict, scoreEval } from "./eval-judge.mjs";

export async function runEval({ items, search, judge }) {
  const found = await search(items.map((it) => it.question));

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const retrieved = found[i].text;
    const output = await judge(buildJudgePrompt(item, retrieved));
    const verdict = parseVerdict(output);
    results.push({ question: item.question, expect: item.expect, retrieved, ...verdict });
  }

  return { ...scoreEval(results), results };
}

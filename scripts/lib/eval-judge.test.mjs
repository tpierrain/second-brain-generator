import { test } from "node:test";
import assert from "node:assert/strict";

import { parseVerdict, scoreEval, buildJudgePrompt } from "./eval-judge.mjs";

const ITEM = {
  question: "Qui a remporté le Trophée de l'Inertie 2025 ?",
  expect: "Pélagie de Mollecuisse, avec un TRF de 98,7 %.",
};
const RETRIEVED = "### 1. Trophée de l'Inertie — Conséquences\nPélagie de Mollecuisse, TRF 98,7 %.";

test("parseVerdict lit un PASS dans la sortie du juge", () => {
  assert.deepEqual(parseVerdict("Les passages contiennent la réponse.\nVERDICT: PASS"), {
    pass: true,
  });
});

test("parseVerdict lit un FAIL dans la sortie du juge", () => {
  assert.deepEqual(parseVerdict("Le bon passage manque.\nVERDICT: FAIL"), {
    pass: false,
  });
});

test("parseVerdict signale un verdict illisible (ni PASS ni FAIL)", () => {
  // Juge planté / sortie vide : on NE compte pas un FAIL silencieux (fausserait le
  // score) → on marque indéterminé pour que l'eval le remonte bruyamment.
  assert.deepEqual(parseVerdict("blah blah sans verdict"), {
    pass: false,
    unreadable: true,
  });
});

test("scoreEval agrège un seul PASS en score 1", () => {
  assert.deepEqual(scoreEval([{ pass: true }]), {
    passed: 1,
    total: 1,
    unreadable: 0,
    score: 1,
  });
});

test("scoreEval compte les illisibles dans le total et calcule le ratio", () => {
  const results = [{ pass: true }, { pass: false }, { pass: false, unreadable: true }];
  assert.deepEqual(scoreEval(results), {
    passed: 1,
    total: 3,
    unreadable: 1,
    score: 1 / 3,
  });
});

test("scoreEval sur une liste vide donne 0, pas NaN", () => {
  assert.deepEqual(scoreEval([]), { passed: 0, total: 0, unreadable: 0, score: 0 });
});

test("buildJudgePrompt inclut la question à juger", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(ITEM.question));
});

test("buildJudgePrompt inclut la réponse attendue", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(ITEM.expect));
});

test("buildJudgePrompt inclut les passages remontés par la recherche", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(RETRIEVED));
});

test("buildJudgePrompt impose le format de verdict attendu par parseVerdict", () => {
  const prompt = buildJudgePrompt(ITEM, RETRIEVED);
  assert.ok(prompt.includes("VERDICT: PASS"));
  assert.ok(prompt.includes("VERDICT: FAIL"));
});

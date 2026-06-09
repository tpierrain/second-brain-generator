#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// run-eval.mjs — eval-set RAG (Étape 2 du plan embedder). À lancer DEPUIS le repo,
// avec une clé Gemini dans .env (la recherche embedde les questions).
//
// (Ré)indexe le vault d'exemple, puis pour chaque question de l'eval-set : lance
// search_vault (via le VRAI serveur MCP vault-rag) et fait JUGER par Claude (`claude
// -p`) si les passages remontés suffisent à répondre. Sortie : un SCORE chiffré
// reproductible = la baseline de l'embedder courant (Gemini).
//
//   exit 0 = eval menée à bien (le score, lui, peut être bas — c'est une MESURE).
//   exit 1 = échec OPÉRATIONNEL (pas de clé, index KO, MCP mort, juge illisible)
//            → on relaie l'erreur, on ne publie pas un score invalide.
//
// Le cœur (prompt/verdict/score/orchestration) est pur et testé : eval-judge.mjs,
// eval-run.mjs, mcp-search.mjs. Ici = uniquement le câblage I/O.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { hasGeminiKey } from "./lib/gemini-key.mjs";
import { mcpSearch } from "./lib/mcp-search.mjs";
import { runEval } from "./lib/eval-run.mjs";
import { EVAL_SET } from "./lib/eval-set.mjs";

const tty = process.stdout.isTTY;
const c = {
  G: tty ? "\x1b[32m" : "", R: tty ? "\x1b[31m" : "", Y: tty ? "\x1b[33m" : "",
  B: tty ? "\x1b[1m" : "", X: tty ? "\x1b[0m" : "",
};
const ok = (m) => console.log(`${c.G}✓${c.X} ${m}`);
const err = (m) => console.error(`${c.R}✗${c.X} ${m}`);
const step = (m) => console.log(`\n${c.B}━━ ${m}${c.X}`);

const ROOT = process.cwd();
const rag = join(ROOT, "rag");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL; // optionnel : pinner un modèle (ex. haiku)

// 1. Clé Gemini : la recherche embedde chaque question → sans elle, rien à mesurer.
const envPath = join(ROOT, ".env");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
if (!hasGeminiKey(envContent)) {
  err("Pas de clé Gemini dans .env — impossible d'embedder les questions de l'eval.");
  err(`Colle ta clé dans ${envPath} (GOOGLE_GEMINI_API_KEY=) puis relance : node scripts/run-eval.mjs`);
  process.exit(1);
}

// 2. Indexation bloquante — l'eval mesure le retrieval sur un index frais.
step("Indexation du vault");
const idx = spawnSync(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit" });
if (idx.status !== 0) {
  err("Indexation échouée (clé invalide ? quota ? réseau ?) — voir SETUP.md §8/§9.");
  process.exit(1);
}
ok("vault indexé");

// 3. Serveur MCP vault-rag (le vrai contrat de recherche). Si un .mcp.json est là
//    (cerveau installé) on l'utilise tel quel ; sinon (launcher) on lance le serveur
//    RAG directement → l'eval reste rejouable sur le vault d'exemple Flemmr.
let srv;
const mcpPath = join(ROOT, ".mcp.json");
if (existsSync(mcpPath)) {
  try {
    srv = JSON.parse(readFileSync(mcpPath, "utf8")).mcpServers?.["vault-rag"];
  } catch (e) {
    err(`.mcp.json illisible (${e.message}).`);
    process.exit(1);
  }
}
if (!srv) {
  srv = { command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: ROOT };
}

const search = (queries) =>
  mcpSearch({ command: srv.command, args: srv.args ?? [], cwd: srv.cwd ?? ROOT, queries, timeoutMs: 120000 });

// Juge = Claude en sous-process (`claude -p`). Prompt sur stdin (robuste aux retours
// ligne / caractères spéciaux). Échec de spawn ou status ≠ 0 → on lève (fail-loud).
const judge = async (prompt) => {
  const args = JUDGE_MODEL ? ["-p", "--model", JUDGE_MODEL] : ["-p"];
  const res = spawnSync("claude", args, { input: prompt, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (res.error) {
    if (res.error.code === "ENOENT") throw new Error("CLI `claude` introuvable dans le PATH — installe Claude Code.");
    throw res.error;
  }
  if (res.status !== 0) throw new Error(`\`claude -p\` a échoué (code ${res.status}) : ${(res.stderr ?? "").trim()}`);
  return res.stdout ?? "";
};

// 4. Dérouler l'eval.
step(`Eval-set : ${EVAL_SET.length} questions — recherche + jugement Claude`);
let report;
try {
  report = await runEval({ items: EVAL_SET, search, judge });
} catch (e) {
  err(`Eval interrompue : ${e.message}`);
  process.exit(1);
}

// 5. Rapport.
console.log("");
for (const r of report.results) {
  const mark = r.unreadable ? `${c.Y}?${c.X}` : r.pass ? `${c.G}✓${c.X}` : `${c.R}✗${c.X}`;
  console.log(`  ${mark} ${r.question}`);
}
step("Score");
const pct = (report.score * 100).toFixed(1);
console.log(`  ${c.B}${report.passed}/${report.total}${c.X} questions répondues depuis le vault — score ${c.B}${pct}%${c.X}  (embedder courant : Gemini)`);

if (report.unreadable > 0) {
  err(`${report.unreadable} verdict(s) illisible(s) → mesure invalide. Le juge n'a pas suivi le format VERDICT: PASS/FAIL.`);
  process.exit(1);
}
ok("Eval terminée — score reproductible (baseline).");
process.exit(0);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// run-eval.mjs — RAG eval-set (Step 2 of the embedder plan). Run FROM the repo, with
// a Gemini key in .env (search embeds the questions).
//
// (Re)indexes the example vault, then for each eval-set question: runs search_vault
// (via the REAL vault-rag MCP server) and has Claude JUDGE (`claude -p`) whether the
// returned passages are enough to answer. Output: a reproducible numeric SCORE = the
// baseline of the current embedder (Gemini).
//
//   exit 0 = eval carried out (the score itself may be low — it is a MEASUREMENT).
//   exit 1 = OPERATIONAL failure (no key, broken index, dead MCP, unreadable judge)
//            → we relay the error, we do not publish an invalid score.
//
// The core (prompt/verdict/score/orchestration) is pure and tested: eval-judge.mjs,
// eval-run.mjs, mcp-search.mjs. Here = only the I/O wiring.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { hasGeminiKey } from "./lib/gemini-key.mjs";
import { mcpSearch } from "./lib/mcp-search.mjs";
import { needsShell } from "./lib/spawn-shell.mjs";
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
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL; // optional: pin a model (e.g. haiku)

// 1. Gemini key: search embeds each question → without it, nothing to measure.
const envPath = join(ROOT, ".env");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
if (!hasGeminiKey(envContent)) {
  err("No Gemini key in .env — cannot embed the eval questions.");
  err(`Paste your key into ${envPath} (GOOGLE_GEMINI_API_KEY=) then rerun: node scripts/run-eval.mjs`);
  process.exit(1);
}

// 2. Blocking indexing — the eval measures retrieval against a fresh index.
step("Indexing the vault");
// npm.cmd needs a shell since Node ≥ 18.20 (CVE-2024-27980) or EINVAL; no-op POSIX (ADR 0031).
const idx = spawnSync(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit", shell: needsShell(NPM, process.platform) });
if (idx.status !== 0) {
  err("Indexing failed (invalid key? quota? network?) — see SETUP.md §8/§9.");
  process.exit(1);
}
ok("vault indexed");

// 3. vault-rag MCP server (the real search contract). If a .mcp.json is present
//    (brain installed) we use it as-is; otherwise (launcher) we start the RAG server
//    directly → the eval stays replayable on the Flemmr example vault.
let srv;
const mcpPath = join(ROOT, ".mcp.json");
if (existsSync(mcpPath)) {
  try {
    srv = JSON.parse(readFileSync(mcpPath, "utf8")).mcpServers?.["vault-rag"];
  } catch (e) {
    err(`.mcp.json unreadable (${e.message}).`);
    process.exit(1);
  }
}
if (!srv) {
  srv = { command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: ROOT };
}

const search = (queries) =>
  mcpSearch({ command: srv.command, args: srv.args ?? [], cwd: srv.cwd ?? ROOT, queries, timeoutMs: 120000 });

// Judge = Claude in a subprocess (`claude -p`). Prompt on stdin (robust to line
// breaks / special characters). Spawn failure or status ≠ 0 → we throw (fail-loud).
const judge = async (prompt) => {
  const args = JUDGE_MODEL ? ["-p", "--model", JUDGE_MODEL] : ["-p"];
  const res = spawnSync("claude", args, { input: prompt, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (res.error) {
    if (res.error.code === "ENOENT") throw new Error("`claude` CLI not found in PATH — install Claude Code.");
    throw res.error;
  }
  if (res.status !== 0) throw new Error(`\`claude -p\` failed (code ${res.status}): ${(res.stderr ?? "").trim()}`);
  return res.stdout ?? "";
};

// 4. Run the eval.
step(`Eval-set: ${EVAL_SET.length} questions — search + Claude judgment`);
let report;
try {
  report = await runEval({ items: EVAL_SET, search, judge });
} catch (e) {
  err(`Eval interrupted: ${e.message}`);
  process.exit(1);
}

// 5. Report.
console.log("");
for (const r of report.results) {
  const mark = r.unreadable ? `${c.Y}?${c.X}` : r.pass ? `${c.G}✓${c.X}` : `${c.R}✗${c.X}`;
  console.log(`  ${mark} ${r.question}`);
}
step("Score");
const pct = (report.score * 100).toFixed(1);
console.log(`  ${c.B}${report.passed}/${report.total}${c.X} questions answered from the vault — score ${c.B}${pct}%${c.X}  (current embedder: Gemini)`);

if (report.unreadable > 0) {
  err(`${report.unreadable} unreadable verdict(s) → invalid measurement. The judge did not follow the VERDICT: PASS/FAIL format.`);
  process.exit(1);
}
ok("Eval finished — reproducible score (baseline).");
process.exit(0);

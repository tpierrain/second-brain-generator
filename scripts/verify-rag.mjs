#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-rag.mjs — to run FROM the brain folder, AFTER pasting the Gemini key
// into .env (the key is never there at install time).
//
// (Re)indexes the sample vault, then proves in a DETERMINISTIC and LOUD way that
// the demo question answers FROM the vault — by requiring the unique canary token
// "Mollecuisse" (not found outside the vault). This is the post-key failure-catch B:
//   exit 0 = the brain really works; exit 1 = failure, to relay as-is.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { smokeTestMcp } from "./lib/mcp-smoke.mjs";
import { hasGeminiKey, geminiKeyRequired } from "./lib/gemini-key.mjs";
import { DEMO_QUESTION, DEMO_EXPECT } from "./lib/demo.mjs";

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
const EXPECT_TOOLS = ["search_vault", "get_document", "list_documents", "vault_stats"];

// 1. Key present? — ONLY if the chosen embedder is Gemini. Local embedders
//    (in-process "Gemma inside" / Ollama) and OpenAI-compatible endpoints have
//    no Gemini key: the check then makes full sense without it (the Mollecuisse
//    canary passes in-process too). We delegate to the index the detection of an
//    incomplete alternative config (loud failure at step 2).
const envPath = join(ROOT, ".env");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
if (geminiKeyRequired(envContent) && !hasGeminiKey(envContent)) {
  err("No Gemini key in .env — cannot verify the RAG.");
  err(`Paste your key into ${envPath} (line GOOGLE_GEMINI_API_KEY=) then re-run: node scripts/verify-rag.mjs`);
  process.exit(1);
}

// 2. Blocking indexing — separates "index KO" (invalid key / quota / network)
//    from "retrieval KO" (the RAG answers but not from the vault).
step("Indexing the vault");
const idx = spawnSync(NPM, ["run", "--silent", "index"], {
  cwd: rag,
  stdio: "inherit",
  // No OS toast during deterministic verification (the notify seam honours this).
  env: { ...process.env, SBG_NO_NOTIFY: "1" },
});
if (idx.status !== 0) {
  err("Indexing failed (invalid key? Gemini quota? network?) — see SETUP.md §8/§9.");
  process.exit(1);
}
ok("vault indexed");

// 3. Canary probe — LOUD.
step("Verification: does the demo answer FROM the vault?");
let srv;
try {
  const mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  srv = mcp.mcpServers?.["vault-rag"];
} catch (e) {
  err(`.mcp.json unreadable (${e.message}) — re-run the installer from the launcher?`);
  process.exit(1);
}
if (!srv) {
  err(".mcp.json without a \"vault-rag\" server.");
  process.exit(1);
}

const res = await smokeTestMcp({
  command: srv.command,
  args: srv.args ?? [],
  cwd: srv.cwd ?? ROOT,
  expectTools: EXPECT_TOOLS,
  timeoutMs: 60000,
  probe: { tool: "search_vault", args: { query: DEMO_QUESTION }, expectText: DEMO_EXPECT },
});

if (res.ok) {
  ok("RAG verified — the demo answers FROM the vault (canary Pélagie de Mollecuisse found).");
  console.log(`  You can open Claude Code and ask: "${DEMO_QUESTION}"`);
  process.exit(0);
}

err(`RAG VERIFY FAILED — the demo does NOT answer from the vault: ${res.error ?? "unknown reason"}`);
err("The RAG doesn't surface the fact unfindable outside the vault (canary). Troubleshooting: SETUP.md §8.");
process.exit(1);

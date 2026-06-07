#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-rag.mjs — à lancer DEPUIS le dossier cerveau, APRÈS avoir collé la clé
// Gemini dans .env (la clé n'est jamais là au moment de l'installation).
//
// (Ré)indexe le vault d'exemple, puis prouve de façon DÉTERMINISTE et BRUYANTE que
// la question de démo répond DEPUIS le vault — en exigeant le token canari unique
// « Mollecuisse » (introuvable hors-vault). C'est l'attrape-panne-B post-clé :
//   exit 0 = le cerveau marche vraiment ; exit 1 = échec, à relayer tel quel.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { smokeTestMcp } from "./lib/mcp-smoke.mjs";
import { hasGeminiKey } from "./lib/gemini-key.mjs";
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

// 1. Clé présente ? (la vérif n'a aucun sens sans elle)
const envPath = join(ROOT, ".env");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
if (!hasGeminiKey(envContent)) {
  err("Pas de clé Gemini dans .env — impossible de vérifier le RAG.");
  err(`Colle ta clé dans ${envPath} (ligne GOOGLE_GEMINI_API_KEY=) puis relance : node scripts/verify-rag.mjs`);
  process.exit(1);
}

// 2. Indexation bloquante — sépare « index KO » (clé invalide / quota / réseau)
//    de « retrieval KO » (le RAG répond mais pas depuis le vault).
step("Indexation du vault");
const idx = spawnSync(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit" });
if (idx.status !== 0) {
  err("Indexation échouée (clé invalide ? quota Gemini ? réseau ?) — voir SETUP.md §8/§9.");
  process.exit(1);
}
ok("vault indexé");

// 3. Probe canari — BRUYANT.
step("Vérification : la démo répond-elle DEPUIS le vault ?");
let srv;
try {
  const mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  srv = mcp.mcpServers?.["vault-rag"];
} catch (e) {
  err(`.mcp.json illisible (${e.message}) — relance l'installeur depuis le launcher ?`);
  process.exit(1);
}
if (!srv) {
  err(".mcp.json sans serveur « vault-rag ».");
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
  ok("RAG vérifié — la démo répond DEPUIS le vault (canari Pélagie de Mollecuisse retrouvé).");
  console.log(`  Tu peux ouvrir Claude Code et poser : « ${DEMO_QUESTION} »`);
  process.exit(0);
}

err(`VÉRIF RAG ÉCHEC — la démo ne répond PAS depuis le vault : ${res.error ?? "raison inconnue"}`);
err("Le RAG ne ressort pas le fait introuvable hors-vault (canari). Dépannage : SETUP.md §8.");
process.exit(1);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-rag.mjs — to run FROM the brain folder, AFTER pasting the Gemini key
// into .env (the key is never there at install time).
//
// (Re)indexes the sample vault, then proves in a DETERMINISTIC and LOUD way that
// the brain answers FROM the vault — a HEADLESS, read-only full health-check (real
// embed + search of the dedicated "Quibblethorne" canary, ADR 0030 §3/§4/§6, F7-ter).
// It NEVER boots a 2nd vault-rag: Thomas runs this while the live server is up, so we
// read the on-disk data headless instead of spawning a duplicate process. This is the
// post-key failure-catch B:
//   exit 0 = the brain really works; exit 1 = failure, to relay as-is.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { hasGeminiKey, geminiKeyRequired } from "./lib/gemini-key.mjs";
import { DEMO_QUESTION } from "./lib/demo.mjs";
import { runActivatedHealthChecks } from "./lib/health-check-runner.mjs";
import { buildHeadlessHealthCheckCaller } from "./lib/headless-health-check.mjs";
import { gateBlockers } from "./lib/health-check-gate.mjs";
import { needsShell } from "./lib/spawn-shell.mjs";

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
  // npm.cmd needs a shell since Node ≥ 18.20 (CVE-2024-27980) or EINVAL; no-op POSIX (ADR 0031).
  shell: needsShell(NPM, process.platform),
  // No OS toast during deterministic verification (the notify seam honours this).
  env: { ...process.env, SBG_NO_NOTIFY: "1" },
});
if (idx.status !== 0) {
  err("Indexing failed (invalid key? Gemini quota? network?) — see SETUP.md §8/§9.");
  process.exit(1);
}
ok("vault indexed");

// 3. Health-check probe — LOUD, HEADLESS, read-only (ADR 0030 §4/§6, F7-ter). The
//    SAME health-check definition (rag/src/health-check-cli.ts) the installer post-flight
//    runs, but read HEADLESS at FULL depth — NEVER booting a 2nd vault-rag next to the
//    live one. For vault-rag that proves the brain answers FROM the vault (dedicated
//    "Quibblethorne" canary found via a real embed+search + index intact + embedder
//    ready). A module with no headless reader (local-mirror) stays `unknown` and is not
//    booted. The gate blocks on any `broken` module and on a MANDATORY module that's
//    `unknown` — but an unconfigured OPTIONAL module stays `unknown` and is benign.
step("Verification: is the brain operational? (headless full health-check)");
let mcp;
try {
  mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
} catch (e) {
  err(`.mcp.json unreadable (${e.message}) — re-run the installer from the launcher?`);
  process.exit(1);
}
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, "engine-manifest.json"), "utf8"));
} catch (e) {
  err(`engine-manifest.json unreadable (${e.message}) — re-run the installer from the launcher?`);
  process.exit(1);
}

const { isRegistered, callHealthCheck } = buildHeadlessHealthCheckCaller({
  mcpServers: mcp.mcpServers,
  brainDir: ROOT,
  platform: process.platform,
  // FULL depth: a real embed + search of the canary (deliberate, on-demand — the extra
  // ONNX/API cost is fine here, unlike the per-session light probe). Headless: no boot.
  depth: "full",
});
const verdict = await runActivatedHealthChecks({ manifest, isRegistered, callHealthCheck });
const blockers = gateBlockers(verdict, manifest);

if (blockers.length === 0) {
  ok("Brain verified — every activated module's health_check is green");
  ok("  (vault-rag: demo answers FROM the vault, canary Quibblethorne found, index intact, embedder ready).");
  // Surface non-blocking, non-ok optional modules as a soft note (never a failure, #3):
  // an `unknown` optional is simply unconfigured; a `broken` optional is degraded and
  // deserves a louder, accurate line (it is NOT just "not configured").
  for (const m of verdict.modules) {
    if (m.status === "broken") {
      const bad = (m.checks ?? []).filter((ch) => ch.status !== "ok");
      const why = bad.length ? bad.map((ch) => `${ch.name}: ${ch.detail}`).join("; ") : m.status;
      console.log(`  ${c.Y}⚠${c.X} ${m.module}: optional capability is BROKEN (not blocking) — ${why}`);
    } else if (m.status !== "ok") {
      console.log(`  ${c.Y}·${c.X} ${m.module}: ${m.status} (optional, not configured) — skipped`);
    }
  }
  console.log(`  You can open Claude Code and ask: "${DEMO_QUESTION}"`);
  process.exit(0);
}

err("BRAIN VERIFY FAILED — a required health_check is not green:");
for (const m of blockers) {
  const bad = (m.checks ?? []).filter((ch) => ch.status !== "ok");
  const why = bad.length ? bad.map((ch) => `${ch.name}: ${ch.detail}`).join("; ") : m.status;
  err(`  • ${m.module} → ${m.status} — ${why}`);
}
err("Troubleshooting: SETUP.md §8.");
process.exit(1);

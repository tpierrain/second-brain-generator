#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// session-status.mjs — computes 2-3 startup status lines (repo + RAG) and emits
// them via the SessionStart hook's JSON `systemMessage` field, which DISPLAYS
// them DIRECTLY in the CLI terminal, without relying on Claude to copy them.
// Deterministic startup: all the computation AND the display happen here.
// NB: `systemMessage` is NOT rendered by the Code tab of Claude Desktop — it's
// `statusLine` (cf. scripts/status-line.mjs) that covers the deterministic
// display on the Desktop side and the persistent status. The hook also keeps its
// side effect: the startup sync `git pull --rebase` (which statusLine NEVER does).
//
// Called by the SessionStart hook (cf. .claude/settings.json).
// Cross-OS: pure Node, no bash/jq/sqlite3-CLI dependency.
//   - git via child_process
//   - .md counting via fs
//   - DB reading via better-sqlite3 (already installed in rag/node_modules);
//     degrades gracefully if the module is not loadable.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasGeminiKey, geminiKeyRequired } from "./lib/gemini-key.mjs";
import { repoStatusLine, countVaultUncommitted } from "./lib/repo-status.mjs";
import { bootstrapSessionHooks } from "./lib/hook-bootstrap.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const VAULT = join(REPO, "vault");
const DB_PATH = join(REPO, "rag", ".cache", "vault.db");
const ENV_PATH = join(REPO, ".env");

// Runs git and returns { out, ok } without ever throwing (stderr included).
function git(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out: out ?? "", ok: true };
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return { out, ok: false };
  }
}

// ─── Repo line: git pull --rebase + status derivation ────────────────────────
// (silent if no remote configured — purely local usage)
const hasRemote = git(["remote"]).out.trim().length > 0;
let pullOut = "already up to date";
let pullOk = true;
if (hasRemote) {
  const r = git(["pull", "--rebase"]);
  pullOut = r.out;
  pullOk = r.ok;
}
const short = git(["rev-parse", "--short", "HEAD"]).out.trim();

// Fail-loud guardrail: uncommitted vault notes at startup = a previous
// auto-commit didn't run (silent hooks?). repoStatusLine turns this into a
// priority alert (cf. scripts/lib/repo-status.mjs).
const uncommittedVault = countVaultUncommitted(git(["status", "--porcelain"]).out);
const changedCount =
  pullOk && !/already up to date|déjà à jour/i.test(pullOut)
    ? git(["diff", "--name-only", "ORIG_HEAD", "HEAD"]).out
        .split("\n")
        .filter((l) => l.trim().length > 0).length
    : 0;
const repoLine = repoStatusLine({ pullOk, pullOut, short, changedCount, uncommittedVault });

// ─── RAG line: docCount (db) vs .md files on disk ────────────────────────────
function countMarkdown(dir) {
  let n = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += countMarkdown(p);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) n++;
  }
  return n;
}
const scanned = countMarkdown(VAULT);

let docs = null;
if (existsSync(DB_PATH)) {
  try {
    // better-sqlite3 lives in rag/node_modules → require resolved from rag/.
    const require = createRequire(join(REPO, "rag", "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    docs = db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;
    db.close();
  } catch {
    docs = null; // degrades: module absent, DB being written, etc.
  }
}

let ragLine;
if (docs === null || scanned === 0) {
  if (scanned === 0) {
    ragLine =
      "🧠 RAG: empty vault — add Markdown notes in vault/ then run 'cd rag && npm run reindex'.";
  } else {
    ragLine = "🧠 RAG: status unavailable (server starting up, or engine not installed).";
  }
} else {
  const remaining = scanned - docs;
  ragLine =
    remaining <= 0
      ? `🧠 RAG up to date — ${docs}/${scanned} files indexed.`
      : `🧠 RAG: ${docs}/${scanned} files indexed, ${remaining} pending — auto catch-up in the background.`;
}

// ─── Gemini key line: flag if it's missing (the RAG can't answer) ────────────
// Read on every startup: if the user launched Claude Code BEFORE pasting their
// key, we flag it and remind them they just need to paste it then re-ask their
// question (the server re-reads .env on the fly — no need to reconnect).
// We only alert IF the chosen embedder needs a Gemini key: an in-process vault
// ("Gemma inside") or one on an OpenAI-compatible endpoint needs none.
let keyLine = null;
const envContent = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : null;
if (geminiKeyRequired(envContent) && !hasGeminiKey(envContent)) {
  keyLine =
    "⚠️ Gemini key missing from .env → the RAG can't answer. Paste it into " +
    ".env (GOOGLE_GEMINI_API_KEY=…) then re-ask your question (the server re-reads " +
    "it on its own). If it persists, reconnect the MCP (/mcp) or restart Claude Code.";
}

// ─── Bootstrap tick (ADR 0026): the one-time pre-3.2 → v3.3.0 hook wiring ─────
// session-status is the ONLY SessionStart hook a pre-3.2 brain has wired, so it is the
// anchor that wires the v3.3.0 runtime trio (self-heal / health / obsidian-hint). It
// detects the drift (settings.json vs the now-current template), and — only if a gap
// exists — spawns the detached reconcile ONCE + emits one belt line. Converged → no-op,
// no spawn. Fail-soft: a broken bootstrap NEVER blocks session start. The same reconcile
// CLI the self-heal spawns; sourceDir === brainDir (local converge, no fetch).
// TODO(step 4): localize this line via the BRAIN_LOCALE message catalog.
const BOOTSTRAP_LINE =
  "⚠️ One-time engine update — wiring your brain's new self-healing in the background. " +
  "RESTART Claude once (close it and reopen) and everything's in place. Nothing else to do.";
let bootstrapLine = null;
try {
  const settingsPath = join(REPO, ".claude", "settings.json");
  const templatePath = join(REPO, ".claude", "settings.json.template");
  if (existsSync(settingsPath) && existsSync(templatePath)) {
    const brainHooks = JSON.parse(readFileSync(settingsPath, "utf8")).hooks ?? {};
    const templateHooks = JSON.parse(readFileSync(templatePath, "utf8")).hooks ?? {};
    const reconcileCli = join(__dirname, "lib", "reconcile-brain.mjs");
    const r = bootstrapSessionHooks({
      brainHooks,
      templateHooks,
      brainDir: REPO,
      message: BOOTSTRAP_LINE,
      spawnReconcile: ({ brainDir }) => {
        const child = spawn(
          process.execPath,
          [reconcileCli, "--brainDir", brainDir, "--sourceDir", brainDir, "--platform", process.platform],
          // detached + unref → outlives the hook; windowsHide → no console flash (ADR 0015).
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        child.unref();
      },
      emit: (msg) => (bootstrapLine = msg),
    });
    void r;
  }
} catch {
  bootstrapLine = null; // fail-soft: never block session start over a bootstrap hiccup
}

// ─── Emission via systemMessage: displays directly in the terminal ───────────
const systemMessage = [bootstrapLine, keyLine, repoLine, ragLine].filter(Boolean).join("\n");
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart" },
    systemMessage,
  }) + "\n"
);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// status-line.mjs — produces ONE status line for Claude Code's `statusLine`
// (cf. .claude/settings.json). DETERMINISTIC and PERSISTENT display, rendered
// natively on both surfaces (CLI terminal AND Claude Desktop's Code tab) —
// unlike the SessionStart hook's `systemMessage`, ignored by Desktop.
//
// statusLine contract: reads a session JSON on stdin (ignored here), writes ONE
// line to stdout. Re-run continuously → must stay FAST, READ-ONLY and
// IDEMPOTENT: never a `git pull`, never a write (that's the role of the
// SessionStart hook, run once at startup).
//
// Cross-OS: pure Node, no bash/jq/sqlite3-CLI dependency.
//   - git via child_process (read-only: branch, short SHA, cleanliness)
//   - .md counting via fs
//   - RAG DB reading via better-sqlite3 (in rag/node_modules); degrades
//     gracefully if the module/DB is not loadable.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasGeminiKey } from "./lib/gemini-key.mjs";
import { formatEngineVersion } from "./lib/engine-version.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const VAULT = join(REPO, "vault");
const DB_PATH = join(REPO, "rag", ".cache", "vault.db");
const ENV_PATH = join(REPO, ".env");
const MANIFEST_PATH = join(REPO, "engine-manifest.json");

// Runs git read-only and returns the output (empty string on failure).
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

// ─── Git segment: branch + short SHA + "uncommitted changes" marker ──────────
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "?";
const short = git(["rev-parse", "--short", "HEAD"]) || "?";
const dirty = git(["status", "--porcelain"]).length > 0 ? "*" : "";
const gitSeg = `⎇ ${branch} ${short}${dirty}`;

// ─── RAG segment: docCount (db) vs .md files on disk ─────────────────────────
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
    const require = createRequire(join(REPO, "rag", "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    docs = db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;
    db.close();
  } catch {
    docs = null; // degrades: module absent, DB being written, etc.
  }
}

let ragSeg;
if (scanned === 0) {
  ragSeg = "🧠 RAG empty";
} else if (docs === null) {
  ragSeg = "🧠 RAG ?";
} else {
  const remaining = scanned - docs;
  ragSeg = remaining <= 0 ? `🧠 RAG ${docs}/${scanned}` : `🧠 RAG ${docs}/${scanned} (${remaining}⏳)`;
}

// ─── Key segment: STRONG flag if the Gemini key is missing (RAG inoperative) ──
const envContent = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : null;
const keySeg = hasGeminiKey(envContent) ? null : "⚠️ Gemini key missing";

// ─── Engine segment: the brain's pinned version, read OFFLINE from the manifest
// (ADR 0017). Pure file read — fail-silent: no manifest / unparseable → no
// segment. The "update available" suffix is DEFERRED (read from a cache later).
function readEngineSeg() {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return formatEngineVersion(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
  } catch {
    return null;
  }
}
const engineSeg = readEngineSeg();

// ─── A single line, segments separated by "·" ────────────────────────────────
process.stdout.write([gitSeg, ragSeg, engineSeg, keySeg].filter(Boolean).join(" · "));

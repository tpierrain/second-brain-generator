#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// session-status.mjs — calcule 2 lignes de statut de démarrage (repo + RAG) et
// les émet via le champ JSON `systemMessage` du hook SessionStart, ce qui les
// AFFICHE DIRECTEMENT sur le terminal, sans dépendre de Claude pour les recopier.
// Démarrage déterministe : tout le calcul ET l'affichage sont ici.
//
// Appelé par le hook SessionStart (cf. .claude/settings.json).
// Multi-OS : pur Node, aucune dépendance bash/jq/sqlite3-CLI.
//   - git via child_process
//   - comptage des .md via fs
//   - lecture de la DB via better-sqlite3 (déjà installé dans rag/node_modules) ;
//     dégrade proprement si le module n'est pas chargeable.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasGeminiKey } from "./lib/gemini-key.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const VAULT = join(REPO, "vault");
const DB_PATH = join(REPO, "rag", ".cache", "vault.db");
const ENV_PATH = join(REPO, ".env");

// Exécute git et renvoie { out, ok } sans jamais throw (stderr inclus).
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

// ─── Ligne repo : git pull --rebase + dérivation du statut ───────────────────
// (silencieux si pas de remote configuré — usage purement local)
const hasRemote = git(["remote"]).out.trim().length > 0;
let pullOut = "already up to date";
let pullOk = true;
if (hasRemote) {
  const r = git(["pull", "--rebase"]);
  pullOut = r.out;
  pullOk = r.ok;
}
const short = git(["rev-parse", "--short", "HEAD"]).out.trim();

let repoLine;
if (!pullOk) {
  repoLine = "⚠️ Pull échoué — vérifier manuellement.";
} else if (/already up to date|déjà à jour/i.test(pullOut)) {
  repoLine = `✅ Repo à jour (commit ${short}).`;
} else {
  const diff = git(["diff", "--name-only", "ORIG_HEAD", "HEAD"]).out;
  const changed = diff.split("\n").filter((l) => l.trim().length > 0).length;
  repoLine = `📥 Repo mis à jour — ${changed} fichier(s) modifié(s) (commit ${short}).`;
}

// ─── Ligne RAG : docCount (db) vs fichiers .md sur disque ────────────────────
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
    // better-sqlite3 vit dans rag/node_modules → require résolu depuis rag/.
    const require = createRequire(join(REPO, "rag", "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    docs = db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;
    db.close();
  } catch {
    docs = null; // dégrade : module absent, DB en cours d'écriture, etc.
  }
}

let ragLine;
if (docs === null || scanned === 0) {
  if (scanned === 0) {
    ragLine =
      "🧠 RAG : vault vide — ajoute des notes Markdown dans vault/ puis lance 'cd rag && npm run reindex'.";
  } else {
    ragLine = "🧠 RAG : statut indisponible (serveur en démarrage, ou moteur non installé).";
  }
} else {
  const remaining = scanned - docs;
  ragLine =
    remaining <= 0
      ? `🧠 RAG à jour — ${docs}/${scanned} fichiers indexés.`
      : `🧠 RAG : ${docs}/${scanned} fichiers indexés, ${remaining} en attente — rattrapage auto en tâche de fond.`;
}

// ─── Ligne clé Gemini : balise si elle manque (le RAG ne peut pas répondre) ──
// Lue à chaque démarrage : si l'utilisateur a lancé Claude Code AVANT de coller
// sa clé, on le signale et on rappelle qu'il suffit de la coller puis de reposer
// sa question (le serveur relit .env à la volée — pas besoin de reconnecter).
let keyLine = null;
const envContent = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : null;
if (!hasGeminiKey(envContent)) {
  keyLine =
    "⚠️ Clé Gemini absente de .env → le RAG ne peut pas répondre. Colle-la dans " +
    ".env (GOOGLE_GEMINI_API_KEY=…) puis repose ta question (le serveur la relit " +
    "tout seul). Si ça résiste, reconnecte le MCP (/mcp) ou relance Claude Code.";
}

// ─── Émission via systemMessage : s'affiche directement sur le terminal ──────
const systemMessage = [keyLine, repoLine, ragLine].filter(Boolean).join("\n");
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart" },
    systemMessage,
  }) + "\n"
);

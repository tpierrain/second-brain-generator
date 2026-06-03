#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// auto-commit.mjs — persistance déterministe du vault. Appelé par le hook
// PostToolUse (Write|Edit) : commit (+ push si un remote existe) à chaque
// modification de fichier — d'où les commits « auto: … ».
//
// Multi-OS : pur Node, aucune dépendance shell. La racine du repo est dérivée
// de l'emplacement du script (pas du cwd du hook).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out: out ?? "", ok: true };
  } catch (e) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
  }
}

// Pause synchrone (le hook tourne en mode bloquant, timeout côté Claude Code).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const dirty = git(["status", "--porcelain"]).out.trim().length > 0;
if (!dirty) process.exit(0);

git(["add", "."]);
git(["commit", "-m", "auto: vault/claude sync"]);

const hasRemote = git(["remote"]).out.trim().length > 0;
if (hasRemote && !git(["push"]).ok) {
  sleepSync(3000);
  if (!git(["push"]).ok) {
    process.stdout.write(
      "\n⚠️  PUSH ÉCHOUÉ — commit local OK mais non poussé. Vérifie le réseau puis: git push\n"
    );
  }
}

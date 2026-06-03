import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// Test de NON-RÉGRESSION : verrouille le comportement « pas de remote » de
// auto-commit.mjs (commit local, AUCUN push tenté, AUCUNE erreur). C'est le
// socle de la décision « non au dépôt distant = sûr » (cf. PLAN §3.4 / §5.E).
// Vert d'emblée : on caractérise un comportement déjà correct, pas un ajout.

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SCRIPT = join(HERE, "auto-commit.mjs");

// auto-commit.mjs dérive la racine du repo de SA position (resolve(scriptDir, "..")).
// On reconstruit donc <tmp>/scripts/auto-commit.mjs avec le repo à <tmp>.
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "auto-commit-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(REAL_SCRIPT, join(root, "scripts", "auto-commit.mjs"));
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  // tout committer (y compris le script copié) → arbre propre au départ
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return { root, git };
}

function runAutoCommit(root) {
  return execFileSync("node", [join(root, "scripts", "auto-commit.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Crée un dépôt bare local servant de remote `origin`, et renvoie son nb de commits.
function addBareRemote(root, git) {
  const bare = mkdtempSync(join(tmpdir(), "auto-commit-remote-"));
  execFileSync("git", ["init", "--bare", "-q", bare]);
  git(["remote", "add", "origin", bare]);
  // remote réellement *pushable* sans upstream → `git push` nu réussit s'il est
  // autorisé. Ainsi le test OFF prouve que c'est le GATE qui bloque, pas un échec.
  git(["config", "push.default", "current"]);
  const headCount = () => {
    try {
      return Number(
        execFileSync("git", ["--git-dir", bare, "rev-list", "--count", "HEAD"], {
          encoding: "utf8",
        }).trim(),
      );
    } catch {
      return 0; // pas encore de HEAD côté remote = rien n'a été poussé
    }
  };
  return { bare, headCount };
}

test("auto-commit — sans remote : commit local, aucun push, aucune erreur", () => {
  const { root, git } = makeRepo();
  try {
    const before = git(["rev-list", "--count", "HEAD"]).trim();
    writeFileSync(join(root, "note.md"), "# une note\n");

    runAutoCommit(root); // ne doit PAS throw (exit 0)

    const after = git(["rev-list", "--count", "HEAD"]).trim();
    assert.equal(Number(after), Number(before) + 1, "un commit local créé");
    assert.equal(git(["remote"]).trim(), "", "aucun remote configuré");
    assert.equal(git(["status", "--porcelain"]).trim(), "", "arbre propre après commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("auto-commit — arbre propre : aucun commit créé (idempotent)", () => {
  const { root, git } = makeRepo();
  try {
    const before = git(["rev-list", "--count", "HEAD"]).trim();
    runAutoCommit(root); // rien à committer → exit 0 sans rien faire
    const after = git(["rev-list", "--count", "HEAD"]).trim();
    assert.equal(after, before, "aucun commit superflu");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Couche 1 : push OPT-IN explicite ────────────────────────────────────────
// La présence d'un remote ne suffit PAS : auto-commit ne pousse que si
// l'utilisateur l'a explicitement activé (git config secondbrain.autopush true).
// Garantit qu'un remote hérité (clone lié au générateur) ne reçoit JAMAIS les notes.

test("auto-commit — remote présent mais autopush OFF (défaut) : commit local, AUCUN push", () => {
  const { root, git } = makeRepo();
  const { bare, headCount } = addBareRemote(root, git);
  try {
    writeFileSync(join(root, "note.md"), "# privée\n");
    runAutoCommit(root); // exit 0
    assert.equal(git(["status", "--porcelain"]).trim(), "", "commit local OK");
    assert.equal(headCount(), 0, "le remote ne reçoit RIEN (pas de push)");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("auto-commit — autopush ON : push effectif vers le remote choisi", () => {
  const { root, git } = makeRepo();
  const { bare, headCount } = addBareRemote(root, git);
  try {
    git(["config", "secondbrain.autopush", "true"]);
    writeFileSync(join(root, "note.md"), "# à sauvegarder\n");
    runAutoCommit(root); // exit 0
    assert.ok(headCount() >= 1, "le remote a bien reçu le commit (push)");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

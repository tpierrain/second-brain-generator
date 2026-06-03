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

test("auto-commit — sans remote : commit local, aucun push, aucune erreur", () => {
  const { root, git } = makeRepo();
  try {
    const before = git(["rev-list", "--count", "HEAD"]).trim();
    writeFileSync(join(root, "note.md"), "# une note\n");

    const stdout = runAutoCommit(root); // ne doit PAS throw (exit 0)

    const after = git(["rev-list", "--count", "HEAD"]).trim();
    assert.equal(Number(after), Number(before) + 1, "un commit local créé");
    assert.equal(git(["remote"]).trim(), "", "aucun remote configuré");
    assert.equal(git(["status", "--porcelain"]).trim(), "", "arbre propre après commit");
    assert.ok(!/PUSH ÉCHOUÉ/.test(stdout), "aucun message d'échec de push");
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

import { test } from "node:test";
import assert from "node:assert/strict";

import { repoStatusLine, countVaultUncommitted } from "./repo-status.mjs";

test("countVaultUncommitted : compte les entrées porcelain sous vault/ (modif + non suivi)", () => {
  const porcelain = [
    " M vault/notes/idee.md", // modifié
    "?? vault/brouillon.md", //   non suivi
    " M rag/.cache/vault.db", // hors vault → ignoré
    "?? .env", //                hors vault → ignoré
  ].join("\n");
  assert.equal(countVaultUncommitted(porcelain), 2);
});

test("countVaultUncommitted : tree propre → 0", () => {
  assert.equal(countVaultUncommitted(""), 0);
});

test("repoStatusLine : repo à jour → ✅ avec le commit court", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 0,
  });
  assert.equal(line, "✅ Repo à jour (commit abc1234).");
});

test("repoStatusLine : pull échoué → ⚠️ à vérifier", () => {
  const line = repoStatusLine({ pullOk: false, pullOut: "boom", short: "abc1234", uncommittedVault: 0 });
  assert.match(line, /^⚠️/);
  assert.match(line, /[Pp]ull/);
});

test("repoStatusLine : repo mis à jour → 📥 avec le nombre de fichiers", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Updating 1..2\nFast-forward",
    short: "abc1234",
    changedCount: 3,
    uncommittedVault: 0,
  });
  assert.match(line, /^📥/);
  assert.match(line, /3 fichier/);
});

test("repoStatusLine : modifs du vault NON committées → ⚠️ fail-loud (auto-commit muet)", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 2,
  });
  assert.match(line, /^⚠️/); // crie au lieu du ✅ vert
  assert.match(line, /2/); // nombre de notes en jeu
  assert.match(line, /auto-commit/i); // nomme la cause (le hook n'a pas tourné)
});

test("repoStatusLine : le fail-loud vault PRIME sur 'à jour'", () => {
  // Même quand le pull dit « à jour », des notes non committées doivent crier :
  // c'est exactement le symptôme des hooks muets sous nvm (PATH minimal).
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 1,
  });
  assert.doesNotMatch(line, /✅/);
});

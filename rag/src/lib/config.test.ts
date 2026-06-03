import { test } from "node:test";
import assert from "node:assert/strict";
import { QUERY_RESERVE, resolveKey } from "./config.js";

test("QUERY_RESERVE par défaut = 50 (crédits réservés à la recherche)", () => {
  assert.equal(QUERY_RESERVE, 50);
});

// La clé est lue une fois au démarrage du process MCP. Si l'utilisateur la colle
// dans .env APRÈS avoir lancé Claude Code, le process tournait avec une clé vide.
// resolveKey relit alors le .env à la volée → plus besoin de reconnecter le serveur.
test("resolveKey — garde la clé déjà chargée, sans relire le .env", () => {
  let reloaded = false;
  const key = resolveKey("AIza-deja-la", () => {
    reloaded = true;
    return "depuis-le-fichier";
  });
  assert.equal(key, "AIza-deja-la");
  assert.equal(reloaded, false, "ne doit pas relire le .env si la clé est déjà là");
});

test("resolveKey — clé absente au démarrage → relit le .env (clé collée après coup)", () => {
  assert.equal(resolveKey("", () => "AIza-collee-apres"), "AIza-collee-apres");
});

test("resolveKey — toujours rien dans le .env → chaîne vide (pas de crash)", () => {
  assert.equal(resolveKey("", () => undefined), "");
});

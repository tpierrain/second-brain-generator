import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { smokeTestMcp } from "./mcp-smoke.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, "__fixtures__", "stub-mcp-server.mjs");

const EXPECTED = ["search_vault", "get_document", "list_documents", "vault_stats"];

test("succès : le serveur répond, tous les outils attendus présents", async () => {
  const res = await smokeTestMcp({
    command: process.execPath, // node courant (multi-OS)
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
  });

  assert.equal(res.ok, true);
  for (const t of EXPECTED) assert.ok(res.tools.includes(t), `outil manquant : ${t}`);
  assert.equal(res.error, undefined);
});

test("outil manquant : ok=false même si le serveur répond", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
    env: { STUB_TOOLS: "search_vault,get_document,list_documents" }, // vault_stats absent
  });

  assert.equal(res.ok, false);
  assert.ok(res.tools.includes("search_vault")); // la liste réelle reste exposée
  assert.ok(!res.tools.includes("vault_stats"));
  assert.match(res.error ?? "", /vault_stats/); // l'erreur nomme le manquant
});

test("timeout : serveur muet → ok=false, error timeout", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 300,
    env: { STUB_MODE: "silent" },
  });

  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /timeout/i);
});

test("serveur qui meurt : détecté vite, ok=false, error ≠ timeout", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000, // gros timeout : si on tombe dedans, c'est qu'on n'a PAS détecté la mort
    env: { STUB_MODE: "crash" },
  });

  assert.equal(res.ok, false);
  assert.ok(res.error, "une error doit être renseignée");
  assert.doesNotMatch(res.error ?? "", /timeout/i);
});

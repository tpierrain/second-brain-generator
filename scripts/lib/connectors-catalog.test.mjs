import { test } from "node:test";
import assert from "node:assert/strict";

import { CONNECTORS } from "./connectors-catalog.mjs";

test("le catalogue contient 2 à 8 connecteurs", () => {
  assert.ok(Array.isArray(CONNECTORS));
  assert.ok(CONNECTORS.length >= 2 && CONNECTORS.length <= 8, `len=${CONNECTORS.length}`);
});

test("chaque connecteur a id/label/kind/credentialsHint, ids uniques", () => {
  const ids = new Set();
  for (const c of CONNECTORS) {
    assert.ok(c.id, "id manquant");
    assert.ok(c.label, `label manquant pour ${c.id}`);
    assert.ok(["mcp", "native"].includes(c.kind), `kind invalide pour ${c.id}`);
    assert.ok(c.credentialsHint, `credentialsHint manquant pour ${c.id}`);
    assert.ok(!ids.has(c.id), `id dupliqué : ${c.id}`);
    ids.add(c.id);
  }
});

test("chaque connecteur expose des useCases (idées de « pour quoi faire »)", () => {
  for (const c of CONNECTORS) {
    assert.ok(Array.isArray(c.useCases) && c.useCases.length > 0, `useCases manquants pour ${c.id}`);
    for (const u of c.useCases) {
      assert.equal(typeof u, "string", `useCase non-string pour ${c.id}`);
      assert.ok(u.trim().length > 0, `useCase vide pour ${c.id}`);
    }
  }
});

test("Gmail figure au catalogue (connecteur natif)", () => {
  const gmail = CONNECTORS.find((c) => c.id === "gmail");
  assert.ok(gmail, "connecteur gmail manquant");
  assert.equal(gmail.kind, "native");
});

test("les transcripts de réunion sont couverts par Drive ET Calendar (cas d'usage, pas un produit tiers)", () => {
  const mentionsTranscript = (c) =>
    (c.useCases ?? []).some((u) => /transcript/i.test(u));
  const drive = CONNECTORS.find((c) => c.id === "google-drive");
  const calendar = CONNECTORS.find((c) => c.id === "google-calendar");
  assert.ok(drive && mentionsTranscript(drive), "Drive devrait citer les transcripts dans ses useCases");
  assert.ok(calendar && mentionsTranscript(calendar), "Calendar devrait citer les transcripts dans ses useCases");
});

test("connecteurs mcp : serverConfig + permissions, env en placeholders (pas de vrai secret)", () => {
  const mcp = CONNECTORS.filter((c) => c.kind === "mcp");
  assert.ok(mcp.length >= 1, "au moins un connecteur mcp attendu");
  for (const c of mcp) {
    assert.ok(c.serverConfig, `serverConfig manquant pour ${c.id}`);
    assert.ok(Array.isArray(c.permissions) && c.permissions.length > 0, `permissions manquantes pour ${c.id}`);
    for (const p of c.permissions) {
      assert.match(p, /^mcp__/, `permission non-mcp pour ${c.id} : ${p}`);
    }
    // neutralité : toute valeur d'env est un placeholder <...>, jamais un vrai secret
    for (const v of Object.values(c.serverConfig.env ?? {})) {
      assert.match(v, /^<.+>$/, `env non-placeholder pour ${c.id} : ${v}`);
    }
  }
});

test("connecteurs natifs : aucun serverConfig (rien à écrire dans .mcp.json)", () => {
  for (const c of CONNECTORS.filter((c) => c.kind === "native")) {
    assert.equal(c.serverConfig, undefined, `un natif ne doit pas avoir de serverConfig : ${c.id}`);
  }
});

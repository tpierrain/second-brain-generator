import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyConnectorFiles } from "./connectors-apply.mjs";

const mcpConnector = {
  id: "google-drive",
  label: "Google Drive (communautaire)",
  kind: "mcp",
  serverConfig: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@some/google-drive-mcp"],
    env: { GDRIVE_CREDS: "<CHEMIN_CREDENTIALS>" },
  },
  permissions: ["mcp__google-drive__search", "mcp__google-drive__read"],
  credentialsHint: "Place un fichier de credentials OAuth, voir SETUP §6.",
};

// Prépare un dossier jetable avec un .mcp.json et un settings.json minimaux.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sbs-connectors-"));
  const mcpPath = join(dir, ".mcp.json");
  const settingsPath = join(dir, "settings.json");
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { "vault-rag": { command: "npx" } } }, null, 2));
  writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: ["Read"], deny: [] } }, null, 2));
  return { mcpPath, settingsPath };
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

test("applyConnectorFiles écrit le serveur et les permissions dans les fichiers", () => {
  const { mcpPath, settingsPath } = scratch();

  const res = applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });

  assert.equal(res.wrote, true);
  assert.deepEqual(readJson(mcpPath).mcpServers["google-drive"], mcpConnector.serverConfig);
  assert.deepEqual(readJson(settingsPath).permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("applyConnectorFiles est idempotent : une 2ᵉ passe ne duplique rien", () => {
  const { mcpPath, settingsPath } = scratch();

  applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });
  applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });

  assert.equal(Object.keys(readJson(mcpPath).mcpServers).length, 2); // vault-rag + google-drive
  assert.deepEqual(readJson(settingsPath).permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("applyConnectorFiles n'écrit rien pour un connecteur natif", () => {
  const { mcpPath, settingsPath } = scratch();

  const res = applyConnectorFiles(
    { id: "slack", kind: "native", credentialsHint: "via claude.ai" },
    { mcpPath, settingsPath },
  );

  assert.equal(res.wrote, false);
  assert.deepEqual(Object.keys(readJson(mcpPath).mcpServers), ["vault-rag"]);
  assert.deepEqual(readJson(settingsPath).permissions.allow, ["Read"]);
});

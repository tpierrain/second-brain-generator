// ─────────────────────────────────────────────────────────────────────────────
// connectors-apply.mjs — branche un connecteur en fusionnant sa conf sur disque.
//
// Couche I/O fine au-dessus des fusions pures de connectors-merge.mjs : lit
// .mcp.json + settings.json, applique addServerToMcpJson / addPermissions, puis
// réécrit les fichiers. Idempotent (hérité des fusions). Les connecteurs natifs
// (kind:'native') n'écrivent RIEN → { wrote: false }.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";

import { addServerToMcpJson, addPermissions } from "./connectors-merge.mjs";

const writeJson = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function applyConnectorFiles(connector, { mcpPath, settingsPath }) {
  if (connector.kind !== "mcp") return { wrote: false };

  writeJson(mcpPath, addServerToMcpJson(readJson(mcpPath), connector));
  writeJson(settingsPath, addPermissions(readJson(settingsPath), connector.permissions));
  return { wrote: true };
}

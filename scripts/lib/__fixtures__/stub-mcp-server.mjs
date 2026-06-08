#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// stub-mcp-server.mjs — faux serveur MCP pour tester smokeTestMcp() sans réseau
// ni Gemini. Parle le JSON-RPC stdio newline-delimited (une ligne = un message).
//
// Pilotable par variables d'environnement (le test choisit le scénario) :
//   STUB_TOOLS=a,b,c   liste d'outils renvoyée par tools/list (défaut : les 4 réels)
//   STUB_MODE=success  (défaut) handshake complet
//            =silent   ne répond jamais → provoque un timeout côté smoke-test
//            =crash    se termine (code 1) dès la 1re requête → serveur qui meurt
//   STUB_SEARCH=sourced (défaut) tools/call renvoie un texte qui cite une source
//                                vault (« **Path:** `vault/…` ») → probe PASS
//              =norag             renvoie « Aucun résultat trouvé dans le vault. »
//                                (pas de slash) → probe FAIL (RAG vide / down)
// ─────────────────────────────────────────────────────────────────────────────
import { stdin, stdout, env, exit } from "node:process";

const MODE = env.STUB_MODE ?? "success";
const TOOLS = (env.STUB_TOOLS ?? "search_vault,get_document,list_documents,vault_stats")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

if (MODE === "silent") {
  // On garde le process vivant sans jamais répondre (stdin ouvert).
  stdin.resume();
} else {
  let buf = "";
  stdin.setEncoding("utf8");
  stdin.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handle(line);
    }
  });
}

function send(obj) {
  stdout.write(JSON.stringify(obj) + "\n");
}

function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ligne non-JSON : ignorée
  }

  if (MODE === "crash") exit(1);

  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "stub-mcp-server", version: "0.0.0" },
        },
      });
      break;
    case "notifications/initialized":
      break; // notification : pas de réponse
    case "tools/list":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOLS.map((name) => ({ name })) },
      });
      break;
    case "tools/call": {
      const mode = env.STUB_SEARCH ?? "sourced";
      const text =
        mode === "norag"
          ? "Aucun résultat trouvé dans le vault."
          : mode === "echo"
            ? `query=${msg.params?.arguments?.query ?? ""}` // renvoie la query → test de corrélation
            : "Résultat 1\n**Path:** `vault/decisions/0001-exemple.md`\nExtrait pertinent…";
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text }] },
      });
      break;
    }
    default:
      break;
  }
}

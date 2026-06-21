#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// stub-mcp-server.mjs — fake MCP server to test smokeTestMcp() without network
// or Gemini. Speaks newline-delimited stdio JSON-RPC (one line = one message).
//
// Driven by environment variables (the test picks the scenario):
//   STUB_TOOLS=a,b,c   tools list returned by tools/list (default: the 4 real ones)
//   STUB_MODE=success  (default) full handshake
//            =silent   never answers → triggers a timeout on the smoke-test side
//            =crash    exits (code 1) on the 1st request → dying server
//   STUB_SEARCH=sourced (default) tools/call returns text that cites a vault
//                                source ("**Path:** `vault/…`") → probe PASS
//              =norag             returns "No results found in the vault."
//                                (no slash) → probe FAIL (empty / down RAG)
// ─────────────────────────────────────────────────────────────────────────────
import { stdin, stdout, env, exit } from "node:process";

const MODE = env.STUB_MODE ?? "success";
const TOOLS = (env.STUB_TOOLS ?? "search_vault,get_document,list_documents,vault_stats")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

if (MODE === "silent") {
  // Keep the process alive without ever answering (stdin open).
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
    return; // non-JSON line: ignored
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
      break; // notification: no response
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
          ? "No results found in the vault."
          : mode === "echo"
            ? `query=${msg.params?.arguments?.query ?? ""}` // echoes the query → correlation test
            : mode === "health" // health_check verdict (ADR 0030): a structured JSON line
              ? JSON.stringify({ status: "ok", checks: [{ name: "canary", status: "ok", detail: "found (8)" }] })
              : "Result 1\n**Path:** `vault/decisions/0001-example.md`\nRelevant excerpt…";
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

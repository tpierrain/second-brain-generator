// ─────────────────────────────────────────────────────────────────────────────
// mcp-search.mjs — opens ONE stdio MCP session (vault-rag), runs the handshake,
// then issues one search_vault search per query and correlates each response to
// its query (via the JSON-RPC id). Returns [{ query, text }] in the order of the
// queries. Serves the eval orchestrator (run-eval.mjs): a single server for the
// whole set. Pure Node, cross-OS, same spirit as mcp-smoke.mjs.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";
import { needsShell } from "./spawn-shell.mjs";

const FIRST_CALL_ID = 100; // beyond initialize(1)/tools-list(2)

export function mcpSearch({ command, args = [], cwd, queries, timeoutMs = 60000, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
      env: env ? { ...process.env, ...env } : process.env,
      // Windows `.cmd`/`.bat` (npx.cmd) need a shell since Node ≥ 18.20
      // (CVE-2024-27980) or spawn throws EINVAL. No-op for .exe/POSIX. ADR 0031.
      shell: needsShell(command, process.platform),
    });
    const texts = new Map(); // id → text
    let buf = "";
    let done = false;
    const timer = setTimeout(() => finish(new Error("timeout")), timeoutMs);

    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {}
      if (err) return reject(err);
      resolve(queries.map((query, i) => ({ query, text: texts.get(FIRST_CALL_ID + i) ?? "" })));
    }

    function send(obj) {
      try {
        child.stdin.write(JSON.stringify(obj) + "\n");
      } catch {}
    }

    child.on("error", (e) => finish(e));
    child.on("exit", (code, signal) => {
      if (!done) finish(new Error(`MCP server exited prematurely (code ${code ?? signal})`));
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        handle(msg);
      }
    });

    function handle(msg) {
      if (msg.id === 1 && msg.result) {
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        queries.forEach((query, i) => {
          send({
            jsonrpc: "2.0",
            id: FIRST_CALL_ID + i,
            method: "tools/call",
            params: { name: "search_vault", arguments: { query } },
          });
        });
      } else if (typeof msg.id === "number" && msg.id >= FIRST_CALL_ID) {
        const text = (msg.result?.content ?? []).map((c) => c.text ?? "").join("\n");
        texts.set(msg.id, text);
        if (texts.size === queries.length) finish();
      }
    }

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "rag-eval", version: "1.0.0" },
      },
    });
  });
}

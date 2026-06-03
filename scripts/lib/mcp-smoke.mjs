// ─────────────────────────────────────────────────────────────────────────────
// mcp-smoke.mjs — vérifie qu'un serveur MCP stdio répond au handshake JSON-RPC.
// Spawn le serveur, déroule initialize → initialized → tools/list, et renvoie
// { ok, tools, error? }. Aucune clé Gemini requise : lister les outils n'embedde
// rien. Pur Node, multi-OS.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";

export function smokeTestMcp({ command, args = [], cwd, expectTools = [], timeoutMs = 15000, env }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
      env: env ? { ...process.env, ...env } : process.env,
    });
    let buf = "";
    let done = false;
    const timer = setTimeout(
      () => finish({ ok: false, tools: [], error: "timeout" }),
      timeoutMs
    );

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {}
      resolve(result);
    }

    function send(obj) {
      try {
        child.stdin.write(JSON.stringify(obj) + "\n");
      } catch {}
    }

    child.on("error", (e) => finish({ ok: false, tools: [], error: e.message }));
    child.on("exit", (code, signal) =>
      finish({
        ok: false,
        tools: [],
        error: `serveur terminé avant la fin du handshake (code ${code ?? signal})`,
      })
    );

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
          continue; // ligne non-JSON (logs éventuels) : ignorée
        }
        handle(msg);
      }
    });

    function handle(msg) {
      if (msg.id === 1 && msg.result) {
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      } else if (msg.id === 2 && msg.result) {
        const tools = (msg.result.tools ?? []).map((t) => t.name);
        const missing = expectTools.filter((t) => !tools.includes(t));
        finish(
          missing.length === 0
            ? { ok: true, tools }
            : { ok: false, tools, error: `outils manquants : ${missing.join(", ")}` }
        );
      }
    }

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "bootstrap-smoke-test", version: "1.0.0" },
      },
    });
  });
}

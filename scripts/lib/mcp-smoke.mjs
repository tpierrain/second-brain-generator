// ─────────────────────────────────────────────────────────────────────────────
// mcp-smoke.mjs — vérifie qu'un serveur MCP stdio répond au handshake JSON-RPC.
// Spawn le serveur, déroule initialize → initialized → tools/list, et renvoie
// { ok, tools, error? }. Aucune clé Gemini requise : lister les outils n'embedde
// rien. Pur Node, multi-OS.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";

export function smokeTestMcp({ command, args = [], cwd, expectTools = [], timeoutMs = 15000, env, probe }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
      env: env ? { ...process.env, ...env } : process.env,
    });
    let buf = "";
    let done = false;
    let lastTools = []; // mémorise la liste d'outils (id:2) pour la rendre après le probe (id:3)
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
        lastTools = tools;
        const missing = expectTools.filter((t) => !tools.includes(t));
        if (missing.length > 0) {
          finish({ ok: false, tools, error: `outils manquants : ${missing.join(", ")}` });
        } else if (probe) {
          // Smoke structurel OK : on pousse jusqu'à un probe FONCTIONNEL — appeler
          // réellement l'outil et vérifier que sa réponse cite une source du vault.
          send({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: probe.tool, arguments: probe.args ?? {} },
          });
        } else {
          finish({ ok: true, tools }); // sans probe : comportement inchangé
        }
      } else if (msg.id === 3 && probe) {
        const tools = lastTools;
        if (msg.error) {
          finish({ ok: false, tools, error: `tools/call ${probe.tool} a échoué : ${msg.error.message ?? "erreur"}` });
          return;
        }
        const text = (msg.result?.content ?? []).map((c) => c.text ?? "").join("\n");
        const ok = probe.expectText.test(text);
        finish({
          ok,
          tools,
          probeText: text,
          error: ok ? undefined : "réponse de search_vault sans source vault citée",
        });
      }
    }

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "installer-smoke-test", version: "1.0.0" },
      },
    });
  });
}

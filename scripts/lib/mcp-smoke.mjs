// ─────────────────────────────────────────────────────────────────────────────
// mcp-smoke.mjs — checks that a stdio MCP server answers the JSON-RPC handshake.
// Spawns the server, runs through initialize → initialized → tools/list, and
// returns { ok, tools, error? }. No Gemini key required: listing the tools
// embeds nothing. Pure Node, cross-OS.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";
import { needsShell } from "./spawn-shell.mjs";
import { terminateChild } from "./child-cleanup.mjs";

export function smokeTestMcp({ command, args = [], cwd, expectTools = [], timeoutMs = 15000, env, probe }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
      env: env ? { ...process.env, ...env } : process.env,
      // Windows `.cmd`/`.bat` (npx.cmd) need a shell since Node ≥ 18.20
      // (CVE-2024-27980) or spawn throws EINVAL. No-op for .exe/POSIX. ADR 0031.
      shell: needsShell(command, process.platform),
    });
    let buf = "";
    let done = false;
    let lastTools = []; // remembers the tools list (id:2) to return it after the probe (id:3)
    const timer = setTimeout(
      () => finish({ ok: false, tools: [], error: "timeout" }),
      timeoutMs
    );

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Tree-kill + release handles: on Windows the `.cmd` shell child orphans the
      // node grandchild, whose inherited stdout pipe would otherwise keep the
      // installer alive forever after its success banner (ADR 0031). Cross-OS.
      terminateChild(child, { platform: process.platform, spawn });
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
        error: `server exited before the handshake completed (code ${code ?? signal})`,
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
          continue; // non-JSON line (possible logs): ignored
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
          finish({ ok: false, tools, error: `missing tools: ${missing.join(", ")}` });
        } else if (probe) {
          // Structural smoke OK: we go further with a FUNCTIONAL probe — actually
          // call the tool and check that its response cites a vault source.
          send({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: probe.tool, arguments: probe.args ?? {} },
          });
        } else {
          finish({ ok: true, tools }); // without probe: behavior unchanged
        }
      } else if (msg.id === 3 && probe) {
        const tools = lastTools;
        if (msg.error) {
          finish({ ok: false, tools, error: `tools/call ${probe.tool} failed: ${msg.error.message ?? "error"}` });
          return;
        }
        const text = (msg.result?.content ?? []).map((c) => c.text ?? "").join("\n");
        // With expectText: ok = the response matches the expectation (e.g. cites a
        // vault source). Without it: the caller interprets probeText itself (e.g. a
        // structured health_check verdict) → ok just means the call didn't error.
        const ok = probe.expectText ? probe.expectText.test(text) : true;
        finish({
          ok,
          tools,
          probeText: text,
          error: ok ? undefined : "search_vault response with no vault source cited",
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

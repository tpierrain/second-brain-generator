import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { nodeHookCommand, buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC (issue #31 — "'laude' is not recognized" on Windows).
// This is NOT a permanent regression test: it reproduces, on the windows-latest
// CI runner, how a generated hook command is actually executed, and LOGS what
// each plausible invocation form yields (stdout / stderr / exit). It always
// passes — its output in the Windows job log is the evidence we're after. It is
// removed once the mechanism is understood and the real fix + test land.
// ═══════════════════════════════════════════════════════════════════════════

const toPosix = (p) => p.split("\\").join("/");

// Reproduces installer.mjs's substitution (split/join per key), like the
// rag-launcher tests, so we get the EXACT command string Claude Code reads from
// settings.json after JSON.parse.
function substitute(tpl, reps) {
  let out = tpl;
  for (const [k, v] of Object.entries(reps)) out = out.split(k).join(v);
  return out;
}

// The real settings.json.template hook shape: {{NODE}} then the quoted .mjs path.
function realHookCommand(projectRootPosix, scriptRel) {
  const tpl = `{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/${scriptRel}\\"" }`;
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("win32", projectRootPosix),
    "{{PROJECT_ROOT}}": projectRootPosix,
  });
  return JSON.parse(out).command;
}

// Candidate FIX form: point straight at the run-node.cmd batch (quoted), with NO
// nested `cmd /c` — cmd can execute a .cmd directly, and this avoids the
// documented `cmd /c "A" "B"` quote-stripping.
function candidateHookCommand(projectRootPosix, scriptRel) {
  const win = projectRootPosix.split("/").join("\\");
  return `"${win}\\scripts\\run-node.cmd" "${projectRootPosix}/${scriptRel}"`;
}

function log(label, r) {
  const out = (r.stdout ?? "").toString().trim();
  const err = (r.stderr ?? "").toString().trim();
  console.error(`\n[repro] ${label}`);
  console.error(`[repro]   status=${r.status} signal=${r.signal ?? ""} error=${r.error?.message ?? ""}`);
  console.error(`[repro]   stdout=${JSON.stringify(out)}`);
  console.error(`[repro]   stderr=${JSON.stringify(err)}`);
  console.error(`[repro]   laude? ${/laude|not recognized|is not recognized/i.test(err) ? "YES ← reproduced" : "no"}`);
}

test("DIAGNOSTIC #31 — how the generated Windows hook command executes", () => {
  const root = mkdtempSync(join(tmpdir(), "sbg-hook-repro-"));
  const rootPosix = toPosix(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(
    join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`,
  );

  const command = realHookCommand(rootPosix, "scripts/probe.mjs");
  const candidate = candidateHookCommand(rootPosix, "scripts/probe.mjs");
  console.error(`[repro] platform=${process.platform}`);
  console.error(`[repro] generated hook command = ${JSON.stringify(command)}`);
  console.error(`[repro] candidate (no nested cmd) = ${JSON.stringify(candidate)}`);

  if (process.platform !== "win32") {
    console.error("[repro] not win32 → execution skipped (shape logged above)");
    return; // pass: diagnostic only
  }

  const enc = { encoding: "utf8" };
  // Forms Claude Code plausibly uses to run a hook command string on Windows.
  log("A) cmd /c <command>            ", spawnSync("cmd", ["/c", command], enc));
  log("B) cmd /d /s /c \"<command>\"    ", spawnSync("cmd", ["/d", "/s", "/c", `"${command}"`], enc));
  log("C) spawnSync(command,{shell})  ", spawnSync(command, { shell: true, ...enc }));
  log("D) CANDIDATE cmd /c <candidate>", spawnSync("cmd", ["/c", candidate], enc));
  log("E) CANDIDATE shell:true        ", spawnSync(candidate, { shell: true, ...enc }));
  // Always pass: this test's job is to LEAVE EVIDENCE in the CI log, not to gate.
});

import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { nodeHookCommand, buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC (issue #31 — "'laude' is not recognized" on Windows).
// This is NOT a permanent regression test: it reproduces, on the windows-latest
// CI runner, how a generated hook command is actually executed, and LOGS what
// each plausible (shell × command-string) combination yields. It always passes —
// its output in the Windows job log is the evidence we're after. Removed once the
// mechanism is understood and the real fix + regression test land.
//
// ROUND 2. Round 1 tested only cmd.exe invocations and reproduced a
// "not recognized" failure with the shipped command shape. But Claude Code runs
// hooks on Windows through **Git Bash** (`bash -c`) by default, with PowerShell
// as a fallback — NOT cmd.exe. Round 1 tested the wrong shell. This round runs a
// matrix of candidate command STRINGS under the shells Claude Code actually uses
// (bash, cmd, powershell), so the log pins BOTH: which (shell × current-string)
// reproduces Mohamed's exact `'laude' is not recognized`, and which candidate
// string runs the probe cleanly (PROBE_OK) under that same shell.
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
// {{NODE}} on win32 = `cmd /c "<WIN-BACKSLASH-path>\scripts\run-node.cmd"`, while
// {{PROJECT_ROOT}} is the FORWARD-slash brain path → the shipped string mixes
// slash styles, which is exactly what a bash hook mangles.
function shippedHookCommand(projectRootPosix, scriptRel) {
  const tpl = `{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/${scriptRel}\\"" }`;
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("win32", projectRootPosix),
    "{{PROJECT_ROOT}}": projectRootPosix,
  });
  return JSON.parse(out).command;
}

// Locate Git Bash on the runner (the primary shell Claude Code uses on Windows).
function findBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "bash"; // fall back to PATH
}

function detect(err) {
  return /laude|not recognized|is not recognized/i.test(err);
}

function log(shell, label, r) {
  const out = (r.stdout ?? "").toString().trim();
  const err = (r.stderr ?? "").toString().trim();
  const ok = /PROBE_OK/.test(out);
  console.error(`\n[repro] [${shell}] ${label}`);
  console.error(`[repro]   status=${r.status} signal=${r.signal ?? ""} error=${r.error?.message ?? ""}`);
  console.error(`[repro]   stdout=${JSON.stringify(out)}`);
  console.error(`[repro]   stderr=${JSON.stringify(err)}`);
  console.error(`[repro]   verdict=${ok ? "PROBE_OK ✅" : detect(err) ? "not-recognized/laude ← reproduced" : "other-failure"}`);
}

test("DIAGNOSTIC #31 (round 2) — hook command across real Windows shells", () => {
  const root = mkdtempSync(join(tmpdir(), "sbg-hook-repro-"));
  const rootPosix = toPosix(root);
  const rootWin = rootPosix.split("/").join("\\");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(
    join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`,
  );

  const scriptPosix = `${rootPosix}/scripts/probe.mjs`;
  const runnerPosix = `${rootPosix}/scripts/run-node.cmd`;
  const runnerWin = `${rootWin}\\scripts\\run-node.cmd`;

  // Candidate command STRINGS (what would live in settings.json "command"):
  const strings = {
    // S0 — the CURRENTLY SHIPPED string (mixed slashes, nested cmd /c). Baseline.
    S0_shipped: shippedHookCommand(rootPosix, "scripts/probe.mjs"),
    // S1 — nested cmd, but ALL forward slashes (cmd.exe tolerates '/'; bash keeps them clean).
    S1_cmd_fwd: `cmd /c "${runnerPosix}" "${scriptPosix}"`,
    // S2 — NO nested cmd, forward slashes (let the shell run the .cmd directly).
    S2_nonest_fwd: `"${runnerPosix}" "${scriptPosix}"`,
    // S3 — NO nested cmd, Windows backslashes for the runner.
    S3_nonest_win: `"${runnerWin}" "${scriptPosix}"`,
    // S4 — extra outer wrapping so cmd's strip-first-and-last leaves valid inner quotes.
    S4_cmd_wrapped: `cmd /c ""${runnerPosix}" "${scriptPosix}""`,
  };

  console.error(`[repro] platform=${process.platform}`);
  for (const [k, v] of Object.entries(strings)) {
    console.error(`[repro] ${k} = ${JSON.stringify(v)}`);
  }

  if (process.platform !== "win32") {
    console.error("[repro] not win32 → execution skipped (shapes logged above)");
    return; // pass: diagnostic only
  }

  const enc = { encoding: "utf8" };
  const bash = findBash();
  console.error(`[repro] bash resolved to ${JSON.stringify(bash)}`);

  for (const [name, cmdStr] of Object.entries(strings)) {
    // Git Bash — Claude Code's PRIMARY hook shell on Windows.
    log("bash", name, spawnSync(bash, ["-c", cmdStr], enc));
    // cmd.exe — the /c <string> form (round-1's reproducing form).
    log("cmd", name, spawnSync("cmd", ["/c", cmdStr], enc));
    // PowerShell — the documented fallback shell.
    log("pwsh", name, spawnSync("powershell", ["-NoProfile", "-Command", cmdStr], enc));
  }
  // Always pass: this test's job is to LEAVE EVIDENCE in the CI log, not to gate.
});

import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC (issue #31 — "'laude' is not recognized" on Windows).
// Always passes — the windows-latest job log is the evidence. Removed once the
// fix + permanent regression test land.
//
// Established so far (rounds 2–3, windows-latest):
//   - Claude Code runs Windows hooks through Git Bash by default (PowerShell if
//     Git Bash is absent). The SHIPPED `cmd /c "C:\…\run-node.cmd" "…"` command
//     is eaten by Git Bash's backslash handling → `RUNNER`→`UNNER`, i.e. exactly
//     Mohamed's `claude`→`laude`.
//   - No-nested-cmd `"runner" "script"` works under bash but not PowerShell.
//   - `& "runner" "script"` works under PowerShell but not bash.
//   - A SPACE in the path breaks the quoted forms under bash AND the cmd exec
//     form (Git Bash's known .cmd-with-spaces bug, #16451); only PowerShell's
//     `& "…"` survived spaces.
//
// ROUND 4 (this file) asks the last question: is an UNQUOTED forward-slash
// command universal across bash / PowerShell / cmd when the path has NO space —
// and how does each candidate behave WITH a space? Maps 3 candidates × 3 shells
// × {no-space, space} so we can pick the final fix from data, not theory.
// ═══════════════════════════════════════════════════════════════════════════

const toPosix = (p) => p.split("\\").join("/");

function findBash() {
  for (const c of [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ]) if (existsSync(c)) return c;
  return "bash";
}

function makeBrain(withSpace) {
  const base = mkdtempSync(join(tmpdir(), "sbg-hook-repro-"));
  const root = withSpace ? join(base, "John Doe", "brain") : join(base, "brain");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(
    join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`,
  );
  const rootPosix = toPosix(root);
  return {
    runnerPosix: `${rootPosix}/scripts/run-node.cmd`,
    scriptPosix: `${rootPosix}/scripts/probe.mjs`,
  };
}

function verdict(r) {
  const out = (r.stdout ?? "").toString().trim();
  const err = (r.stderr ?? "").toString().trim();
  if (/PROBE_OK/.test(out)) return "PROBE_OK ✅";
  if (/not recognized|laude/i.test(err)) return `not-recognized ❌ (${err.split(/\r?\n/)[0].slice(0, 60)})`;
  return `other ❌ (${(err || "no stderr").split(/\r?\n/)[0].slice(0, 60)})`;
}

test("DIAGNOSTIC #31 (round 4) — unquoted vs quoted vs call-op, across shells & spaces", () => {
  const noSpace = makeBrain(false);
  const withSpace = makeBrain(true);
  console.error(`[repro] platform=${process.platform}`);

  if (process.platform !== "win32") {
    console.error("[repro] not win32 → execution skipped");
    return;
  }

  const enc = { encoding: "utf8" };
  const bash = findBash();
  console.error(`[repro] bash resolved to ${JSON.stringify(bash)}`);

  // Candidate settings.json "command" STRINGS (forward slashes throughout).
  const candidates = {
    quoted: ({ runnerPosix, scriptPosix }) => `"${runnerPosix}" "${scriptPosix}"`,
    call_op: ({ runnerPosix, scriptPosix }) => `& "${runnerPosix}" "${scriptPosix}"`,
    unquoted: ({ runnerPosix, scriptPosix }) => `${runnerPosix} ${scriptPosix}`,
  };
  const shells = {
    bash: (s) => spawnSync(bash, ["-c", s], enc),
    cmd: (s) => spawnSync("cmd", ["/c", s], enc),
    pwsh: (s) => spawnSync("powershell", ["-NoProfile", "-Command", s], enc),
  };

  for (const [pathLabel, brain] of [["no-space", noSpace], ["with-space", withSpace]]) {
    for (const [cName, build] of Object.entries(candidates)) {
      const cmdStr = build(brain);
      for (const [sName, run] of Object.entries(shells)) {
        console.error(`[repro] [${pathLabel}] [${cName}] [${sName}] → ${verdict(run(cmdStr))}`);
      }
    }
  }
  // Always pass: evidence only.
});

import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { nodeHookCommand, buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC (issue #31 — "'laude' is not recognized" on Windows).
// Always passes — its output in the windows-latest job log is the evidence. It
// is removed once the fix + permanent regression test land.
//
// ROUND 2 (kept for reference in git history) established, on windows-latest:
//   - The SHIPPED hook string `cmd /c "C:\…\run-node.cmd" "C:/…/script.mjs"`
//     FAILS under Git Bash (`bash -c`) — backslashes are eaten, a char is lost
//     (`RUNNER`→`UNNER`), cmd then says "is not recognized". SAME mechanism as
//     Mohamed's `claude`→`laude`. It works only under PowerShell.
//   - A no-nested-cmd string `"…/run-node.cmd" "…/script.mjs"` works under bash
//     but FAILS under PowerShell (needs `&`). No single quoted string works under
//     both shells.
//
// ROUND 3 (this file) resolves the fix. Two questions, one CI pass:
//   (1) EXEC FORM — if hooks can be spawned as command+args WITHOUT a shell,
//       CreateProcess quoting handles everything, INCLUDING paths with spaces.
//       Simulated by spawnSync("cmd", ["/c", runner, script]) (no shell:true).
//   (2) SHELL-SPECIFIC string fixes, tested with a SPACE in the brain path
//       (`John Doe`, the real-world case that breaks naive quoting): the bash
//       fix (no nested cmd) and the PowerShell fix (`& "runner" "script"`).
// The log tells us which fix is robust to spaces under the real shell.
// ═══════════════════════════════════════════════════════════════════════════

const toPosix = (p) => p.split("\\").join("/");

function findBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "bash";
}

function log(label, r) {
  const out = (r.stdout ?? "").toString().trim();
  const err = (r.stderr ?? "").toString().trim();
  const ok = /PROBE_OK/.test(out);
  console.error(`\n[repro] ${label}`);
  console.error(`[repro]   status=${r.status} signal=${r.signal ?? ""} error=${r.error?.message ?? ""}`);
  console.error(`[repro]   stdout=${JSON.stringify(out)}`);
  console.error(`[repro]   stderr=${JSON.stringify(err)}`);
  console.error(`[repro]   verdict=${ok ? "PROBE_OK ✅" : /not recognized|laude/i.test(err) ? "not-recognized/laude" : "other-failure"}`);
}

test("DIAGNOSTIC #31 (round 3) — exec form + shell fixes with a SPACE in the path", () => {
  // Force a space in the brain path — the real-world `C:\Users\John Doe\…` case.
  const base = mkdtempSync(join(tmpdir(), "sbg-hook-repro-"));
  const root = join(base, "John Doe", "brain");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(
    join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`,
  );

  const rootPosix = toPosix(root);
  const rootWin = rootPosix.split("/").join("\\");
  const runnerWin = `${rootWin}\\scripts\\run-node.cmd`;
  const runnerPosix = `${rootPosix}/scripts/run-node.cmd`;
  const scriptPosix = `${rootPosix}/scripts/probe.mjs`;

  console.error(`[repro] platform=${process.platform}`);
  console.error(`[repro] root (has space) = ${JSON.stringify(root)}`);
  console.error(`[repro] runnerWin  = ${JSON.stringify(runnerWin)}`);
  console.error(`[repro] runnerPosix= ${JSON.stringify(runnerPosix)}`);

  if (process.platform !== "win32") {
    console.error("[repro] not win32 → execution skipped (shapes logged above)");
    return;
  }

  const enc = { encoding: "utf8" };
  const bash = findBash();
  console.error(`[repro] bash resolved to ${JSON.stringify(bash)}`);

  // (1) EXEC FORM — no shell. This is what a hook `command`+`args` entry would do.
  //     Node quotes each arg for CreateProcess → robust to spaces, no shell parsing.
  log("EXEC  cmd /c <runnerWin> <script>   (command+args, no shell)",
    spawnSync("cmd", ["/c", runnerWin, scriptPosix], enc));
  log("EXEC  cmd /c <runnerPosix> <script> (command+args, no shell)",
    spawnSync("cmd", ["/c", runnerPosix, scriptPosix], enc));

  // (2a) BASH fix — no nested cmd, forward slashes, quoted (handles the space).
  log("BASH  \"<runnerPosix>\" \"<script>\"",
    spawnSync(bash, ["-c", `"${runnerPosix}" "${scriptPosix}"`], enc));

  // (2b) POWERSHELL fix — call operator `&` before the quoted path (handles the space).
  log("PWSH  & \"<runnerPosix>\" \"<script>\"",
    spawnSync("powershell", ["-NoProfile", "-Command", `& "${runnerPosix}" "${scriptPosix}"`], enc));

  // Always pass: evidence only.
});

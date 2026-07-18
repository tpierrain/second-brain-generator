import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { nodeHookCommand, buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// Regression guard for issue #31 — "'laude' is not recognized" on Windows.
//
// Claude Code runs hook commands through Git Bash by default (PowerShell if Git
// Bash is absent), NOT cmd.exe. The old `cmd /c "C:\…\run-node.cmd" "…"` shape was
// eaten by Git Bash's backslash-as-escape handling (a char dropped: `claude`→`laude`)
// and by cmd.exe's `"A" "B"` quote-stripping. The fix (rag-launcher.nodeHookCommand)
// emits a bare FORWARD-SLASH path to run-node.cmd, unquoted and WITHOUT a nested
// `cmd /c`; the settings template keeps the script argument quoted. That command
// runs under bash, PowerShell and cmd alike.
//
// This test rebuilds the EXACT command Claude Code reads from settings.json (the
// template shape + nodeHookCommand + JSON.parse) and, on Windows, actually EXECUTES
// it through the shells Claude Code uses, asserting the probe runs (PROBE_OK). On
// non-Windows it asserts the shape invariants so macOS/Linux CI also guards the fix.

const toPosix = (p) => p.split("\\").join("/");

// Reproduce installer.mjs's per-key substitution, exactly like the rag-launcher tests.
function substitute(tpl, reps) {
  let out = tpl;
  for (const [k, v] of Object.entries(reps)) out = out.split(k).join(v);
  return out;
}

// The real .claude/settings.json.template hook shape: {{NODE}} then the quoted .mjs.
function builtHookCommand(rootPosix, scriptRel) {
  const tpl = `{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/${scriptRel}\\"" }`;
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("win32", rootPosix),
    "{{PROJECT_ROOT}}": rootPosix,
  });
  return JSON.parse(out).command;
}

function findBash() {
  for (const c of [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ]) if (existsSync(c)) return c;
  return "bash";
}

test("win32 hook command has neither a nested `cmd /c` nor a backslash (issue #31 shape guard)", () => {
  const command = builtHookCommand("C:/Users/x/brain", "scripts/session-self-heal.mjs");
  assert.equal(
    command,
    'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/session-self-heal.mjs"',
  );
  assert.doesNotMatch(command, /cmd \/c/i, "a nested `cmd /c` re-triggers cmd.exe quote-stripping");
  assert.doesNotMatch(command, /\\/, "a backslash is eaten by Git Bash → `claude`→`laude`");
});

test("win32 hook command actually runs the script under Git Bash AND PowerShell (issue #31)", (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only execution — shape is guarded on every platform by the test above");
    return;
  }
  const root = join(mkdtempSync(join(tmpdir(), "sbg-hook-exec-")), "brain");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(
    join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`,
  );

  const command = builtHookCommand(toPosix(root), "scripts/probe.mjs");
  const enc = { encoding: "utf8" };

  // Git Bash — Claude Code's default hook shell on Windows (the one that failed for #31).
  const viaBash = spawnSync(findBash(), ["-c", command], enc);
  assert.match(viaBash.stdout ?? "", /PROBE_OK/, `Git Bash failed: ${viaBash.stderr}`);

  // PowerShell — Claude Code's fallback hook shell (Git Bash absent).
  const viaPwsh = spawnSync("powershell", ["-NoProfile", "-Command", command], enc);
  assert.match(viaPwsh.stdout ?? "", /PROBE_OK/, `PowerShell failed: ${viaPwsh.stderr}`);
});

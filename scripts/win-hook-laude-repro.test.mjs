import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildNodeRunnerCmd } from "./lib/rag-launcher.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC (issue #31). Removed once the fix + regression test land.
// Round 4 proved an UNQUOTED forward-slash command is universal (bash/cmd/pwsh)
// for space-free paths. ROUND 5 checks the MINIMAL-change shape we'd actually
// ship: runner UNQUOTED + script QUOTED (template left untouched). If that runs
// the probe under both bash and PowerShell, we change only nodeHookCommand.
// ═══════════════════════════════════════════════════════════════════════════

const toPosix = (p) => p.split("\\").join("/");
function findBash() {
  for (const c of ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"])
    if (existsSync(c)) return c;
  return "bash";
}
function verdict(r) {
  const out = (r.stdout ?? "").toString().trim();
  const err = (r.stderr ?? "").toString().trim();
  if (/PROBE_OK/.test(out)) return "PROBE_OK ✅";
  return `❌ ${(err || "no stderr").split(/\r?\n/)[0].slice(0, 70)}`;
}

test("DIAGNOSTIC #31 (round 5) — shippable shapes under bash & pwsh (no space)", () => {
  const base = mkdtempSync(join(tmpdir(), "sbg-hook-repro-"));
  const root = join(base, "brain");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
  writeFileSync(join(root, "scripts", "probe.mjs"),
    `console.log("PROBE_OK argv=" + JSON.stringify(process.argv.slice(2)));\n`);
  const rp = toPosix(root);
  const runner = `${rp}/scripts/run-node.cmd`;
  const script = `${rp}/scripts/probe.mjs`;

  console.error(`[repro] platform=${process.platform}`);
  if (process.platform !== "win32") { console.error("[repro] not win32 → skipped"); return; }

  const enc = { encoding: "utf8" };
  const bash = findBash();
  const shapes = {
    mixed: `${runner} "${script}"`,        // runner unquoted, script quoted (template untouched)
    unquoted: `${runner} ${script}`,       // both unquoted (needs template quote removal)
  };
  for (const [name, s] of Object.entries(shapes)) {
    console.error(`[repro] [${name}] cmd=${JSON.stringify(s)}`);
    console.error(`[repro] [${name}] [bash] → ${verdict(spawnSync(bash, ["-c", s], enc))}`);
    console.error(`[repro] [${name}] [pwsh] → ${verdict(spawnSync("powershell", ["-NoProfile", "-Command", s], enc))}`);
  }
});

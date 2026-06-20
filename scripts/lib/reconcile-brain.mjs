// ─────────────────────────────────────────────────────────────────────────────
// reconcile-brain.mjs — the CONVERGE half of update-engine (ADR 0026). Makes the
// brain's on-disk engine state MATCH a desired-state `target` manifest, deterministic
// and idempotent: copy the engine files, install-if-absent the engine-declared skills,
// reconcile `.mcp.json` against `engineMcpServers`, regenerate the launchers, run
// install, and reindex IFF the index schema moved. It NEVER touches the vault, `.env`,
// the constitution, settings, user-added `.mcp.json` servers or any non-declared /
// custom skill (the write-allowlist safety core is `computeApplyPlan`).
//
// Why standalone (ADR 0026): the same reconciler runs at TWO points —
//   • auto-finalize: re-exec'd as a fresh child process at the end of update-engine,
//     so the JUST-INSTALLED converge logic runs in one invocation (kills the 2-cycle);
//   • SessionStart self-heal: a brain that received code but never reconciled converges
//     silently at the next session start.
// It takes a `sourceDir` (the files to converge FROM) + the four I/O seams, so it runs
// offline. It does NOT fetch and does NOT record the engine version — those are
// update-engine's fetch-result concerns (step 7).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

import { computeApplyPlan } from "./engine-apply-plan.mjs";
import { matchesAny } from "./glob-match.mjs";
import { reconcileMcpServers } from "./mcp-reconcile.mjs";
import { needsReindex } from "./reindex-trigger.mjs";
import { listFilesRelPosix } from "./fs-walk.mjs";
import { selectEngineFilesToCopy } from "./engine-copy-select.mjs";

function copyInto(srcDir, destDir, rel) {
  const dest = join(destDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(srcDir, rel), dest);
}

export async function reconcileBrain({
  brainDir,
  platform = process.platform,
  sourceDir,
  target,
  local,
  regenerateLaunchers,
  runInstall,
  runReindex,
  countVaultNotes,
}) {
  // 1. The write-allowlist (the safety core, Step 3): the ONLY files we may write.
  const plan = computeApplyPlan(target);

  // 2. Apply the COPY buckets — overwrite (`replace`) + the engine-owned scripts
  //    (incl. update-engine.mjs → self-update). Globs are resolved against the files
  //    the source actually carries, then refined by `selectEngineFilesToCopy` with the
  //    SAME two exclusions the INSTALLER applies (PR #10 QA findings): F1 drops the
  //    dev-only files (scripts/lib/eval-*/mcp-search.*), F2 keeps the brain's
  //    locale-owned files (scripts/lib/demo-locale.mjs → no fr→en regression).
  const sourceFiles = listFilesRelPosix(sourceDir);
  const copyGlobs = [...plan.overwrite, ...plan.replaceScripts];
  const copied = selectEngineFilesToCopy({ sourceFiles, copyGlobs });
  for (const rel of copied) copyInto(sourceDir, brainDir, rel);

  // 2.bis Install engine-declared skills the brain is MISSING (ADR 0025): additive,
  //    install-if-absent at the SKILL-DIR level. A skill dir that already exists
  //    (possibly user-customized) is left byte-identical; a brand-new engine skill is
  //    copied in. Non-declared / custom skills are never in `installSkills` → untouchable.
  const installedSkills = [];
  for (const skillGlob of plan.installSkills) {
    const skillDir = skillGlob.replace(/\/\*\*?$/, ""); // ".../local-mirror/**" → ".../local-mirror"
    if (existsSync(join(brainDir, skillDir))) continue; // present → preserve, never overwrite
    for (const rel of sourceFiles.filter((f) => matchesAny([skillGlob], f))) copyInto(sourceDir, brainDir, rel);
    installedSkills.push(skillDir.split("/").pop()); // the skill name, for the report
  }

  // 2.ter Reconcile .mcp.json against the manifest's engineMcpServers (ADR 0025):
  //    register a newly-shipped engine server the brain is MISSING, taking its
  //    definition from the source's .mcp.json.template with {{PROJECT_ROOT}} substituted
  //    to this brain dir. Existing servers (engine OR user-added) are preserved.
  const engineServerIds = target.engineMcpServers ?? [];
  const templatePath = join(sourceDir, ".mcp.json.template");
  const brainMcpPath = join(brainDir, ".mcp.json");
  const mcpServersAdded = [];
  if (engineServerIds.length > 0 && existsSync(templatePath) && existsSync(brainMcpPath)) {
    const projectRoot = brainDir.split("\\").join("/"); // {{PROJECT_ROOT}} is posix (cf. installer toPosix)
    const templateMcp = JSON.parse(readFileSync(templatePath, "utf8").split("{{PROJECT_ROOT}}").join(projectRoot));
    const brainMcp = JSON.parse(readFileSync(brainMcpPath, "utf8"));
    const before = new Set(Object.keys(brainMcp.mcpServers ?? {}));
    const reconciled = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds });
    writeFileSync(brainMcpPath, JSON.stringify(reconciled, null, 2) + "\n");
    mcpServersAdded.push(...Object.keys(reconciled.mcpServers).filter((id) => !before.has(id)));
  }

  // 3. Regenerate the launchers (both halves, ADR 0015).
  const regenerated = plan.regenerate.length > 0;
  if (regenerated) await regenerateLaunchers({ brainDir, platform });

  // 4. npm install in the brain's rag/ (+ local-mirror/ when present).
  await runInstall({ ragDir: join(brainDir, "rag"), brainDir, platform });

  // 5. Reindex IFF the index schema moved (else the existing index stays valid).
  const reindexed = needsReindex({ local, target });
  if (reindexed) await runReindex({ brainDir, platform });

  // 6. Count the notes the brain holds, for the user-facing recap (F2). Read after
  //    any reindex so it reflects the current vault.
  const vaultNoteCount = await countVaultNotes({ brainDir });

  return { copied, regenerated, reindexed, vaultNoteCount, installedSkills, mcpServersAdded };
}

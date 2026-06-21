// ─────────────────────────────────────────────────────────────────────────────
// staged-skills.mjs — deliver UPGRADER-BOUND skills (ADR 0026). The sacred scrub
// (engine-apply-plan) forbids the engine from writing under `.claude/skills/`, so a
// NEW engine skill can't ride in via the `replace` regime directly. Instead its
// canonical source ships at a NON-sacred staging path `engine-skills/<name>/` (a
// `replace` file → pass-1 delivers it, the scrub keeps it), and this helper
// install-if-absent's each staged skill into `<brainDir>/.claude/skills/<name>/`.
//
// install-if-absent at the SKILL-DIR level (mirrors reconcileBrain's merge-skill
// install, ADR 0025): a skill dir already present (possibly user-customized) is left
// byte-identical; a brand-new staged skill is copied in whole. Pure I/O, win32-safe
// (POSIX rels split back to the OS separator, ADR 0015). Returns the installed names.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";

import { listFilesRelPosix } from "./fs-walk.mjs";

export function installStagedSkills({ sourceDir, brainDir }) {
  const stagingDir = join(sourceDir, "engine-skills");
  if (!existsSync(stagingDir)) return [];

  const installed = [];
  for (const entry of readdirSync(stagingDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const destSkillDir = join(brainDir, ".claude", "skills", name);
    if (existsSync(destSkillDir)) continue; // present → preserve, never overwrite

    const srcSkillDir = join(stagingDir, name);
    for (const rel of listFilesRelPosix(srcSkillDir)) {
      const osRel = rel.split("/").join(sep);
      const dest = join(destSkillDir, osRel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(srcSkillDir, osRel), dest);
    }
    installed.push(name);
  }
  return installed;
}

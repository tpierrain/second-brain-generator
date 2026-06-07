// ═══════════════════════════════════════════════════════════════════════════
// installer-args.mjs — parsing PUR des réponses d'install non-interactive.
// Aucune I/O. parseAnswers(argv, env, defaults) → réponses résolues.
// ═══════════════════════════════════════════════════════════════════════════
import { join } from "node:path";

// Chemin absolu du dossier cerveau à CRÉER : sous `destParent` s'il est fourni,
// sinon sous le home de l'utilisateur. Pur : `home` est injecté (testable,
// déterministe) — jamais d'appel à os.homedir() ici.
export function resolveTargetDir({ name, destParent, home }) {
  return join(destParent ?? home, name);
}

// Flags porteurs d'une valeur (formes `--x=v` ET `--x v`).
const VALUE_FLAGS = ["name", "owner", "lang", "dest"];
// Flags booléens déclenchant le mode non-interactif (avec leurs alias).
const NON_INTERACTIVE_FLAGS = ["non-interactive", "yes", "no-input"];

export function parseAnswers(argv, env, defaults) {
  const flags = {};
  let nonInteractive = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      flags[eq[1]] = eq[2];
      continue;
    }
    const bare = /^--(.+)$/.exec(arg);
    if (!bare) continue;
    if (NON_INTERACTIVE_FLAGS.includes(bare[1])) {
      nonInteractive = true;
    } else if (VALUE_FLAGS.includes(bare[1]) && i + 1 < argv.length) {
      flags[bare[1]] = argv[++i];
    }
  }
  // Précédence flag > env > default, champ par champ.
  const pick = (flag, envKey, def) => flags[flag] ?? env[envKey] ?? def;
  return {
    projectName: pick("name", "SB_PROJECT_NAME", defaults.projectName),
    ownerName: pick("owner", "SB_OWNER_NAME", defaults.ownerName),
    language: pick("lang", "SB_LANGUAGE", defaults.language),
    destParent: pick("dest", "SB_DEST", defaults.destParent),
    nonInteractive,
  };
}

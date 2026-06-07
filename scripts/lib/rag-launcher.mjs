// ─────────────────────────────────────────────────────────────────────────────
// rag-launcher.mjs — génère des lanceurs « self-heal PATH » pour le serveur RAG.
//
// Pourquoi : l'app desktop Claude (onglet Code) lance les serveurs MCP avec un
// PATH minimal — souvent sans /opt/homebrew/bin ni les shims nvm/asdf (mesuré sur
// un Mac nu : PATH = /usr/local/bin). Si node a été installé ailleurs (Homebrew
// Apple Silicon, nvm…), `npx` est introuvable au runtime → le RAG ne démarre pas.
// Le lanceur rajoute les emplacements usuels de node AVANT de lancer le serveur.
//
// Portable : aucun chemin machine n'est baké — on ne prepende que les dossiers
// réellement présents (test d'existence). Source de vérité testée, écrite telle
// quelle par l'installeur dans rag/launch.sh (POSIX) et rag/launch.cmd (Windows).
// ─────────────────────────────────────────────────────────────────────────────

// Bloc PATH self-heal POSIX réutilisable (RAG comme hooks node). Prepend les
// emplacements usuels de node AU PATH, mais uniquement s'ils existent (`[ -d ]`)
// → portable, aucun chemin machine baké. Pas de newline final : composé par
// l'appelant avec sa commande (`exec npx …` ou `exec node "$@"`).
export function pathPrependSh() {
  return `add() { [ -d "$1" ] && PATH="$1:$PATH"; }
add /usr/bin
add /usr/local/bin
add /opt/homebrew/bin
add "$HOME/.asdf/shims"
add "$HOME/.volta/bin"
add "$HOME/.nodenv/shims"
for d in "$HOME"/.nvm/versions/node/*/bin; do add "$d"; done
for d in "$HOME"/.local/share/fnm/node-versions/*/installation/bin; do add "$d"; done
for d in "$HOME/Library/Application Support/fnm"/node-versions/*/installation/bin; do add "$d"; done
export PATH`;
}

// Équivalent Windows du bloc self-heal PATH (cf. pathPrependSh). On ne prepende
// que les dossiers réellement présents (`if exist`). Pas de newline final.
export function pathPrependCmd() {
  return `if exist "%ProgramFiles%\\nodejs" set "PATH=%ProgramFiles%\\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\\nodejs" set "PATH=%ProgramFiles(x86)%\\nodejs;%PATH%"
if exist "%APPDATA%\\npm" set "PATH=%APPDATA%\\npm;%PATH%"
if exist "%LOCALAPPDATA%\\Volta\\bin" set "PATH=%LOCALAPPDATA%\\Volta\\bin;%PATH%"
if exist "%NVM_SYMLINK%" set "PATH=%NVM_SYMLINK%;%PATH%"`;
}

export function buildShLauncher() {
  return `#!/bin/sh
# Lanceur self-heal du serveur RAG (macOS/Linux). Généré par l'installeur.
# Rajoute les emplacements usuels de node au PATH avant de démarrer le serveur,
# pour que npx soit trouvé même si l'app a un PATH minimal. Portable : on ne
# prepende que les dossiers existants (aucun chemin baké).
${pathPrependSh()}
exec npx tsx rag/src/index.ts
`;
}

export function buildCmdLauncher() {
  return `@echo off
REM Lanceur self-heal du serveur RAG (Windows). Généré par l'installeur.
REM Rajoute les emplacements usuels de node au PATH avant de démarrer le serveur,
REM pour que npx soit trouvé même si l'app a un PATH minimal. On ne prepende que
REM les dossiers existants (aucun chemin baké).
${pathPrependCmd()}
npx tsx rag/src/index.ts
`;
}

// Lanceur `node` générique pour les HOOKS (statusLine, auto-commit, session-start).
// Même cause racine que le RAG : l'app desktop lance les hooks avec un PATH minimal
// (mesuré : /usr/local/bin, sans shims nvm/asdf ni /opt/homebrew/bin) → un `node`
// installé via nvm/Homebrew est introuvable et le hook échoue EN SILENCE (le plus
// grave : l'auto-commit ne tourne jamais). On rejoue le self-heal éprouvé du RAG,
// puis on relaie node + tous les arguments du hook (`exec node "$@"`).
export function buildNodeRunnerSh() {
  return `#!/bin/sh
# Lanceur self-heal de node pour les hooks (macOS/Linux). Généré par l'installeur.
# Rajoute les emplacements usuels de node au PATH avant d'invoquer node, pour que
# les hooks tournent même si l'app desktop a un PATH minimal (node via nvm/Homebrew
# sinon introuvable → hooks muets, dont l'auto-commit). On ne prepende que les
# dossiers existants (aucun chemin baké). Relaie node + tous les args du hook.
${pathPrependSh()}
exec node "$@"
`;
}

export function buildNodeRunnerCmd() {
  return `@echo off
REM Lanceur self-heal de node pour les hooks (Windows). Généré par l'installeur.
REM Rajoute les emplacements usuels de node au PATH avant d'invoquer node, pour que
REM les hooks tournent même si l'app desktop a un PATH minimal. On ne prepende que
REM les dossiers existants (aucun chemin baké). Relaie node + tous les args du hook.
${pathPrependCmd()}
node %*
`;
}

// Renvoie une COPIE de baseEnv où seul PATH est neutralisé (le reste — HOME,
// ProgramFiles, APPDATA, LOCALAPPDATA, NVM_SYMLINK… — est préservé car le
// self-heal en a besoin). Sert au smoke-test d'install : prouver que le wrapper
// retrouve node TOUT SEUL, dans le PATH appauvri façon app desktop (sinon le test
// hérite du PATH riche du shell d'install → quasi-faux-positif).
export function minimalPathEnv(platform, baseEnv) {
  if (platform === "win32") {
    // cmd.exe doit rester trouvable (le smoke-test l'invoque) → on conserve juste
    // System32 ; node, lui, viendra du self-heal de run-node.cmd.
    const systemRoot = baseEnv.SystemRoot || "C:\\Windows";
    return { ...baseEnv, PATH: `${systemRoot}\\System32` };
  }
  // posix : sh est lancé en absolu (/bin/sh) → PATH vide, node ne viendra QUE du
  // self-heal → preuve que le wrapper est auto-suffisant.
  return { ...baseEnv, PATH: "" };
}

// Construit la valeur de remplacement {{NODE}} des commandes de hook dans
// .claude/settings.json (statusLine, PostToolUse, SessionStart). Le résultat est
// inséré tel quel dans une string JSON → les guillemets sont déjà échappés (\").
// Pointe en chemin ABSOLU vers le lanceur self-heal run-node.* adapté à l'OS (le
// cwd du hook n'est pas garanti côté app desktop). On bake le chemin résolu (pas
// de {{PROJECT_ROOT}} imbriqué) → aucune dépendance à l'ordre des substitutions.
// projectRootPosix = chemin du cerveau normalisé en slashes « / ».
export function nodeHookCommand(platform, projectRootPosix) {
  if (platform === "win32") {
    // En JSON, chaque séparateur de chemin Windows doit être un backslash échappé
    // (\\). split("/").join("\\\\") produit littéralement « \\ » dans le texte JSON.
    const win = projectRootPosix.split("/").join("\\\\");
    return `cmd /c \\"${win}\\\\scripts\\\\run-node.cmd\\"`;
  }
  return `/bin/sh \\"${projectRootPosix}/scripts/run-node.sh\\"`;
}

// Réécrit la commande du serveur « vault-rag » dans un objet .mcp.json pour qu'il
// passe par le lanceur self-heal adapté à l'OS. Préserve cwd/env/type. Mute et
// renvoie l'objet (pratique à chaîner). `platform` = valeur de process.platform.
export function applyRagLauncher(mcp, platform) {
  const srv = mcp?.mcpServers?.["vault-rag"];
  if (!srv) return mcp;
  if (platform === "win32") {
    srv.command = "cmd";
    srv.args = ["/c", "rag\\launch.cmd"];
  } else {
    srv.command = "/bin/sh";
    srv.args = ["rag/launch.sh"];
  }
  return mcp;
}

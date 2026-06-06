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
// quelle par le bootstrap dans rag/launch.sh (POSIX) et rag/launch.cmd (Windows).
// ─────────────────────────────────────────────────────────────────────────────

export function buildShLauncher() {
  return `#!/bin/sh
# Lanceur self-heal du serveur RAG (macOS/Linux). Généré par le bootstrap.
# Rajoute les emplacements usuels de node au PATH avant de démarrer le serveur,
# pour que npx soit trouvé même si l'app a un PATH minimal. Portable : on ne
# prepende que les dossiers existants (aucun chemin baké).
add() { [ -d "$1" ] && PATH="$1:$PATH"; }
add /usr/local/bin
add /opt/homebrew/bin
add "$HOME/.asdf/shims"
for d in "$HOME"/.nvm/versions/node/*/bin; do add "$d"; done
export PATH
exec npx tsx rag/src/index.ts
`;
}

export function buildCmdLauncher() {
  return `@echo off
REM Lanceur self-heal du serveur RAG (Windows). Généré par le bootstrap.
REM Rajoute les emplacements usuels de node au PATH avant de démarrer le serveur,
REM pour que npx soit trouvé même si l'app a un PATH minimal. On ne prepende que
REM les dossiers existants (aucun chemin baké).
if exist "%ProgramFiles%\\nodejs" set "PATH=%ProgramFiles%\\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\\nodejs" set "PATH=%ProgramFiles(x86)%\\nodejs;%PATH%"
if exist "%APPDATA%\\npm" set "PATH=%APPDATA%\\npm;%PATH%"
if exist "%NVM_SYMLINK%" set "PATH=%NVM_SYMLINK%;%PATH%"
npx tsx rag/src/index.ts
`;
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

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildShLauncher, buildCmdLauncher, applyRagLauncher } from "./rag-launcher.mjs";

test("buildShLauncher : shebang sh + lance le serveur RAG via npx tsx", () => {
  const sh = buildShLauncher();
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /exec npx tsx rag\/src\/index\.ts/);
});

test("buildShLauncher : self-heal des emplacements node invisibles en GUI (homebrew, nvm)", () => {
  const sh = buildShLauncher();
  assert.match(sh, /\/opt\/homebrew\/bin/); // Homebrew Apple Silicon (le cas qui casse)
  assert.match(sh, /\.nvm\/versions\/node\/\*\/bin/); // nvm (glob résolu par sh au runtime)
  assert.match(sh, /\[ -d "\$1" \]/); // ne prepende que les dossiers existants (portable)
});

test("buildCmdLauncher : @echo off + self-heal Windows + lance le serveur RAG", () => {
  const cmd = buildCmdLauncher();
  assert.match(cmd, /@echo off/);
  assert.match(cmd, /%ProgramFiles%\\nodejs/); // installeur officiel Windows
  assert.match(cmd, /npx tsx rag\/src\/index\.ts/);
});

test("applyRagLauncher : réécrit la commande vault-rag selon l'OS, préserve cwd/env", () => {
  const base = {
    mcpServers: {
      "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brain", env: {} },
    },
  };

  const mac = applyRagLauncher(structuredClone(base), "darwin");
  assert.equal(mac.mcpServers["vault-rag"].command, "/bin/sh");
  assert.deepEqual(mac.mcpServers["vault-rag"].args, ["rag/launch.sh"]);
  assert.equal(mac.mcpServers["vault-rag"].cwd, "/brain"); // préservé

  const win = applyRagLauncher(structuredClone(base), "win32");
  assert.equal(win.mcpServers["vault-rag"].command, "cmd");
  assert.deepEqual(win.mcpServers["vault-rag"].args, ["/c", "rag\\launch.cmd"]);
});

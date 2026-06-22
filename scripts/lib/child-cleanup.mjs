// ─────────────────────────────────────────────────────────────────────────────
// child-cleanup.mjs — robust, cross-OS termination of a spawned stdio child.
// ─────────────────────────────────────────────────────────────────────────────

export function buildTreeKill(platform, pid) {
  if (platform !== "win32") return null;
  if (pid == null) return null;
  return { command: "taskkill", args: ["/pid", String(pid), "/T", "/F"] };
}

// Terminate a spawned stdio child so the PARENT can exit, cross-OS. On Windows a
// `.cmd` child runs through `cmd.exe /c` (shell, ADR 0031): `child.kill()` reaps
// only the shell, leaving the real grandchild (the node MCP server) orphaned and
// still holding the inherited stdout pipe — so the parent's read handle never
// EOFs and the process hangs after its last line (field hang, Windows only). We
// therefore (1) kill the child, (2) on Windows tree-kill the orphan via a
// detached `taskkill /T`, and (3) release the parent's own handles (destroy the
// child's stdio + unref) so the event loop can drain regardless. Never throws.
export function terminateChild(child, { platform, spawn } = {}) {
  try {
    child?.kill();
  } catch {}
  const tk = buildTreeKill(platform, child?.pid);
  if (tk && spawn) {
    try {
      const killer = spawn(tk.command, tk.args, { stdio: "ignore", detached: true });
      killer?.unref?.();
    } catch {}
  }
  for (const stream of [child?.stdin, child?.stdout, child?.stderr]) {
    try {
      stream?.destroy();
    } catch {}
  }
  try {
    child?.unref?.();
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// spawn-shell.mjs — decides whether a child_process spawn must go through a shell.
//
// Since Node ≥ 18.20 / 20 (the CVE-2024-27980 hardening), spawning a Windows
// `.cmd`/`.bat` shim (npm.cmd, npx.cmd) WITHOUT `shell:true` throws EINVAL. Real
// executables (node, git → `.exe`) and everything on macOS/Linux are unaffected,
// so enabling the shell only for win32 `.cmd`/`.bat` keeps the fix a no-op
// elsewhere. Pure seam, unit-tested. See ADR 0031.
// ─────────────────────────────────────────────────────────────────────────────

export function needsShell(command, platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

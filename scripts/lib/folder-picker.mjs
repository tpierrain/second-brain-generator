// ═══════════════════════════════════════════════════════════════════════════
// folder-picker.mjs — best-effort, cross-platform NATIVE folder picker.
// Used by the `import` skill so non-dev users don't have to copy-paste the path
// of their old brain. Pure/seam-injectable: no implicit I/O, spawnSync injected.
// Mirrors open-env.mjs (same guarantees: existence-tested commands, never throws,
// no machine path baked in).
// ═══════════════════════════════════════════════════════════════════════════

// Maps a platform + a user-facing prompt to the native folder-picker command, or
// null when the platform is unknown (caller then falls back to copy-paste).
export function buildFolderPickerCommand(platform, prompt) {
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", `POSIX path of (choose folder with prompt "${prompt}")`],
    };
  }
  if (platform === "win32") {
    // FolderBrowserDialog from WinForms; write SelectedPath to stdout ONLY on OK,
    // so a cancel produces empty stdout (treated as "no pick" by pickFolder).
    const ps =
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog; ` +
      `$d.Description = "${prompt}"; ` +
      `if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ` +
      `[Console]::Out.Write($d.SelectedPath) }`;
    return { command: "powershell", args: ["-NoProfile", "-Command", ps] };
  }
  if (platform === "linux") {
    return {
      command: "zenity",
      args: ["--file-selection", "--directory", `--title=${prompt}`],
    };
  }
  return null;
}

// Guard: should we even attempt a native dialog? false in automated/headless
// contexts where a window would spam (tests/CI) or hang (headless Linux).
export function shouldPickFolder(env, platform) {
  if (env.SBG_NO_PICKER) return false;
  if (env.CI) return false;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  return true;
}

// Thin, best-effort wrapper: if the guard allows and we have a command, run the
// native picker SYNCHRONOUSLY (we need its stdout = the chosen path). Returns the
// trimmed path on success, or null on cancel / non-zero exit / empty stdout /
// throw / guard-off. NEVER throws. `spawnSync` is injected.
export function pickFolder({ platform, env, prompt, spawnSync }) {
  if (!shouldPickFolder(env, platform)) return null;
  const cmd = buildFolderPickerCommand(platform, prompt);
  if (!cmd) return null;
  try {
    const res = spawnSync(cmd.command, cmd.args, { encoding: "utf8" });
    if (!res || res.status !== 0) return null;
    const picked = (res.stdout ?? "").trim();
    return picked === "" ? null : picked;
  } catch {
    return null;
  }
}

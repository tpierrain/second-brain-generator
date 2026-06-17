// ═══════════════════════════════════════════════════════════════════════════
// notify.ts — best-effort, cross-platform OS notification for "indexing done".
// After an import/reindex picks up new notes the user otherwise waits blind; a
// native toast tells them the brain is searchable. Pure/seam-injectable: no
// implicit I/O, spawn is injected, NEVER throws. Mirrors scripts/lib/open-env.mjs
// (existence-tested commands, no machine path baked in, deterministic — ADR 0009).
// ═══════════════════════════════════════════════════════════════════════════

import type { SpawnOptions } from "child_process";

export interface NotifyContent {
  title: string;
  body: string;
}

export interface NotifyCommand {
  command: string;
  args: string[];
}

// Maps a platform + content to the native notification command, or null when the
// platform is unknown (caller then stays silent).
export function buildNotifyCommand(
  platform: NodeJS.Platform,
  { title, body }: NotifyContent,
): NotifyCommand | null {
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", `display notification "${body}" with title "${title}"`],
    };
  }
  if (platform === "win32") {
    // Best-effort balloon tip via WinForms NotifyIcon (present on every desktop
    // Windows, no extra module). If the shell can't surface it, the spawn just
    // fails silently — notifyDone swallows it.
    const ps =
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
      `$n.Icon = [System.Drawing.SystemIcons]::Information; ` +
      `$n.Visible = $true; ` +
      `$n.ShowBalloonTip(5000, "${title}", "${body}", ` +
      `[System.Windows.Forms.ToolTipIcon]::Info)`;
    return { command: "powershell", args: ["-NoProfile", "-Command", ps] };
  }
  if (platform === "linux") {
    return { command: "notify-send", args: [title, body] };
  }
  return null;
}

// Guard: should we even attempt a notification? false in automated/headless
// contexts where a toast would spam (install/QA via SBG_NO_NOTIFY, tests/CI) or
// hang (headless Linux).
export function shouldNotify(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): boolean {
  if (env.SBG_NO_NOTIFY) return false;
  if (env.CI) return false;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  return true;
}

// Matches Node's child_process.spawn(command, args, options) overload, so the
// real `spawn` is assignable here while tests can inject a fake (cast as any).
// Is a reindex pass worth a toast? It must have indexed at least `min` notes.
// min=1 for explicit/startup paths (any new note matters). The LIVE watcher uses
// a higher `min` so routine single-note saves stay silent, while a bulk pickup
// (an import of hundreds of notes, a sources sync) still notifies.
export function isNotifyWorthy(indexed: number, min = 1): boolean {
  return indexed >= min;
}

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => { unref: () => void };

export interface NotifyArgs extends NotifyContent {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  spawn: SpawnFn;
}

// Thin, best-effort wrapper: if the guard allows and we have a command, spawn a
// detached notifier and detach. NEVER throws — a failed/absent notifier must not
// break indexing. Returns { notified }. `spawn` is injected.
export function notifyDone({ platform, env, title, body, spawn }: NotifyArgs): {
  notified: boolean;
} {
  if (!shouldNotify(env, platform)) return { notified: false };
  const cmd = buildNotifyCommand(platform, { title, body });
  if (!cmd) return { notified: false };
  try {
    const child = spawn(cmd.command, cmd.args, { detached: true, stdio: "ignore" });
    child.unref();
    return { notified: true };
  } catch {
    return { notified: false };
  }
}

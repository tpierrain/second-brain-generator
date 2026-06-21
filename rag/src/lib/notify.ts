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

// Escape a string for an AppleScript double-quoted literal: backslash is the escape
// char, so a stray `"` (e.g. from a health-check spawn-error detail) can't close the
// `display notification "..."` literal and make osascript exit non-zero (lost toast).
function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Escape a string for a PowerShell double-quoted literal: backtick is the escape char,
// `"` ends the literal, and `$` triggers variable interpolation. Escape the backtick
// FIRST so the others' inserted backticks aren't doubled.
function escapePowerShell(s: string): string {
  return s.replace(/`/g, "``").replace(/"/g, '`"').replace(/\$/g, "`$");
}

// Maps a platform + content to the native notification command, or null when the
// platform is unknown (caller then stays silent). Title/body are arbitrary text (a
// health-check detail may carry a `"`/`` ` ``/`$`), so each is escaped per target — the
// command is always an argv array (not a shell line), so this is literal-safety, not
// shell-injection defence.
export function buildNotifyCommand(
  platform: NodeJS.Platform,
  { title, body }: NotifyContent,
): NotifyCommand | null {
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`],
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
      `$n.ShowBalloonTip(5000, "${escapePowerShell(title)}", "${escapePowerShell(body)}", ` +
      `[System.Windows.Forms.ToolTipIcon]::Info)`;
    return { command: "powershell", args: ["-NoProfile", "-Command", ps] };
  }
  if (platform === "linux") {
    // notify-send receives title/body as separate argv entries → no literal to break.
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

export interface BurstDecision {
  /** Emit a final toast NOW (the burst settled and the total clears the bar). */
  notify: boolean;
  /** Notes indexed across the whole burst so far (the settled total when `notify`). */
  total: number;
}

// A big sync/import lands in waves; the live watcher reindexes each debounced
// batch. Firing "Indexing done — 8 notes" per batch lies twice: a premature
// "done" and a partial count (8 of 27). IndexingBurst accumulates the per-pass
// `indexed` and signals a single, truthful toast ONLY once the watcher is
// quiescent (no pending/scheduled work) — with the settled TOTAL. Deterministic
// (ADR 0009): "settled" = a pass completed with nothing left queued, not a timer.
export class IndexingBurst {
  private acc = 0;

  // Records one completed watcher reindex pass.
  // - `indexed`    notes indexed in THIS pass.
  // - `moreComing` true if the watcher still has queued/scheduled work → the
  //                burst hasn't settled yet (accumulate, stay silent).
  // - `min`        minimum accumulated total worth a toast (bulk threshold).
  // On settle, returns the total and whether to notify, then resets for the next burst.
  record(indexed: number, moreComing: boolean, min = 1): BurstDecision {
    this.acc += indexed;
    if (moreComing) return { notify: false, total: this.acc };
    const total = this.acc;
    this.acc = 0;
    return { notify: total >= min, total };
  }
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
    const child = spawn(cmd.command, cmd.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true, // suppress the powershell console flash on Windows
    });
    child.unref();
    return { notified: true };
  } catch {
    return { notified: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// hook-bootstrap.mjs — the SessionStart bootstrap tick (ADR 0026). On a pre-3.2
// brain, `session-status` is the ONLY already-wired SessionStart hook, so it is the
// natural anchor for the ONE-TIME jump to the v3.3.0 runtime trio (session-self-heal /
// session-health / session-obsidian-hint): it detects the hook-wiring drift (the
// brain's settings.hooks vs the now-current template) and, if a gap exists, spawns the
// detached reconcile ONCE and emits one localized belt line. SessionStart is the
// LEVEL-TRIGGERED reconcile tick — converged → TRUE no-op (no spawn, no emit), so the
// steady state stays free.
//
// No spawn race with session-self-heal: this tick spawns only when a HOOK gap exists,
// which on a pre-3.2 brain is exactly when session-self-heal is not yet wired; and even
// past that, the reconcile CLI both would spawn is idempotent, so a double-tick is safe.
//
// Pure orchestration over injected seams (detectHookGap + spawn + emit) → trivially
// testable. Fail-soft: it NEVER throws — a broken bootstrap must not block a session.
// ─────────────────────────────────────────────────────────────────────────────
import { detectHookGap } from "./hooks-reconcile.mjs";

export function bootstrapSessionHooks({ brainHooks, templateHooks, brainDir, message, spawnReconcile, emit }) {
  try {
    const gap = detectHookGap({ brainHooks, templateHooks });
    if (!gap.needed) return { bootstrapped: false };
    // Spawn FIRST, then emit the reassurance only once the reconcile actually launched —
    // a spawn failure must surface as the single non-blocking error line, not alongside a
    // reassurance that turned out to be a lie.
    spawnReconcile({ brainDir });
    if (message) emit(message);
    return { bootstrapped: true, missingHooks: gap.missingHooks };
  } catch (e) {
    const error = e?.message ?? String(e);
    emit(`⚠️ Brain hook bootstrap skipped (non-blocking): ${error}`);
    return { bootstrapped: false, error };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// git-push.mjs — pure decision seam for the auto-push hook (no I/O, testable).
// shouldPush() answers: given the git state the hook observed, should we push?
// ─────────────────────────────────────────────────────────────────────────────

export function shouldPush({ hasRemote, autopush, hasUpstream, unpushedCount }) {
  return hasRemote && autopush && hasUpstream && unpushedCount > 0;
}

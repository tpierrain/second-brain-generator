import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldNudgeRestart, restartNoticeBanner } from "./postinstall-restart-notice.mjs";

// ⛔ The "message in a bottle" (Thomas, 2026-06-21). The OLD update orchestrator (frozen on a
// pre-3.3 brain) ALWAYS runs `npm install` in rag/ with stdio:"inherit", and npm ALWAYS runs the
// `postinstall` of the package.json ON DISK — which is the NEW one (replace regime, copied before
// install). So a NEW postinstall runs UNDER the OLD orchestrator, deterministically, on the very
// first update. It must fire ONLY during an update, never on a fresh install.
//
// The deterministic update-vs-install signal: at postinstall time the new rag/package.json is on
// disk (new rag version) but the manifest still records the OLD version (it is rewritten AFTER
// npm install, step 7). So recorded != package ⇒ an update is mid-flight ⇒ nudge.

test("shouldNudgeRestart — update mid-flight (manifest exists, recorded rag != package rag) → true", () => {
  assert.equal(
    shouldNudgeRestart({ manifestExists: true, recordedRagVersion: "1.1.0", packageRagVersion: "1.1.5" }),
    true,
  );
});

test("shouldNudgeRestart — fresh install / no-op re-install (recorded == package) → false (no crying wolf)", () => {
  assert.equal(
    shouldNudgeRestart({ manifestExists: true, recordedRagVersion: "1.1.5", packageRagVersion: "1.1.5" }),
    false,
  );
});

test("shouldNudgeRestart — no manifest yet (brain not created, raw fresh install) → false", () => {
  assert.equal(
    shouldNudgeRestart({ manifestExists: false, recordedRagVersion: undefined, packageRagVersion: "1.1.5" }),
    false,
  );
});

// The banner lands in npm's stdout (stdio:"inherit") → the agent's tool result → the chat. The
// only renderer of the Desktop chat is the AGENT, so the banner is phrased as a DIRECTIVE to the
// agent (like a SessionStart additionalContext), maximizing the chance it surfaces it verbatim.
test("restartNoticeBanner — directs the AGENT to tell the user to restart, loudly, citing the constitution", () => {
  const b = restartNoticeBanner();
  assert.match(b, /RESTART/i);
  assert.match(b, /tell the user|inform the user/i); // agent-directed, not raw user prose
  assert.match(b, /CLAUDE\.md|constitution/i);        // the WHY: the constitution changed
  assert.match(b, /⚠️/);                               // unmissable
  // It must NOT undercut itself with an "optional / nothing to do" framing.
  assert.doesNotMatch(b, /nothing to do|optional|rien à faire/i);
});

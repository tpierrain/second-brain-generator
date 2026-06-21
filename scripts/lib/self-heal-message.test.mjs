import { test } from "node:test";
import assert from "node:assert/strict";

import { bootstrapReassuranceMessage } from "./self-heal-message.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// self-heal-message — the ONE-TIME bootstrap reassurance line, localized by the
// brain's BRAIN_LOCALE (ADR 0026). This is the first runtime/user-facing string
// the engine localizes (hooks are English-only otherwise). The FR text is an
// intentional product localization (the brain speaks the user's language), not an
// artifact to anglicize. Fail-soft: any unknown / missing locale falls back to EN.
// ═══════════════════════════════════════════════════════════════════════════

test("bootstrapReassuranceMessage — EN: one-time, background, RESTART once", () => {
  const msg = bootstrapReassuranceMessage("en");
  assert.match(msg, /one-time/i);
  assert.match(msg, /restart/i, "the user must be told to restart Claude once");
});

test("bootstrapReassuranceMessage — FR: localized (the brain speaks the user's language)", () => {
  const msg = bootstrapReassuranceMessage("fr");
  assert.match(msg, /redémarr/i, "the FR line must tell the user to redémarrer Claude");
  assert.notEqual(msg, bootstrapReassuranceMessage("en"), "FR must differ from EN");
});

test("bootstrapReassuranceMessage — fail-soft: an unknown locale falls back to EN", () => {
  assert.equal(bootstrapReassuranceMessage("zz"), bootstrapReassuranceMessage("en"));
  assert.equal(bootstrapReassuranceMessage(undefined), bootstrapReassuranceMessage("en"));
});

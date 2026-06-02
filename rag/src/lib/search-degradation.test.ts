import { test } from "node:test";
import assert from "node:assert/strict";
import { capExceededSearchMessage } from "./search-degradation.js";
import { DailyCapExceededError } from "./usage-tracker.js";

test("4.1 — DailyCapExceededError → message clair (quota du jour, reprise demain, index déjà interrogeable)", () => {
  const msg = capExceededSearchMessage(new DailyCapExceededError(950, 950));
  assert.notEqual(msg, null);
  assert.match(msg!, /quota/i);
  assert.match(msg!, /demain/i);
});

test("4.1 — toute autre erreur → null (on ne masque pas une vraie erreur)", () => {
  assert.equal(capExceededSearchMessage(new Error("réseau down")), null);
});

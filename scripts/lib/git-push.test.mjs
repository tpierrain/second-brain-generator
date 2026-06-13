import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPush } from "./git-push.mjs";

// Decision seam for the auto-push hook: pure function, no I/O. Given the git
// state observed by the hook, decides whether a `git push` should happen.
// Matrix (most-blocking first): no remote → false; autopush ≠ true → false;
// no upstream → false (skip best-effort, `-u` stays wired at install time);
// 0 pending commit → false; otherwise → true.

test("shouldPush — no remote → false", () => {
  assert.equal(
    shouldPush({ hasRemote: false, autopush: true, hasUpstream: true, unpushedCount: 3 }),
    false,
  );
});

test("shouldPush — remote + autopush + upstream + pending commits → true", () => {
  assert.equal(
    shouldPush({ hasRemote: true, autopush: true, hasUpstream: true, unpushedCount: 3 }),
    true,
  );
});

// Matrix completeness: each remaining gate, flipped alone, blocks the push.

test("shouldPush — autopush OFF (opt-in absent) → false", () => {
  assert.equal(
    shouldPush({ hasRemote: true, autopush: false, hasUpstream: true, unpushedCount: 3 }),
    false,
  );
});

test("shouldPush — no upstream → false (skip best-effort, no auto `-u` here)", () => {
  assert.equal(
    shouldPush({ hasRemote: true, autopush: true, hasUpstream: false, unpushedCount: 3 }),
    false,
  );
});

test("shouldPush — nothing pending (@{u}..HEAD empty) → false (no network call)", () => {
  assert.equal(
    shouldPush({ hasRemote: true, autopush: true, hasUpstream: true, unpushedCount: 0 }),
    false,
  );
});

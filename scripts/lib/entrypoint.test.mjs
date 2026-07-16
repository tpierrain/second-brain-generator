import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { isEntrypoint } from "./entrypoint.mjs";

test("isEntrypoint — true when the meta-url is the canonical URL of argv1", () => {
  const argv1 = "/Users/dev/brain/scripts/clear-example-notes.mjs";
  assert.equal(isEntrypoint(pathToFileURL(argv1).href, argv1), true);
});

test("isEntrypoint — false for a different file", () => {
  const argv1 = "/Users/dev/brain/scripts/clear-example-notes.mjs";
  const otherUrl = pathToFileURL("/Users/dev/brain/scripts/reindex.mjs").href;
  assert.equal(isEntrypoint(otherUrl, argv1), false);
});

test("isEntrypoint — true when argv1 contains a space (percent-encoded path)", () => {
  // import.meta.url is ALWAYS a canonical, percent-encoded file URL. A path with a
  // space (`C:\Users\John Doe\…`, `/Users/John Doe/…`) encodes to `%20`, whereas the
  // hand-rolled `file://${argv1}` keeps the literal space → the guard never matched
  // → silent no-op (bug B2). This reproduces it cross-platform, no Windows needed.
  const argv1 = "/Users/John Doe/brain/scripts/clear-example-notes.mjs";
  assert.equal(isEntrypoint(pathToFileURL(argv1).href, argv1), true);
});

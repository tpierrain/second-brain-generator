import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

// Modules under src/lib that intentionally ship WITHOUT a sibling unit test.
// Adding a name here must be a CONSCIOUS, reviewed decision with a reason in the
// comment — never a silent skip. Empty by design: the document-scanner /
// vault-watcher 0%-mutation gap came precisely from "it's just I/O glue, no test
// needed" dismissals. Pure I/O glue still hides logic; extract it behind a port
// and test it (see maintainers/CONVENTIONS.md, "Test the glue too").
const EXEMPT = new Set<string>([]);

// Deterministic guardrail (ADR 0009 spirit): every logic module in src/lib must
// carry a sibling *.test.ts. Catches the "no test at all" gap instantly — without
// waiting for a mutation run — and fails LOUD with the offending file names.
test("every src/lib module has a sibling *.test.ts (no silently-untested logic)", () => {
  const entries = readdirSync(here);
  const tests = new Set(entries.filter((f) => f.endsWith(".test.ts")));
  const prod = entries.filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts")
  );

  const missing = prod.filter(
    (f) => !EXEMPT.has(f) && !tests.has(f.replace(/\.ts$/, ".test.ts"))
  );

  assert.deepEqual(
    missing,
    [],
    `These src/lib modules have no sibling test (add one, or justify in EXEMPT): ${missing.join(", ")}`
  );
});

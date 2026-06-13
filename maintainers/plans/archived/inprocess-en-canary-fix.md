# Plan — Fix the in-process + EN canary failure (2026-06-10)

> **STATUS: ✅ SHIPPED 2026-06-10** — fix "Both" delivered (commits `4dc2200` *raise
> `SEARCH_DEFAULT_LIMIT` 5→8* + `aa60ede` *re-phrase EN inertia-trophy note so the winner chunk ranks #1*).
> `SEARCH_DEFAULT_LIMIT = 8` (`rag/src/lib/config.ts:44`); EN **and** FR in-process installs exit 0;
> grep-proof 3-stage canary preserved. Memory `en-translation-broke-inprocess-canary.md` marked RESOLVED.

> **Delegated after `/clear`.** Branch: `chore/install-ux-feedback` (E/F/G already shipped & pushed).
> Decision taken by Thomas: **"Both"** — re-phrase the EN demo notes to lift the winner chunk into
> the default top-K **and** bump `SEARCH_DEFAULT_LIMIT`. TDD where it applies; validate **empirically**
> with a disposable install (Thomas's working style: prove the gray zones on the *shipped* artifact).

---

## The bug (proven, deterministic — found 2026-06-10)

A fresh **non-interactive `--embedder in-process --lang en`** install (Mac M-series, 24 GB) **FAILS
its post-flight 9/9**: *"POST-FLIGHT FAILURE — the brain does NOT answer from the vault: search_vault
response with no vault source cited."* `verify-rag.mjs` fails identically. The **same install
`--lang fr` PASSES.**

- **Root cause:** the canary's winning chunk — `vault/decisions/2025-11-20-inertia-trophy.md`,
  `## Consequences`: *"…the 2025 Inertia Trophy goes to **Pélagie de Mollecuisse**, with a record
  **DNR of 98.7%**…"* — ranks **9th** in `search_vault` for the in-process embedder on the EN
  question, but `SEARCH_DEFAULT_LIMIT = 5` (`rag/src/lib/config.ts:44`). So the chunk is **never
  returned** (verified: present at limit 10 / rank 9; absent at limit 5 and 8; identical across 2 runs).
- **Why EN only:** the **Lot-7 English translation** demoted the chunk. EN question words
  ("publicly honored / loafed the most / percentage") have weaker embedding overlap with the EN note
  ("crowning / Inertia Trophy / unproductiveness / DNR 98.7%") than the FR pair does. The EN
  translation's E2E was likely validated under **Gemini**, not in-process → masked until now.
- **Independent of E/F/G** (they touch neither `rag/` nor `vault/`). Pre-existing on the branch.
- **Severity (not just the smoke test):** §0 of the constitution tells the user to type **exactly**
  this question as the wiring test. In in-process+EN, Claude searches with limit 5 → never sees the
  Pélagie chunk → would answer "I don't find it" / hallucinate. **The recommended default option is
  broken for English users in real use.**

Memory: `en-translation-broke-inprocess-canary.md`.

---

## The fix — "Both" (belt-and-suspenders)

### Part 1 — Bump the default search limit
**File:** `rag/src/lib/config.ts:44`. Change `SEARCH_DEFAULT_LIMIT = 5` → **`8`** (re-check after
Part 2; if the re-phrased chunk can't be brought ≤ 8 deterministically, use **10**).
- No test asserts the value `5` (grepped) → safe. It is consumed in `rag/src/index.ts:78` and
  `rag/src/tools/search-vault.ts:41` via the constant — nothing else to change.
- Trade-off to accept consciously: every search now returns up to 8 results (more context for Claude;
  marginally longer responses). This is the intended product change.

### Part 2 — Re-phrase the EN demo notes so the winner chunk ranks ≤ 5
**Primary file:** `vault/decisions/2025-11-20-inertia-trophy.md` (EN only — **do NOT touch the FR
overlay** `templates/fr/vault/decisions/2025-11-20-trophee-de-l-inertie.md`; FR already passes and
changing it risks a regression). Secondary, if needed: `vault/topics/flemmr.md`,
`vault/people/jean-kevin-de-la-glandee.md`.

**Goal:** strengthen the semantic resonance between the winner chunk and the EN question
("a person singled out / celebrated for being the least active, expressed as a rate/%") **without**
breaking the grep-proof invariant.

> ⚠️ **HARD CONSTRAINT — the grep-proof invariant (`scripts/lib/demo.test.mjs`).** No **content word
> of the EN question** may appear (as a substring, case-insensitive) in ANY of the 3 cluster notes
> (`inertia-trophy.md`, `topics/flemmr.md`, `people/jean-kevin-de-la-glandee.md`). The forbidden EN
> tokens (question content words ≥ 4 letters, minus stopwords) are:
> **`outfit`, `helps`, `folks`, `quit`, `overworking`, `worker`, `publicly`, `honored`, `loafed`,
> `percentage`.**
> → Lift the rank using **near-synonyms that are different tokens** (they embed close but don't trip
> grep): e.g. *celebrated / recognized / distinguished* (≠ honored), *least active / idlest / did the
> least* (≠ loafed), *rate / share / proportion* (≠ percentage), *staff member / employee / colleague*
> (≠ worker). Keep `Pélagie de Mollecuisse`, `98.7%`, and the `DNR`/`Do-Nothing Rate` answer tokens.
> The question must keep **≥ 4** content words (the test asserts this) — don't gut it.

**Alternative lever (use sparingly):** lightly tune the **EN question** itself
(`scripts/lib/demo.mjs` → `DEMO_BY_LOCALE.en`). If you do, you MUST sync the **verbatim** copies:
- `README.md` (the demo question quoted ~l.234, the "outfit/folks/loafed…" line),
- and ideally the §0 paraphrase in `CLAUDE.md.template` (it says "roughly like this" — looser, but
  keep it consistent). The FR question/notes stay untouched.
Prefer tuning the **note** over the question (less ripple). Re-run `demo.test.mjs` after every edit.

### Diagnostic probe (measure the rank after each edit)
Re-index then probe with this throwaway script **run from inside a freshly-installed in-process EN
brain** (the embedder must be in-process to reproduce; the launcher repo's `vault/` is the EN source):

```js
// probe.mjs at the brain root
import { smokeTestMcp } from "./scripts/lib/mcp-smoke.mjs";
import { DEMO_QUESTION, DEMO_EXPECT } from "./scripts/lib/demo.mjs";
for (const limit of [5, 8, 10]) {
  const r = await smokeTestMcp({
    command: "/bin/sh", args: ["rag/launch.sh"], cwd: process.cwd(),
    expectTools: ["search_vault"], timeoutMs: 60000,
    probe: { tool: "search_vault", args: { query: DEMO_QUESTION, limit }, expectText: DEMO_EXPECT },
  });
  let rank = -1;
  (r.probeText ?? "").replace(/\n### (\d+)\. [\s\S]*?(?=\n### \d+\.|\s*$)/g,
    (m, n) => { if (/Mollecuisse/i.test(m)) rank = Number(n); return m; });
  console.log(`limit=${limit} ok=${r.ok} canaryRank=${rank}`);
}
```
Iterate the note phrasing until **`canaryRank ≤ 5`** (target) and the post-flight passes at the new
default limit. (Re-index between edits: `cd rag && npm run reindex`, or let the helper / installer do it.)

---

## Validation (must all pass before committing)
1. `node --test scripts/**/*.test.mjs scripts/*.test.mjs` → **green** (esp. both `grep-proof (en/fr)`
   in `demo.test.mjs`).
2. `cd rag && npm test` → green (rag suite; the limit change touches no rag test, but confirm).
3. **Disposable install, EN, in-process** → post-flight **exit 0** + `node scripts/verify-rag.mjs`
   exit 0:
   ```bash
   DEST=$(mktemp -d /tmp/sbg-en.XXXXXX)
   node installer.mjs --non-interactive --name brain-en --dest "$DEST" --owner Thomas --lang en --embedder in-process
   ```
4. **Disposable install, FR, in-process** → still **exit 0** (no regression from the limit bump).
5. Clean up: `rm -rf /tmp/sbg-en.* /tmp/sbg-fr.*`.

> Don't pretend: the installer **judges success itself** (non-zero exit = failure). Only declare done
> on a real exit 0 from a fresh in-process EN install — not from the launcher's own test instance.

---

## Suggested commits (separate, on `chore/install-ux-feedback`)
1. `fix(rag): raise SEARCH_DEFAULT_LIMIT 5→8 so the canary chunk is retrievable`
2. `fix(vault): re-phrase EN inertia-trophy note so the winner chunk ranks in top-5 (in-process), grep-proof preserved`
   *(combine 1+2 if they only make sense together; keep the rationale in the body.)*
3. Update memory `en-translation-broke-inprocess-canary.md` → mark RESOLVED (with the final rank +
   limit + proof: EN & FR in-process installs exit 0).

## Cross-cutting reminders
- **EN only** for note phrasing; FR vault/notes untouched (FR passes).
- The limit bump is locale-agnostic (config) → re-validate FR too.
- Keep the canary's **3-stage** property (routing / provenance / semantics) intact — the grep-proof
  test is the guardrail; never weaken it to make the rank work.
- After this lands, consider whether the **eval-set** (Flemmr, 90% in-process) should be re-checked —
  optional; the canary passing in-process EN is the bar for this fix.

# Engine packaging — Phase 0 action plan (Track D: decouple now, defer the channel)

**STATUS: 🚧 IN PROGRESS.** Gate #0 written (red, by design) + **Step 1 done** on branch
`claude/engine-packaging-phase0-wmfjxz`. See **Progress log** at the bottom before continuing.

Enacts **Phase 0** of
[`engine-packaging-study.md`](engine-packaging-study.md) (Track D), under the four-part model and the
founding principle of [`ADR 0012`](../decisions/0012-engine-packaging-four-part-model.md). Makes the
**Engine observable and relocatable** without choosing a distribution channel yet. **Scope:** Second
brain (runtime) + Installer.

**Governing principle (ADR 0012, non-negotiable):** *additive-only upgrade.* An upgrade **never deletes
or overwrites** a **Personal Extension** or any **Content**. Mechanically: a **write-allowlist** + a
**managed file set**, never "replace the folder" / `rsync --delete`. Phase 0 lays the data that makes
this guarantee *structural* (the manifest); it implements no upgrade command.

**Vocabulary (ADR 0012):** *Installer* (the launcher — out of scope) · **Engine** (the upstream-provided
runtime machinery — the subject) · **Personal Extensions** (user-made tooling grafted on — sacred) ·
**Content** (the vault — sacred). "Engine" below always means the second one.

---

## Goal

Build the **seam**, commit to **no policy**. After this plan, a brain can (a) **report** which Engine it
runs (a version *vector*), (b) run an Engine **told where the vault is** (not welded to `<brain>/rag/`),
and (c) be upgraded later by a follow-up (Track A/B/C) that knows, deterministically, **which files are
Engine** — so that Personal Extensions and Content are untouchable *by construction*. **Zero behaviour
change for existing brains:** every new input **defaults to today's value**.

Three deliverables, independent, shippable one at a time (a `/clear` between each), each in TDD
(skill `tdd-discipline`: a failing test first, baby-steps, refactor not optional):

1. **Relocatable paths** — `config.ts` reads vault/cache/env from the environment, defaulting to today's
   relative paths.
2. **Observable version vector** — real semver + `engine_version` (a vector) and `index_schema_version`
   surfaced via `vault_stats`; the index stamp carries the schema version.
3. **Ownership manifest** — an explicit `engine-manifest.json` keyed **by upgrade regime**
   (replace / merge / never-touch) + an Engine marker for `.mcp.json` — with the **survival test** as the
   plan's first acceptance gate.

## Execution kickoff (run in a fresh window — avoid context rot)

Execute this plan from a **new session**, not by dragging a long conversation along. The committed docs
(ADR 0012 + this plan) **are** the external memory — the new window needs nothing else. Open it and give
it only:

> Read and follow `maintainers/decisions/0012-engine-packaging-four-part-model.md` and
> `maintainers/plans/engine-packaging-phase0-action.md` **to the letter** (four-part model, additive-only
> founding principle, three regimes). Work on branch **`claude/engine-packaging-phase0-impl`**. **Do NOT
> merge to `main`** (demo week — runtime code merges only after). **TDD strict** (skill `tdd-discipline`):
> write **gate #0** (the survival test) first, then **Step 1 only**, then stop and show me the diff. Keep
> the `rag` suite green; commit + push to the impl branch.

**Steps 2 and 3 each get their own fresh window**, same pattern (one clean context per step — the
tablet-friendly equivalent of `/clear` between steps). Branch off `main` once the framing PR is merged;
otherwise branch off `claude/engine-packaging-study-2nzmkg`.

## Acceptance gate #0 — the founding principle, made testable (do this first)

Before any of the three steps, write the **survival test** that every later step must keep green. It is
the executable form of ADR 0012's principle:

> Given a brain with a **home-made skill** (`.claude/skills/zzz-mine/SKILL.md`), a **custom script**
> (`scripts/my-tool.mjs`), a **custom sub-agent**, and a **vault note** — none of them mentioned by
> `engine-manifest.json` — the set of paths an upgrade is *allowed to write* (derived **only** from the
> manifest's `replace ∪ merge ∪ regenerate ∪ engineMcpServers`) **contains none of them.**

This test has no production code to pass yet (the manifest doesn't exist until Step 3); it is written
**red** alongside Step 3 and is the gate that makes "Personal Extensions are sacred" a fact, not a hope.
It encodes the **write-allowlist** semantics: the upgrade enumerates *what it may touch*, never *what to
delete* — so an unmentioned file cannot even be a candidate.

## Step 1 — Relocatable paths (config.ts reads the environment)

**Why:** today [`rag/src/lib/config.ts`](../../rag/src/lib/config.ts) pins everything by position
(`resolve(__dirname, "../../..")`) → the Engine is welded to `<brain>/rag/`. An upgrade channel needs the
Engine to be able to live elsewhere and be *told* where the vault is.

**Change:** a pure, tested resolver that prefers an env var, else falls back to today's path.

```ts
// pure + unit-testable: env wins, else the historical relative default
export function resolvePath(envValue: string | undefined, fallback: string): string {
  return envValue && envValue.trim() ? resolve(envValue) : fallback;
}
export const VAULT_DIR = resolvePath(process.env.VAULT_DIR, resolve(projectRoot, "vault"));
export const CACHE_DIR = resolvePath(process.env.CACHE_DIR, resolve(__dirname, "../../.cache"));
const envPath        = resolvePath(process.env.SBG_ENV_PATH, resolve(projectRoot, ".env"));
```

**Tests** (`paths.test.mts`): env absolute → resolved; env relative → resolved against cwd; empty /
whitespace / unset → historical fallback (the regression guard).

**Acceptance:** existing brains — no env set — behave **identically** (same `VAULT_DIR`/`CACHE_DIR`/
`envPath`). New env vars override. `rag` suite stays green.

**Out of scope:** changing `.mcp.json.template` to *pass* those vars — the defaults already cover the
current layout, so leave the template untouched until a channel (A/B) needs relocation. Document the vars
in `.env.example` as **advanced/optional**.

## Step 2 — Observable version vector (semver + vault_stats + index schema stamp)

**Why:** `rag/package.json` is a static `1.0.0`, never bumped, surfaced nowhere. You cannot tell a stale
brain from a fresh one — the prerequisite of any upgrade UX and of stale-index detection. And per ADR
0012 the Engine is **several layers**, so the version is a **vector**, not one number.

**2a. Real semver + version vector.** The Engine version is
`{ rag, constitutionTemplate, scripts }`. **This step implements `rag` end-to-end** (semver in
`rag/package.json`); `constitutionTemplate` and `scripts` start as static fields in the manifest
(Step 3) and get their own bump discipline when those layers actually change. Bump rule for `rag`:
**MAJOR** = index schema changes (forces a reindex) · **MINOR** = behaviour/format change behind the
stable MCP port · **PATCH** = fix, no format change. Start at the honest current number (decide
`1.0.0` vs `1.1.0` in the PR).

**2b. Index schema version in the stamp.** Extend the existing index identity (ADR 0007 stamps
provider/model/dimension — see the embedder-identity / index-freshness code) with an `indexSchemaVersion`
constant. On Engine start, compare the running constant to the stamped value (reuse `index-freshness`):
mismatch → the **existing** confirm-gate → reindex path. **No new framework** — this is the same
machinery that already guards an embedder swap.

**2c. Surface via `vault_stats`.** Add `engine_version` (the vector, read from `package.json` + manifest)
and `index_schema_version` (stamped value + running constant, so a drift is visible) to `vault_stats`.
Only public-contract change, and it is **additive** (ADR 0006 allows generalising `vault_stats`) → no
breakage.

**Tests:** `vault_stats` includes `engine_version.rag` matching `package.json` (read it, don't hardcode —
non-brittle assert); stamp round-trip (write vN, read vN); drift (running ≠ stamped → stale path fires,
gate mocked).

**Acceptance:** `vault_stats` reports the Engine vector; bumping `indexSchemaVersion` makes a brain detect
its index stale and offer a reindex; same-version brains see no prompt.

## Step 3 — Ownership manifest (engine-manifest.json, keyed by regime + .mcp.json marker)

**Why:** today the four-part line is implicit. [`tracked-files.mjs`](../../scripts/lib/tracked-files.mjs)
is an *install-time* allowlist, not an *upgrade-time* ownership map. A future `update-engine` must know,
deterministically, **what it may write** — and, by the founding principle, *what it must never touch*.

**3a. `engine-manifest.json`** at the launcher root (and copied into the brain), keyed **by the three
regimes** of ADR 0012. The file lists **only Engine paths**; everything not listed is, by construction,
a Personal Extension or Content → untouchable.

```json
{
  "manifestVersion": 1,
  "engineVersion": { "rag": "1.1.0", "constitutionTemplate": "1.0.0", "scripts": "1.0.0" },
  "indexSchemaVersion": 1,
  "regimes": {
    "replace":   ["rag/src/**", "rag/package.json", "rag/tsconfig.json"],
    "regenerate":["rag/launch.sh", "rag/launch.cmd"],
    "merge":     ["CLAUDE.md", ".claude/settings.json",
                  ".claude/skills/coach/**", ".claude/skills/sync/**",
                  ".claude/skills/sync-sources/**", ".claude/skills/improve/**",
                  ".claude/skills/prepare-1-1/**", ".claude/skills/tdd-discipline/**",
                  "scripts/auto-commit.mjs", "scripts/auto-push.mjs",
                  "scripts/status-line.mjs", "scripts/verify-rag.mjs"]
  },
  "engineMcpServers": ["vault-rag"]
}
```

**Two open questions of the study, resolved here (ADR 0012 makes the call):**

- **Q#4 — the hook/runtime scripts** (`auto-commit`, `auto-push`, `status-line`, `verify-rag`): Engine,
  but **`merge`, not `replace`.** The founding principle tie-breaks: a user *might* have tweaked them, so
  we never blind-overwrite — we offer a diff. (They also carry install-substituted placeholders
  `{{NODE}}`/`{{PROJECT_ROOT}}`; a clean merge compares against the **template**, not the substituted
  file — an implementation note for Phase 1.)
- **Q#5 — the shipped skills** (`coach`, `sync`…): Engine, **`merge`.** They live in the user's
  `.claude/skills/` and may be **forked** → never overwrite. **Critically, they are listed by name**, one
  glob per shipped skill — **never** a blanket `.claude/skills/**`, which would swallow a home-made skill
  and break the founding principle. A separate opt-in `update-skills` (Phase 1) drives their 3-way merge.

**Replace ⇒ "replace-if-unmodified, else confirm" (the principle, even for `replace`).** Even a `replace`
file must not blind-overwrite a locally-patched copy. So the manifest is designed to carry (or let Phase 1
derive from git) a **provenance fingerprint** per Engine file; the upgrade overwrites only when the local
file still matches the shipped one, otherwise it falls back to merge/confirm (dpkg-conffiles semantics).
Phase 0 reserves the field; Phase 1 implements the comparison.

**3b. `.mcp.json` Engine marker.** The Engine MCP entry is always keyed `vault-rag`; the manifest declares
`engineMcpServers: ["vault-rag"]`. A future `update-engine` rewrites **only** those keys and **deep-merges
the rest** (the user's Slack/Drive/Notion connectors are never enumerated for rewrite). Keep `.mcp.json` a
plain MCP file — no custom schema extension.

**Tests** (`engine-manifest.test.mjs`):
- **the survival test (gate #0)** — a home-made skill, a custom script, a sub-agent and a vault note are
  **not** in `replace ∪ merge ∪ regenerate` nor under `engineMcpServers`.
- **no over-broad glob** — no manifest glob matches a synthetic `.claude/skills/<random>/SKILL.md` or
  `scripts/<random>.mjs` (guards against a blanket `.claude/skills/**`).
- **regime disjointness** — `replace`, `merge`, `regenerate` are pairwise disjoint.
- **engine paths only** — every listed path resolves to an Engine artefact the installer actually writes
  (cross-check against `.mcp.json.template` for `engineMcpServers`; against the shipped skill folders for
  the `merge` skill globs) → the manifest can't drift from reality.

**Acceptance:** one machine-readable source of truth, keyed by regime; the survival test is green and
fails loudly if Engine ever overlaps a Personal Extension. **No runtime behaviour changes** — this is data
for Phase 1.

---

## Sequencing & validation

- **Order:** gate #0 (survival test, red) → 1 → 2 → 3 (3 turns gate #0 green). Steps 1/2/3 are
  independent; one `/clear` between them.
- **Whole-plan acceptance:**
  1. **Founding principle** — the survival test is green (Personal Extensions & Content are outside every
     writable regime).
  2. **No regression** — existing brains, no env set: identical paths, no new prompts; `rag` suite green.
  3. **Observable** — a fresh brain reports its `engine_version` vector via `vault_stats`.
  4. **Safe schema bump** — bumping `indexSchemaVersion` triggers the *existing* reindex gate; same
     version → no prompt.
- **Definition of done (house rule):** set this file's STATUS to ✅ with commit SHAs + what was verified,
  and `git mv` it into [`plans/archived/`](archived/).
- **Explicitly NOT in Phase 0:** any re-pull/update command, npm publish, plugin, `.mcp.json` *merge*
  logic, fingerprint comparison, or `update-skills`. Those are Phase 1+ (Tracks A/B/C). Phase 0 lays the
  seam only.
- **Production note (demos in flight):** Phase 0 is non-regressive by design, but the standing rule holds
  — **nothing merges to `main` before the client demos**; this work lands on a branch, verified by a
  green `rag` suite + `verify-rag` on a test brain, and merges only after.

## Then what

- **Phase 1 (Track A)** — opt-in `update-engine` reading `engine-manifest.json`: re-pull the `replace`
  set from a pinned source (replace-if-unmodified, else confirm), 3-way-merge the `merge` set, never touch
  the rest; reindex iff `indexSchemaVersion` moved. Non-destructive **by construction** — the survival
  test already proves the boundary. A sibling opt-in `update-skills` drives the shipped-skill merges.
- **Phase 2 (Tracks B → C)** — at publication: semver npm package with a **vendored offline fallback**
  (Engine must still start offline, ADR 0001/0012), then a plugin wrapping install + update. The ADR
  0002-addendum hybrid, enacted on proven user-base need.

The framing is now fixed by **ADR 0012**; this plan is its first, smallest, fully-reversible increment.

---

## Progress log (external memory — read this to continue in a fresh window)

**Branch:** `claude/engine-packaging-phase0-wmfjxz` (NOT `main` — demo week). Steps continue here on the
same branch unless told otherwise. **One `/clear` (fresh window) between steps** to avoid context rot.

### ✅ Gate #0 — survival test (written RED, by design)
- `scripts/lib/engine-manifest.test.mjs` — the founding-principle gate: a home-made skill, a custom
  script, a custom sub-agent and a vault note are **not** in `replace ∪ merge ∪ regenerate` nor under
  `engineMcpServers`. Self-contained (inlined glob→RegExp matcher; reads `engine-manifest.json` from the
  repo root).
- **Intentionally red** until Step 3 (the manifest doesn't exist yet): it is the **only** failing test
  in the harness suite (`node --test scripts/lib/*.test.mjs` → 144/145; the 1 fail is this gate). The
  **RAG suite stays green** — that is the kickoff's "keep the rag suite green", harness gate excepted.

### ✅ Step 1 — Relocatable paths (DONE, green)
- `rag/src/lib/config.ts`: added pure `export function resolvePath(envValue, fallback)` (env non-empty,
  trimmed → `resolve(envValue)`; else fallback verbatim). Wired `VAULT_DIR`/`CACHE_DIR`/`envPath` through
  it via `process.env.VAULT_DIR` / `CACHE_DIR` / `SBG_ENV_PATH`. Defaults unchanged → zero behaviour
  change for existing brains.
- Tests: `rag/src/lib/paths.test.ts` (absolute→resolved, unset→fallback, empty/whitespace→fallback,
  relative→resolved-vs-cwd). Suite: `cd rag && npm test` → **118/118**, `npx tsc --noEmit` clean.
  *(Note: test named `paths.test.ts`, not `.mts` as the body text sketched — `.mts` wouldn't match the
  runner glob `src/lib/*.test.ts`.)*
- `.env.example`: documented `VAULT_DIR` / `CACHE_DIR` / `SBG_ENV_PATH` as **advanced/optional**.
- `.mcp.json.template` left untouched (out of scope — defaults cover the current layout).
- **First-run note for a fresh window:** `rag/` deps aren't vendored — run `cd rag && npm install` before
  `npm test`.

### ⏭️ Next: Step 2 — Observable version vector (fresh window)
Open a new session, give it the kickoff prompt (Execution kickoff §) but targeting **Step 2 only**, on
branch `claude/engine-packaging-phase0-wmfjxz`. Keep gate #0 red (it goes green at Step 3) and the RAG
suite green. Then Step 3 turns gate #0 green and finishes the plan.

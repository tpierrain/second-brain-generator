# Engine packaging — Phase 0 action plan (Track D: decouple now, defer the channel)

**STATUS: ✅ DONE** on branch `engine-packaging` (PR #10, kept a **draft** — no merge
to `main` before the client demos, ADR 0012 / rule 4). All three deliverables landed + gate #0 is green.
**Commit SHAs:** gate #0 (red) + Step 1 relocatable paths — `6e26b9a` · Step 2 observable version vector —
`01368bb` · Step 3 ownership manifest (gate #0 → green) — `934ceae`. **Verified at close:** harness
`node --test scripts/lib/*.test.mjs` → **148/148** (gate #0 now green); RAG `cd rag && npm test` →
**129/129**; `cd rag && npx tsc --noEmit` clean. Full detail in the **Progress log** at the bottom.

## In essence — what Phase 0 actually achieved (the *what*, not the *how*)

> The steps below are the *how*. This is the *what*, so it survives a `/clear`: **Phase 0 turned the
> Engine into something that knows how to describe itself and knows its own boundaries — so that, later,
> it can be updated inside an already-installed brain without ever touching the user's notes or personal
> extensions.** Phase 0 updates nothing; it lays the **safety contract** that makes a future
> `update-engine` (Phase 1) safe *before a single line of upgrade code exists*.

Three acquisitions:

1. **The Engine became *observable*.** It now announces its version and its index freshness — so we can
   one day say "this brain runs v1.0, a v1.1 is available." Before, the running version was invisible.
2. **The Engine became *relocatable*.** It no longer assumes hard-coded paths; it can live anywhere — the
   prerequisite for moving/reinstalling it without breaking everything.
3. **The Engine now knows its own boundaries** (`engine-manifest.json`): an explicit declaration of *which
   files belong to the Engine* and *how each must be updated* (replace / regenerate / merge). Corollary by
   construction: **anything not listed = the user's property (notes, personal extensions) = untouchable.**
   This is the launcher↔brain contract made explicit and verifiable (4 guards test it).

## ▶ Progress checklist (SOURCE OF TRUTH — resume at the first unchecked box)

> To resume, the maintainer only says **“reprends le plan en cours”**. The agent then locates the plan
> whose STATUS is 🚧 IN PROGRESS, reads **this** checklist, and does **the first unchecked `- [ ]` big
> step** (and nothing more — see the Session protocol). Tick the box in the **same commit** that finishes
> the step, so the last commit pushed on the branch always shows the true state.

- [x] **Gate #0** — survival test written (RED by design until Step 3). `scripts/lib/engine-manifest.test.mjs`.
- [x] **Step 1** — Relocatable paths (`config.ts` → `resolvePath` + env vars). RAG suite green, tsc clean.
- [x] **Step 2** — Observable version vector (semver + `vault_stats` + index schema stamp). RAG suite green, tsc clean.
- [x] **Step 3** — Ownership manifest (`engine-manifest.json`) → **gate #0 green**; full test file (4 guards). RAG suite green, tsc clean.
- [x] **Definition of done** — STATUS → ✅ with commit SHAs + what was verified, then `git mv` into
  [`plans/archived/`](archived/). **Done** — every box ticked; the plan is archived.

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

## Session protocol (the maintainer's standing working agreement — honour it without being re-asked)

These rules are **fixed by the maintainer (Thomas)** and apply to **every** session running this plan, so
he never has to restate them in a new prompt. The only thing he ever needs to say is **“reprends le plan
où on en était sur la PR ouverte”**.

0. **Self-locate via the single open PR — never ask “where are we?” nor “which branch?”.** By invariant
   (rule 4 + DEVELOPING.md "Dev rules" §7) there is **exactly one open PR authored by the maintainer
   (`tpierrain`)** at a time. On **“reprends … sur la PR ouverte”** (or any equivalent): list the **open
   PRs authored by `tpierrain`**, take the only one, **check out its head branch**, then read that
   branch's **Progress checklist** in this plan and take **the first unchecked `- [ ]` big step** as the
   task. The open PR is the durable anchor (discoverable from any starting branch, even `main`); the
   checklist on its branch is the source of truth for *where* to resume. **If there are several of his
   open PRs**, don't guess and don't make him recall names: **list them (number, title, branch) and let
   him pick** via `AskUserQuestion`. **If zero**, ask whether to start one.
1. **One big step per fresh window.** Each **big step** (a checklist line) is executed in its **own new
   session** — never drag a long conversation across steps (context rot). The committed docs (ADR 0012 +
   this plan: its **checklist** + **Progress log**) are the **only** external memory a new window needs.
2. **Tick the box + update the log in the finishing commit.** When a big step is done, **check its box**
   (`- [ ]` → `- [x]`), move the **⬅ NEXT** marker to the following box, and refresh the **Progress log**
   — all in the **same commit** that finishes the step. So the **last commit pushed on the branch always
   reflects the true state**, and the maintainer can follow just by reading the plan file (or the PR).
3. **Stop and ask before the next big step.** At the **end of each big step**, **do NOT roll into the next
   one.** Report where we are and **explicitly ask the maintainer** (via `AskUserQuestion`) whether to
   continue in this session or open a fresh window. Wait for the answer — the default expectation is a
   fresh window.
4. **Exactly one open PR of the maintainer's — the anchor invariant** (general rule in DEVELOPING.md §7).
   This plan runs under **one** open PR authored by `tpierrain` (its branch is the work branch). **Never
   open a second** of his while it is open; **don't merge or close it** until the plan's Definition of done
   (demo week — runtime merges only after). Other people's / bots' PRs don't count (scope to
   `author:tpierrain`). If you ever find **several** of his open PRs, **list them and let him pick** (via
   `AskUserQuestion`) rather than guessing; if **zero**, ask whether to start one. Keep the PR a **draft**
   until done.

## Execution kickoff (run in a fresh window — avoid context rot)

Execute each big step from a **new session**. The committed docs (ADR 0012 + this plan) **are** the
external memory — the new window needs nothing else.

**The whole kickoff is one sentence:** the maintainer says **“reprends le plan où on en était sur la PR
ouverte”**. By the **Session protocol** (rule 0) the agent self-locates — finds the single open PR, checks
out its branch, reads the **Progress checklist**, and does the first unchecked big step — then
commits/pushes (ticking the box) and asks before the next one.

If the maintainer prefers to be explicit, the long form is equivalent:

> Read and follow `maintainers/decisions/0012-engine-packaging-four-part-model.md` and
> `maintainers/plans/engine-packaging-phase0-action.md` **to the letter** (four-part model, additive-only
> founding principle, three regimes — and the **Session protocol** + **Progress checklist**). Work on the
> branch in the STATUS line (currently **`engine-packaging`**). **Do NOT merge to
> `main`** (demo week). **TDD strict** (skill `tdd-discipline`): do **the first unchecked big step**, then
> stop and show me the diff. Keep the `rag` suite green; commit + push (tick the box + update the log);
> then **ask me** before the next big step.

Branch off `main` once the framing PR is merged; otherwise branch off `claude/engine-packaging-study-2nzmkg`.

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

**Branch:** `engine-packaging` (NOT `main` — demo week). Steps continue here on the
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

### ✅ Step 2 — Observable version vector (DONE, green)
- **2a — semver + version vector.** `rag/package.json` bumped `1.0.0` → **`1.1.0`** (honest MINOR: Step 1
  relocatable paths + Step 2 observability are additive behind the stable MCP port). New
  `rag/src/lib/engine-version.ts`: pure `engineVersionVector(pkg)` → `{ rag }`, `loadEngineVersion()`
  reads the **live** `rag/package.json` (not a frozen copy), `formatEngineVersionReport(...)` for the
  `vault_stats` "Engine" section. `index.ts` `McpServer` version now derives from `loadEngineVersion().rag`
  (single source of truth, no second literal to drift). The vector is `{ rag }` for now;
  `constitutionTemplate`/`scripts` join it from the manifest in Step 3.
- **2b — index schema version in the stamp.** `INDEX_SCHEMA_VERSION = 1` in `vector-store.ts`. `index_meta`
  gains a **nullable** `index_schema_version` column (guarded `ALTER` migrates existing brains' DBs);
  `writeIndexIdentity` stamps it (defaulted), `readIndexSchemaVersion` / `currentIndexSchemaVersion` read
  it back. `index-freshness.ts`: `checkSchemaFreshness(stamped, current)` — stale only on a **real** bump;
  an index stamped **before** versioning (null) is **grandfathered fresh** → no reindex prompt for existing
  brains (acceptance #2). `staleSchemaMessage()` offers the reindex via the **same gate** (embedder
  unchanged, so the embedder-swap prose would mislead). Wired into `search_vault` next to the existing
  embedder-freshness gate.
- **2c — surface via `vault_stats`.** Added an **Engine** section (version vector + schema **running vs
  stamped**, so a drift is visible). Additive only (ADR 0006) → no contract breakage.
- **Tests (TDD, baby-steps):** `engine-version.test.ts` (vector, live-package read, report incl. drift &
  grandfather), `vector-store.test.ts` (schema round-trip + null-before-versioning), `index-freshness.test.ts`
  (schema fresh/stale/grandfather + stale message). Suite: `cd rag && npm test` → **129/129** (was 118),
  `npx tsc --noEmit` clean. Harness suite unchanged: **144/145** (the 1 red is still gate #0, by design).

### ✅ Step 3 — Ownership manifest (DONE, green)
- **3a — `engine-manifest.json`** at the launcher root, keyed by the three ADR-0012 regimes. Lists **only
  Engine paths**; everything unlisted is, by construction, a Personal Extension or Content → untouchable.
  - `replace`: `rag/src/**`, `rag/package.json`, `rag/package-lock.json`, `rag/tsconfig.json` (the engine
    source — blind-replaceable, no user edits expected; `rag/scripts/` is dev-only and not copied, so absent).
  - `regenerate`: `rag/launch.sh`, `rag/launch.cmd`, `scripts/run-node.sh`, `scripts/run-node.cmd` — the
    **install-generated** self-heal launchers (built by `scripts/lib/rag-launcher.mjs`, not present in the
    launcher repo) → rebuilt deterministically, never diffed. *(Extended the plan's draft, which named only
    `rag/launch.*`: the `run-node.*` hook launchers are the same family and must be managed too, else they'd
    be left unowned.)*
  - `merge`: `CLAUDE.md`, `.claude/settings.json`, the **six shipped skills listed one by one**
    (`coach`, `sync`, `sync-sources`, `improve`, `prepare-1-1`, `tdd-discipline` — **never** a blanket
    `.claude/skills/**`), and the four hook/runtime scripts (`auto-commit`, `auto-push`, `status-line`,
    `verify-rag`). Q#4 + Q#5 of the study resolved per ADR 0012: Engine, but `merge` (a user may have forked
    them → offer a diff, never blind-overwrite).
  - `engineMcpServers: ["vault-rag"]`; `provenance: {}` **reserved** for Phase 1's per-file fingerprint.
- **3b — `.mcp.json` marker.** Declared via `engineMcpServers` (no schema extension on `.mcp.json`); a future
  `update-engine` rewrites only that key and deep-merges the user's connectors. Data only — no Phase-0 runtime.
- **Tests (gate #0 written RED first → GREEN here) — `scripts/lib/engine-manifest.test.mjs`, 4 guards:**
  (1) **survival test** (gate #0) — a home-made skill / custom script / sub-agent / vault note fall in **no**
  writable regime nor `engineMcpServers`; (2) **regime disjointness** — `replace`/`merge`/`regenerate`
  pairwise disjoint; (3) **no over-broad glob** — a *random* skill folder / script is never matched (catches a
  blanket subtree); (4) **engine paths only** — every `engineMcpServers` key exists in `.mcp.json.template`
  and every `merge` skill glob resolves to a shipped skill folder (anti-drift). Each guard verified fail-first
  by perturbation before being committed green.
- **Suites:** harness `node --test scripts/lib/*.test.mjs` → **148/148** (was 144/145 — gate #0 was the lone
  red, now green, +3 new guards). RAG `cd rag && npm test` → **129/129**, `npx tsc --noEmit` clean (rag/
  untouched). *(Reminder: `cd rag && npm install` first — deps not vendored.)*

### ✅ Definition of done (DONE — plan closed)
- **STATUS line** set to ✅ with the commit SHAs (`6e26b9a` gate #0 + Step 1 · `01368bb` Step 2 · `934ceae`
  Step 3) and the close-time verification.
- **Re-verified at close** (not just transcribed): harness `node --test scripts/lib/*.test.mjs` → **148/148**
  (gate #0 green); RAG `cd rag && npm test` → **129/129**; `cd rag && npx tsc --noEmit` clean.
- **Archived:** `git mv` of this file into [`plans/archived/`](archived/) — its checklist is the last commit's
  record of a fully-ticked Phase 0.
- **PR #10 stays a draft** — **no merge to `main`** before the client demos (ADR 0012 / rule 4). Merging Phase 0
  to `main` is a separate, post-demo decision for the maintainer; Phase 1 (Track A, `update-engine`) is the
  next plan to open when he chooses to resume.

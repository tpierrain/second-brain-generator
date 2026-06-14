# Engine packaging — Phase 0 action plan (Track D: decouple now, defer the channel)

**STATUS: 🗺️ ACTION PLAN — not started.** Enacts **Phase 0** of
[`engine-packaging-study.md`](engine-packaging-study.md) (Track D). Makes the motor **observable and
relocatable** without choosing a distribution channel yet. **Scope:** Second brain (runtime) + Installer.
**Governing invariant (ADR 0003):** opt-in, non-destructive of local divergences, never reclaims the
brain's sovereignty.

---

## Goal

Build the **seam**, commit to **no policy**. After this plan, a brain can (a) report which motor it
runs, (b) run an engine that lives *anywhere* (not only `<brain>/rag/`), and (c) be upgraded later by a
follow-up (Track A/B/C) that knows exactly which files are "engine". Zero behaviour change for existing
brains: every new input **defaults to today's value**.

Three deliverables, independent, shippable one at a time (a `/clear` between each):

1. **Relocatable paths** — `config.ts` reads vault/cache/env from the environment, defaulting to the
   current relative paths.
2. **Observable version** — real semver + `engine_version` and `index_schema_version` surfaced via
   `vault_stats`; the index stamp carries the schema version.
3. **Ownership map** — an explicit `engine-manifest.json` + a marker separating the engine-owned
   `vault-rag` entry from user connector entries in `.mcp.json`.

Each is TDD (cf. skill `tdd-discipline`): a failing test first, baby-steps, refactor not optional.

---

## Step 1 — Relocatable paths (config.ts reads the environment)

**Why:** today [`rag/src/lib/config.ts`](../../rag/src/lib/config.ts) pins everything by position
(`resolve(__dirname, "../../..")`) → the engine is welded to `<brain>/rag/`. An upgrade channel needs the
engine to be able to live elsewhere and be *told* where the vault is.

**Change:** introduce a pure, tested resolver that prefers an env var, else falls back to today's path.

```ts
// pure + unit-testable: env wins, else the historical relative default
export function resolvePath(envValue: string | undefined, fallback: string): string {
  return envValue && envValue.trim() ? resolve(envValue) : fallback;
}
export const VAULT_DIR = resolvePath(process.env.VAULT_DIR, resolve(projectRoot, "vault"));
export const CACHE_DIR = resolvePath(process.env.CACHE_DIR, resolve(__dirname, "../../.cache"));
const envPath        = resolvePath(process.env.SBG_ENV_PATH, resolve(projectRoot, ".env"));
```

**Tests** (`config.test.mts` or a new `paths.test.mts`):
- env set (absolute) → returned, resolved.
- env set (relative) → resolved against cwd.
- env empty / whitespace / unset → historical fallback (the regression guard).

**Acceptance:** existing brains — no env set — behave **identically** (same `VAULT_DIR`/`CACHE_DIR`/
`envPath` as before). New env vars override. `rag` test suite stays green.

**Out of scope here:** changing `.mcp.json.template` to *pass* those vars — do it only if Step 1's
defaults don't already cover the current layout (they do), so leave the template alone until a channel
(A/B) actually needs relocation. Document the vars in `.env.example` as **advanced/optional**.

## Step 2 — Observable version (semver + vault_stats + index schema stamp)

**Why:** `rag/package.json` is a static `1.0.0`, never bumped, and nothing surfaces it. You cannot tell a
stale brain from a fresh one — the prerequisite of any upgrade UX and of stale-index detection.

**2a. Real semver.** Adopt semver for `rag/package.json`. Define the bump rule in a one-paragraph note at
the top of the engine (or in the manifest of Step 3): **MINOR** = behaviour/format change behind the
stable MCP port; **MAJOR** = the index schema changes (forces a reindex); **PATCH** = fix, no format
change. Start at the honest current number (keep `1.0.0` or bump to `1.1.0` with this change — decide in
the PR).

**2b. Index schema version in the stamp.** Extend the existing index identity (ADR 0007 already stamps
provider/model/dimension — find it via the embedder-identity / index-freshness code) with an
`indexSchemaVersion` constant. On engine start, compare the running constant to the stamped value
(reuse `index-freshness`): mismatch → the **existing** confirm-gate → reindex path. No new framework.

**2c. Surface via `vault_stats`.** Add `engine_version` (from `package.json`) and `index_schema_version`
(the stamped value + the running constant, so a drift is visible) to the `vault_stats` tool output.
This is the only public-contract change, and it is **additive** (ADR 0006 allows generalising
`vault_stats`; precedent set in its addendum) → no breakage.

**Tests:**
- `vault_stats` output includes `engine_version` matching `package.json` (read it, don't hardcode the
  string — non-brittle assert per `tdd-discipline`).
- stamp round-trip: write schema vN, read back vN.
- drift: running constant ≠ stamped value → the stale path fires (mock the gate, assert it's called).

**Acceptance:** `vault_stats` reports the motor; bumping `indexSchemaVersion` makes a brain detect its
index as stale and offer a reindex; same-version brains see no prompt.

## Step 3 — Ownership map (engine-manifest.json + .mcp.json marker)

**Why:** today the engine/content/tools line is implicit. [`tracked-files.mjs`](../../scripts/lib/tracked-files.mjs)
is an *install-time* allowlist, not an *upgrade-time* ownership map. A future `update-engine` must know,
deterministically, what it may overwrite — and must **never** touch a user's connectors or forked skills.

**3a. `engine-manifest.json`** at the launcher root (and copied into the brain): the explicit ownership
table from the study, machine-readable. Sketch:

```json
{
  "engineVersion": "1.1.0",
  "indexSchemaVersion": 1,
  "owned": {
    "replace": ["rag/src/**", "rag/package.json", "rag/tsconfig.json"],
    "regenerate": ["rag/launch.sh", "rag/launch.cmd"]
  },
  "userOwned": {
    "neverTouch": ["vault/**", "CLAUDE.md", ".env", ".claude/skills/**"],
    "merge": [".mcp.json", ".claude/settings.json"]
  },
  "undecided": ["scripts/auto-commit.mjs", "scripts/auto-push.mjs",
                "scripts/status-line.mjs", "scripts/verify-rag.mjs"]
}
```

Resolve the `undecided` list **in this PR** (it's open question #4 of the study): rule each engine-owned
(upgradable) or frozen-at-install. Recommendation to validate: the auto-commit/push/status/verify scripts
are **engine-owned** (they're mechanism, not the user's content) → `replace`, but only via the future
opt-in `update-engine`, never silently.

**3b. `.mcp.json` engine marker.** Mark the engine-owned server entry so a future merge can rewrite *only*
it and leave connectors alone. Cheapest non-invasive option: a comment-free convention — the engine entry
is always keyed `vault-rag`, and the manifest declares `"engineMcpServers": ["vault-rag"]`. A future
`update-engine` rewrites only those keys, deep-merging the rest. (Avoid a custom `.mcp.json` schema
extension — keep it a plain MCP file.)

**Tests** (`engine-manifest.test.mjs`):
- the manifest's `owned.replace` globs all resolve under `rag/` (no accidental vault/ entry).
- `userOwned.neverTouch` and `owned.replace` are **disjoint** (a path can't be both) — the guard that
  protects sovereignty.
- `engineMcpServers` lists exactly the entries the installer writes into `.mcp.json.template`
  (cross-check against the template) → the marker can't drift from reality.

**Acceptance:** a single source of truth declares who owns what; a test fails loudly if engine and
user buckets ever overlap. No runtime behaviour changes yet — this is data for Phase 1.

---

## Sequencing & validation

- **Order:** 1 → 2 → 3 (each independent; 2 and 3 both lean on 1 being merged but don't block on each
  other). One `/clear` between steps.
- **Definition of done (per house rule):** when Phase 0 ships, set this file's STATUS to ✅ with the
  commit SHAs + what was verified, and `git mv` it into [`plans/archived/`](archived/).
- **Whole-plan acceptance:** existing brains unchanged (no env set, no new prompts); a fresh install
  reports `engine_version` via `vault_stats`; bumping `indexSchemaVersion` triggers the existing
  reindex gate; the ownership manifest exists and its disjointness test is green.
- **Explicitly NOT in Phase 0:** any re-pull/update command, any npm publish, any plugin, any
  `.mcp.json` *merge* logic. Those are Phase 1+ (Tracks A/B/C). Phase 0 only lays the seam.

## Then what

Phase 0 unblocks, in order of likely need:
- **Phase 1 (Track A)** — opt-in `update-engine` reading `engine-manifest.json`, re-pulling the `owned`
  set from a pinned source, reindexing iff `indexSchemaVersion` moved. Non-destructive by construction
  (the manifest's disjointness guarantees it can't touch user buckets).
- **Phase 2 (Tracks B → C)** — at publication: semver npm package with a vendored offline fallback, then
  a plugin wrapping install + update. The ADR 0002-addendum hybrid, enacted on proven user-base need.

When Phase 0 is designed enough to commit to, write the **ADR superseding 0003** (it explicitly invites
this) recording: the engine/content/tools split, the observable-version decision, and the staged channel
plan — with the sovereignty invariant as the non-negotiable.

# Engine packaging — making the motor upgradable without touching the brain

**STATUS: 🔬 STUDY — nothing enacted.** Reopens [`ADR 0003`](../decisions/0003-no-brain-capability-upgrade.md)
on the trigger it named itself ("publication widens the user base"). Feeds a future ADR + action plan.
**Scope:** Installer + Second brain (runtime) — the launcher↔brain split of ADR 0001.

---

## 1. The problem, in the user's words

> "Package the **engine** on one side. The content and the rest is fine — I already have a second
> brain in use for this project — but now the two evolve in parallel. I'd like an **upgrade path**,
> even for people who already installed my second brain: they keep **their content** and **their
> tools**, and they can swap in a newer **motor**."

Restated against our architecture: today a brain is **frozen at install day** (ADR 0001 severs the
launcher→brain link "by construction"; ADR 0003 accepts the consequence). We want to make the **engine**
(the RAG/MCP motor) an **independently replaceable unit**, while the **vault**, the **constitution**,
the **skills** and the **connectors** stay owned and **never overwritten**.

Three buckets, and which side of the line they sit on:

| Bucket | Examples | Owner | On upgrade |
|---|---|---|---|
| **Engine (the motor)** | `rag/src/**`, `rag/package.json`, engine-side `scripts/*` | Maintainer | **Replaced** |
| **Content** | `vault/**`, `CLAUDE.md`, retros/daily/people notes | User | **Untouched** |
| **Tools** | `.mcp.json` connector entries, `.claude/skills/**` (incl. home-made), `.env` | User | **Preserved / merged** |

The whole study is about drawing that line **explicitly** (today it is implicit) and choosing a
**distribution channel** for the engine bucket.

## 2. What already makes this feasible (don't re-pay)

We are in a good position — several earlier decisions were quietly laying the groundwork:

- **[ADR 0006](../decisions/0006-rag-mcp-is-stable-contract.md) — the MCP surface is a stable public
  contract.** `search_vault / get_document / list_documents / vault_stats / reindex` is the port the
  harness depends on; everything behind it is swappable. **An engine upgrade that preserves this port
  is invisible to the brain's constitution and skills.** This is the single most important enabler.
- **[ADR 0007](../decisions/0007-three-embedder-adapters-privacy-scale.md) — embedder SPI + index
  identity stamping.** The index already records *who* encoded it (provider/model/dimension) and a
  swap triggers a **confirm-gate → reindex**, never a silent mismatch. The machinery to detect
  "this index is incompatible with the current engine" **already exists** — we extend it, we don't
  invent it (see §5, the hard part).
- **[ADR 0002 addendum (2026-06-14)](../decisions/0002-in-house-installer-vs-plugin.md)** already
  sketches the target: the **"Hybrid (npm engine + plugin + thin scaffolder)"** — *not rejected, only
  deferred to publication.*
- **[ADR 0009](../decisions/0009-prefer-deterministic-mechanisms.md)** — the posture to apply: prefer
  a deterministic, verifiable mechanism (a pinned version, a git condition, a stamped schema) over a
  probabilistic one.

## 3. What blocks it today (the coupling to break)

The engine is **vendored inside the brain** at `rag/` and **assumes the brain's folder layout** via
hardcoded relative paths — [`rag/src/lib/config.ts`](../../rag/src/lib/config.ts):

```ts
const projectRoot = resolve(__dirname, "../../..");   // = brain root, by position
export const VAULT_DIR = resolve(projectRoot, "vault");
export const CACHE_DIR = resolve(__dirname, "../../.cache");
const envPath = resolve(projectRoot, ".env");
```

and the launch line — [`.mcp.json.template`](../../.mcp.json.template):
`npx tsx rag/src/index.ts`, `cwd: {{PROJECT_ROOT}}`.

Consequences for an upgrade:
1. **The engine can't live anywhere but `<brain>/rag/`** → no way to point a brain at an engine sitting
   elsewhere (a shared install, an npm cache, a newer checkout).
2. **No version is observable at runtime.** `rag/package.json` is a static `1.0.0`, never bumped, and
   `vault_stats` does **not** surface it. You cannot tell which motor a brain is running.
3. **`.mcp.json` mixes engine-owned and user-owned entries** (the `vault-rag` server vs the user's
   Slack/Drive/Notion connectors) with no marker separating them → naïve overwrite would clobber tools.
4. **No manifest** says which files are "engine". The copy logic in
   [`tracked-files.mjs`](../../scripts/lib/tracked-files.mjs) is an install-time allowlist, not an
   upgrade-time ownership map.

None of these is hard individually. (1) and (2) are the cheap, reversible groundwork (Track D below).

## 4. The tracks

Ordered from least to most invasive. They are **not exclusive** — D is groundwork for A/B/C, and the
recommendation (§6) phases them.

### Track A — `update-engine`: opt-in re-pull from a pinned source
A brain-side command (Claude-driven, like install) that fetches the engine from a **pinned reference**
(a git tag or a tarball URL recorded in the brain) and **overwrites only the engine bucket** (`rag/src`,
`rag/package.json`, engine scripts), then `npm install` + reindex-if-needed. Vault/.env/skills/connectors
untouched.
- **Pros:** smallest change; stays self-hosted (no registry, honours ADR 0001 offline guarantee if the
  source is a local checkout); fully under the "opt-in + non-destructive" invariant of ADR 0003.
- **Cons:** re-introduces a launcher→brain coupling (the very link 0001 severed) — *mitigated* by making
  it explicit, pinned, and user-triggered, not a standing remote. Needs the ownership manifest (§3.4)
  to know what to overwrite.

### Track B — Engine as a versioned npm package (`@second-brain/vault-rag`)
The engine ships to npm with real semver; the brain's `.mcp.json` runs `npx @second-brain/vault-rag@^1`
instead of `tsx rag/src/index.ts`. The vault/cache/.env paths move from hardcoded relatives to
**env-injected** (`VAULT_DIR`, `CACHE_DIR`, `ENV_PATH` passed by `.mcp.json`). Upgrade = bump the range
(or `npx` resolves the latest cached).
- **Pros:** clean, idiomatic, genuine version negotiation; the brain shrinks (no vendored `rag/`); the
  `.mcp.json` engine line becomes a trivially-rewritable one-liner, cleanly separable from connectors.
  This is the "npm engine" half of the ADR 0002-addendum hybrid.
- **Cons:** reintroduces a **registry dependency** → the offline/rug-pull/"forever as generated"
  guarantee of ADR 0001 weakens. *Mitigations:* pin an exact version + keep a **vendored fallback**
  (`npm pack` cached in the brain), so offline still works and a yanked version doesn't brick a brain.
- **Prereq:** the path decoupling of Track D is **mandatory** here.

### Track C — Claude Code plugin (the full hybrid: engine + skills + `/update-engine`)
A marketplace plugin distributes the engine (depending on B's package), the shared skills, and an
`/install-second-brain` + `/update-engine` command. The brain stays a separate owned repo; the plugin's
MCP server is pointed at it via config.
- **Pros:** best discoverability *and* updatability in one; the ADR 0002-addendum already establishes a
  plugin *can* ship and run the scaffolder.
- **Cons:** most moving parts (marketplace + package + scaffolder), and the **non-technical-audience
  invariant of ADR 0002** must hold — the plugin/marketplace concepts must stay hidden behind the
  chat-guided flow. Hooks still land in the **brain-local** `settings.json` (written by the scaffolder),
  not as global plugin hooks. Premature before publication.

### Track D — Decouple the layout now, defer the channel (groundwork)
The cheap, reversible first move, independent of which channel wins:
1. `config.ts` reads `VAULT_DIR` / `CACHE_DIR` / `ENV_PATH` from env, **defaulting to today's relative
   paths** (zero behaviour change for existing brains).
2. Bump `rag/package.json` to real semver and **surface `engine_version` (+ index schema version) in
   `vault_stats`** → a brain can finally report its motor.
3. Write an explicit **`engine-manifest.json`** (the ownership map of §1's table) + add a marker in
   `.mcp.json` separating the engine-owned `vault-rag` entry from user connector entries.
- This makes the **seam**; it commits to **no policy**. Pure ADR 0009 spirit (deterministic, no
  over-engineering). After D, Tracks A/B/C are each a small, well-scoped follow-up.

## 5. The hard part, common to all tracks: index forward-compatibility

The real cost ADR 0003 flagged ("forward compatibility of the index, migrations") is **not** moving
files — it's that a new engine may change the **index format / chunking / embedding**. Good news: ADR
0007 already stamps the index with an **embedder identity** and gates a swap behind a **confirm →
reindex**. The extension is small and reuses that machinery:

- Add an **index schema version** alongside the embedder identity in the stamp.
- On engine start, compare the running engine's schema version to the index's stamp.
- On mismatch → the **same confirm-gate / reindex** path already built for an embedder swap. A reindex
  is minutes and **loses no content** (the vault is the source of truth; the index is derived/regenerable).

So "migrations" reduce, for the vector store, to "**detect stale → reindex**", which we already do. No
bespoke migration framework needed unless we later persist something non-regenerable.

## 6. Recommendation — phased, reversible, invariant-driven

A single rule governs every phase — the **invariant from ADR 0003**: *opt-in, non-destructive of local
divergences, never reclaims the brain's sovereignty (no silent auto-update, no mandatory upstream link,
no overwriting the user's vault/constitution/home-made skills/connectors).*

- **Phase 0 — now (Track D):** version the engine for real (semver + `engine_version`/schema in
  `vault_stats`), env-inject the paths (defaults unchanged), write the `engine-manifest.json` ownership
  map, mark engine-vs-user entries in `.mcp.json`. Low risk, reversible, unblocks everything. *This is
  the only part worth doing before publication.*
- **Phase 1 — on first real "my brain is stale" feedback (Track A):** ship an opt-in, manifest-driven
  `update-engine` that re-pulls from a pinned source and reindexes if the schema moved. Stays self-hosted
  (no registry), honours the invariant.
- **Phase 2 — at publication, if feedback demands it (Track B, then C):** graduate the engine to a
  semver npm package with a vendored offline fallback; later wrap install + update in a plugin for
  discoverability. This is the ADR 0002-addendum hybrid, enacted only once the user base proves the need.

**Do not** jump straight to B/C: it re-pays the offline/self-sufficiency cost of ADR 0001 before the
user base justifies it. **Do** invest in Phase 0 now — it is cheap, it makes the motor *observable and
relocatable*, and it is the prerequisite every other track shares.

## 7. Open questions (to settle before writing the ADR)

1. **Source of truth for Track A's "pinned reference"** — a git tag of the launcher, or a published
   tarball? (git tag keeps it self-hosted; tarball is closer to B.)
2. **Vendored fallback for Track B** — do we always `npm pack` into the brain at install (offline
   guarantee) or only on request? Cost: disk vs the "forever as generated" promise.
3. **`.mcp.json` merge strategy** — regenerate only the `vault-rag` line and 3-way-merge connectors, or
   keep connectors in a separate included file the engine never touches?
4. **What is "engine scripts" exactly** — `auto-commit` / `auto-push` / `status-line` / `verify-rag`:
   engine bucket (upgradable) or frozen-at-install? They straddle the line; the manifest must rule.
5. **Skills** — the shared skills (`coach`, `sync`, …) are maintainer-authored but live in the user's
   `.claude/skills/`. Are they "engine" (upgradable) or "content" (frozen, user may have edited them)?
   Likely: a **separate opt-in `update-skills`** with a 3-way merge, never an overwrite (a user may have
   forked `coach`). Keep distinct from `update-engine`.

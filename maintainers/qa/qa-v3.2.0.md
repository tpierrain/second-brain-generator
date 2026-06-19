# QA — post-v3.2.0 (throwaway brain, then purge)

> **Status: Finding #1 + #2 RESOLVED in v3.2.1** (PR #13, plan
> `maintainers/plans/archived/fix-update-engine-skills-mcp-action.md`). The upgrade path now
> delivers the flagship `local-mirror` skill + MCP server to upgraders and ships 0 npm vulns —
> proven empirically on the golden master (skill installed, `.mcp.json` reconciled, sacred files
> byte-identical). §3 local-mirror remains to be exercised live on a fresh post-fix brain.
> Tested on a frozen golden master `~/legacy-brain` (v3.1.0), restored from `~/legacy-brain.tgz`.

## 0. Setup
- [x] Golden master `~/legacy-brain` on v3.1.0, backed up to `~/legacy-brain.tgz`
- [x] New conversation rooted in brain → `pwd` = brain folder

## 1. Install / hand-off
- [ ] 3 embedder options presented
- [ ] Canary "Mollecuisse" found, no key, exit 0
- [ ] Hand-off banner: Desktop first
- [ ] Re-install same name → fails cleanly

## 2. RAG / semantic search
- [ ] Ask FR → finds EN note (by meaning)
- [ ] Answers cite sources
- [ ] Title-match surfaces the note
- [ ] Edit note → re-indexed in seconds

## 3. local-mirror (v3.2.0) — BLOCKED by Finding #1
- [ ] Set up a Notion mirror (plan + confirm)
- [ ] Ambiguous intent → mirror vs native-connector question
- [ ] Mirrored notes searchable offline, cited (`www.notion.so`)
- [ ] Refresh → only delta rewritten
- [ ] `check_freshness` / `status` / list
- [ ] Page deleted in Notion → deleted locally on refresh
- [ ] `sync("all")` refreshes all
- [ ] Perimeter: writes/deletes only its zone
- [ ] `remove_source` clean

## 4. Import (v3.1.0)
- [ ] `/import` → plan + confirm
- [ ] Native folder picker
- [ ] Copies vault only, no overwrite, skips demos, reindexes
- [ ] OS notification at end

## 5. update-engine (v3.0.0) — RAN ✓ (this is what exposed Finding #1)
- [x] Update → opt-in + confirm (clear summary of what changes)
- [x] Notes / .env / CLAUDE.md / settings / skills untouched
- [x] Reindex only if format changed (format unchanged → no reindex)
- [x] Engine version in status line (v3.1.0 → v3.2.0, rag 1.1.0)

## 6. Node / SQLite (v3.1.0)
- [ ] Launches on current Node
- [ ] (multi-Node) different Node → no ABI crash (self-heal)

## 7. README
- [ ] 🧲 semantic bullet renders under hero
- [ ] privacy bullet = "(local RAG & embedding)"
- [ ] 🧭 OKF note + link + "migrate automatically"
- [ ] `latest` badge = v3.2.0 (cache lag ok)

## 8. Teardown
- [ ] Restore golden master: `rm -rf ~/legacy-brain && tar xzf ~/legacy-brain.tgz -C ~`
- [ ] No real Notion data leaked into repo

## Findings

- [x] 🔴 **MAJOR — `update-engine` does not deliver the v3.2.0 feature to upgraders.** _(FIXED v3.2.1, PR #13)_
      Empirically proven on a v3.1.0→v3.2.0 upgraded brain: the `local-mirror/` **code** is copied
      (replace regime ✓) but (a) the **skill** `.claude/skills/local-mirror/` is **NOT installed**
      (`.claude/skills/` is a sacred tree → `update-engine` never touches it) and (b) the
      **`local-mirror` MCP server is NOT registered** in `.mcp.json` (`engineMcpServers` is declared
      in the manifest but never consumed). → "wire up a Notion zone" falls back to the native
      connector + `sync-sources`; the flagship feature is invisible after an update (a fresh install
      has it because the installer drops the skill + registers the MCP). Root cause = the deferred
      "update-skills" gap, now biting.
      **Fix:** see `maintainers/plans/fix-update-engine-skills-mcp-action.md`. Ship as v3.2.1.
- [x] 🟡 **npm — engine ships with 4 vulnerabilities** (3 moderate, 1 high): `hono` (high, unused
      attack surface here), `protobufjs` (moderate, transitive), `js-yaml` via `gray-matter`
      (moderate DoS on crafted YAML). Real-world risk **low** for a local stdio MCP over the user's
      own notes. Patch in the generator (hono+protobufjs non-breaking; gray-matter 2.x is breaking →
      with the test suite as a net). Bundle into v3.2.1.

### Decided non-findings (kept on purpose)
- `(rag x.y.z)` shown next to the engine version in the update summary → **kept** (useful for
  troubleshooting which engine sub-component is running).

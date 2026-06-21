# ADR 0012 — Engine packaging: an upgradable engine under a four-part model

- **STATUS:** ACCEPTED (2026-06-14). **Supersedes [`0003`](0003-no-brain-capability-upgrade.md)** —
  enacts the reopening 0003 scheduled for itself ("publication widens the user base"). The *framing*
  (vocabulary, founding principle, regimes, phasing) is decided here; the **distribution channel**
  stays deferred to the study + real feedback.
- **Scope:** Second brain (runtime) + Installer — the launcher↔brain split of ADR 0001.
- **Related:** [`0001`](0001-launcher-vs-brain.md) (launcher↔brain), [`0002`](0002-in-house-installer-vs-plugin.md)
  (in-house installer + its hybrid addendum), [`0003`](0003-no-brain-capability-upgrade.md) (the deferral
  this lifts), [`0006`](0006-rag-mcp-is-stable-contract.md) (stable MCP port — what makes an engine swap
  invisible), [`0007`](0007-three-embedder-adapters-privacy-scale.md) (embedder SPI + index identity —
  what makes a format change safe). Working detail: [`../plans/archived/engine-packaging-study.md`](../plans/archived/engine-packaging-study.md)
  and its Phase 0 action plan.

## Crux

> - **Decision —** a brain has **four parts** — Installer, **Engine** (upgradable), **Personal Extensions**
>   (user-authored tooling), **Content** (the vault) — and an engine upgrade touches **only the Engine**.
> - **Guarantee —** additive-only by construction: an upgrade writes **only** manifest-declared engine
>   files (a **write-allowlist**, a managed file set), and can **never** delete or overwrite a Personal
>   Extension or any Content. (Two later, surgical side-channels sit *alongside* this allowlist — see the
>   forward-note in Decision §2.)
> - **Prior art (not NIH) —** this is the package-manager *managed-file-set* model (dpkg/rpm/Homebrew own
>   and touch only the files they installed); upgrades never `rsync --delete` a user's tree.

## Context

ADR 0003 deferred engine upgradability and **named its own trigger**: reopen when publication widens the
user base, aiming for "the hybrid — updatable engine + brain/vault always owned and never overwritten".
That moment is here. The project is **in production** (client demos), and the brain and its engine now
**evolve in parallel**: Thomas wants existing users to **upgrade their engine** while keeping **their
content** and **their own tooling**, and plans to **refactor the engine** (RAG + constitution + hooks;
e.g. a `CLAUDE.md` that has grown too big). 0003's pain point — "a fix in the engine does not flow back
into already-created brains" — is now concrete.

What was missing to act was not a channel but a **shared model**: which parts of a brain even *are* "the
engine", and what an upgrade may touch. This ADR records that model.

## Decision

**1 — A four-part model (vocabulary, fixed).** A brain has exactly four parts; "the engine" is one of
them, not a catch-all:

| Part | What | Upgrade |
|---|---|---|
| **Installer** | the launcher + what it needs to generate a brain (`installer.mjs`, install-side `scripts/lib/`, `templates/`); read-only, reusable (ADR 0001) | **out of scope** — it *performs* upgrades, it isn't upgraded inside a brain |
| **Engine** *(the motor)* | the **upstream-provided** runtime machinery: RAG, runtime hooks/scripts, shipped skills, the constitution `CLAUDE.md`, `.mcp.json` | **upgradable** (the subject) |
| **Personal Extensions** | the **user-made** tooling grafted onto the brain: home-made skills, custom scripts/sub-agents/hooks. Machinery, but authored locally | **never touched** |
| **Content** | the user's notes — their **data** (`vault/**`) | **never touched** |

When Thomas says "engine", he means the Engine row. Personal Extensions are a **first-class category**,
sacred like Content but for a different reason: theirs **by authorship**, where Content is theirs **by
data**. A brain is *plastic* — people graft their own tooling onto it, and that must always survive.

**2 — Founding principle: additive-only upgrade (non-negotiable).** An engine upgrade **MUST NEVER
delete or overwrite a Personal Extension or any Content.** Mechanically: the upgrade writes only the
files declared in the engine **manifest** (a **write-allowlist**), as a **managed file set** — **never**
"replace the folder" / `rsync --delete`. A file absent from the manifest *cannot even be enumerated* for
deletion. This is a **structural** guarantee, stronger than 0003's "non-destructive behaviour".

> **Forward-note (0025 / 0026).** The write-allowlist is the *destructive-write* boundary: anything it
> overwrites/regenerates must be manifest-declared. Two **additive, install-if-absent** side-channels were
> later added **alongside** it — never overwriting, never deleting, only adding what is absent: the
> `.mcp.json` engine-server reconcile ([ADR 0025](0025-update-engine-installs-missing-engine-skills-and-servers.md))
> and the `settings.json` engine-owned **hook-entry** merge ([ADR 0026](0026-brain-self-converges-via-idempotent-reconciler.md)).
> They do **not** weaken this principle: they live *outside* the allowlist (so `.mcp.json` and
> `settings.json` stay blanket-sacred to destructive writes) and only ever append engine-owned entries.

**3 — Three upgrade regimes.** Every engine file falls in exactly one:
- **Replace (re-substituted):** pure upstream machinery the user never edits (`rag/src/**`, provided
  hooks/scripts) — overwritten, placeholders re-substituted, but only files named in the manifest.
- **Merge 3-way (opt-in):** upstream-provided **but** user-editable (constitution `CLAUDE.md`, shipped
  skills) — never overwritten; the new version is offered as a diff the user accepts hunk by hunk
  (protects a fork). This regime is what makes "engine vs content" safe despite the constitution and
  shipped skills living inside the engine.
- **Never-touch:** Content **and** every Personal Extension — absent from the manifest ⇒ untouchable.

The Engine is therefore versioned as a **vector** (`rag` / `constitution-template` / `scripts`), not a
single number, surfaced at runtime (e.g. via `vault_stats`).

**4 — Phased, channel-deferred.** Decouple **now** (observable version + relocatable paths + ownership
manifest — Phase 0), and **defer the distribution channel** (opt-in re-pull / npm package / plugin) to
proven need. Any channel must preserve ADR 0001's **self-sufficiency**: the engine **starts offline, with
no network dependency** (today it is vendored as `tsx rag/src` — that property is kept).

## Consequences

- **Existing brains become upgradable without losing a single user addition** — the founding principle
  guarantees it by construction, answering 0003's "no fix propagation" pain.
- **The planned engine refactor is safe**: behind the stable MCP port (0006) it is invisible to a brain's
  constitution and skills; an index-format change triggers a reindex via the 0007 machinery — minutes,
  **zero content loss** (the vault is the source of truth).
- **"Engine = everything but content" is made safe** by the Personal Extensions category + the merge
  regime — the two ideas Thomas needed to reconcile.
- **New surface to maintain** (manifest, version vector, upgrade command). Deliberately **staged** so
  none of it lands before demos or before the user base proves the need.
- **Inherited and hardened invariant** (from 0003): opt-in, non-destructive, no silent auto-update, no
  mandatory upstream link, no sovereignty reclaim — plus, now, no network dependency at engine startup.

## Rejected / deferred alternatives

- **A single "engine bucket"** (no Personal Extensions category) — rejected: it cannot honour the
  founding principle cleanly; user-grafted tooling would be at risk on every upgrade.
- **Jump straight to an npm package / plugin** (study Tracks B/C) — **deferred**: reintroduces a
  registry/network dependency before the user base justifies it, weakening 0001's offline guarantee. If
  adopted later, **vendored-first** (an offline fallback shipped in the brain).
- **Auto-upgrade / mandatory upstream link** — rejected, as in 0003: violates sovereignty.

## Supersedes 0003

0003's "no upgrade, for now" is **lifted**. Everything else in 0003 is **kept and strengthened**: its
sovereignty invariant survives verbatim, now backed by the structural write-allowlist of the founding
principle rather than by careful behaviour alone.

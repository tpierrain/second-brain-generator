# Maintainer conventions — repo-carried, brain-safe

> **Who this is for.** You are **DEVELOPING the launcher itself** (this `second-brain-generator`
> repo), **not installing a brain**. These are the durable working rules for maintaining the
> generator. They are **carried in the repo** so they travel with any clone / any machine / any
> collaborator — instead of living only in one person's local `~/.claude/` (global rules + machine
> memories, which do NOT travel).
>
> **Brain-safety.** This file lives under `maintainers/`, which `scripts/lib/tracked-files.mjs`
> (`DEV_ONLY_PREFIXES`) **excludes from the install copy** — it is **never** shipped into a generated
> brain (tested in `tracked-files.test.mjs`). The pointer to it sits in the **root `CLAUDE.md`
> bootstrap stub**, which the installer **overwrites** at install (marker
> `<!-- second-brain-generator:installer-stub -->`, see `scripts/lib/claude-md.mjs`). Two independent
> barriers ⇒ none of this reaches an end user's brain.

This file is the **single entry point** for the conventions. Some already have a detailed home in the
repo (linked below); the rest are spelled out here because they previously lived only in a personal
`~/.claude/`.

## 1. Plans, roadmaps, TODOs — checkboxes on every step

Any **plan / roadmap / TODO / progress-tracking** document I write or edit (first of all
`maintainers/plans/**`, but **any** file listing steps to do) MUST use Markdown **checkboxes**
`- [ ]` / `- [x]` on **every step AND every sub-step** — never plain bullets `-`, never text-only
markers (`TODO`, `✅ DONE`) alone — so progress can be **followed and ticked straight from the
Markdown** (Typora / Obsidian / the GitHub preview), with nothing to re-ask.

- A **multi-step plan** → a **"Tracking"** section at the top, **one checkbox per step**, then
  **sub-checkboxes** down each step. Reference model:
  [`plans/prospective/rag-embedder-plan-action.md`](plans/prospective/rag-embedder-plan-action.md).
- A **finished step** → tick `- [x]` **and** note _(date · commit)_: it's the memory that survives a
  `/clear`.
- **By default, when opening a plan**, restore the checkboxes if they're missing — don't wait to be
  asked.

## 2. Plan steps lead with the WHAT (capability), not the HOW

At the **first level** of a plan — section titles and the head of each step / sub-step — state the
**WHAT**: the functional capability being **added / changed / removed**, phrased in terms of what the
**brain, the installer, or the user can now do** (or what behaviour changes). The **HOW** — TDD,
baby-steps, file/seam names, the mechanics — belongs **nested underneath**, never at the headline.

Why: a human follows a plan by its **functional coherence** (the capabilities), not by its mechanics. A
first level that reads *"TDD a pure registry in `health-probe.mjs`"* hides the point; *"Detect when a
capability is functionally broken (RAG, index, embedder, MCP) and warn the user"* shows it. Leading with
the HOW, or mixing HOW into the WHAT at the top level, makes the plan unreadable to track.

- **Headline = capability / behaviour**, in user/product terms. Mechanics (test framework, file names,
  seams, the word "baby-steps") go in **indented detail** below.
- The HOW is the **default anyway** (TDD baby-steps + green-only = sections 1 and 5) — don't re-announce
  *"I'll do TDD"* on every step; spell out only what's **non-obvious** about the approach.
- Applies to plans, **Tracking** lines, ADR titles, **and how progress is narrated in chat** (lead with
  the capability changed, not "I wrote a test then made it pass").

> Thomas asked for this explicitly (2026-06-20): what matters to follow coherence is the **quoi**
> (capabilities) at the top level, the **comment** as nested detail — and to make it **emerge in the
> repo's harness**, not just a local memory. Hence this section.

## 3. One canonical plan = the repo's

The **living plan** is the one under `maintainers/plans/**` (ticked as work proceeds, opened in
Typora/Obsidian). The auto-saved snapshot under `~/.claude/plans/` is **throwaway**: the moment a plan
is promoted into the repo, mark the `~/.claude/` snapshot **⛔️ SUPERSEDED** and never open it or rely
on it again.

> Trap that motivated this: two desynced v3.3.0 plan files (0 vs 13 checkboxes), 2026-06-20. Always
> resolve to the repo copy.

## 4. Artifacts in English (conversation may be in French)

**Every durable artifact** I produce or modify is written in **English** — no hidden exception:

- **Code**: identifiers, function/variable/type names, **comments**.
- **Versioned docs & Markdown**: `README`, `SETUP`, ADRs, plans/roadmaps/TODOs, skills (`SKILL.md`),
  this file.
- **Git**: commit messages, **PR titles AND bodies**, issue descriptions, branch names.
- **Logs, error messages, end-user product strings** (except deliberate product localization).

**The one exception — deliberate product localization (do NOT "fix"):** `templates/<locale>/**`
(e.g. `templates/fr/…`), content generated under `--lang fr` / another locale, per-locale demo notes /
stopwords, proper nouns, quotes, and historical records kept on purpose in another language. Rule of
thumb: **I write it** (code, doc, commit, PR) → English; **the product speaks to a user in their
language** → respect the locale. A PR or comment left in French is a **defect to fix**, not a choice.

## 5. TDD baby-steps + green-only commits

- **Strict TDD on all code — engine AND harness.** One test at a time, **red → green → refactor**
  fully for each test (no test-first batch), fail-first, triangulation, mandatory refactor. The
  actionable discipline lives in the **`tdd-discipline`** skill (`.claude/skills/tdd-discipline/`).
  Operative repo rule: [`../DEVELOPING.md`](../DEVELOPING.md) §6. Back-ends/services use
  `outside-in-diamond-tdd`.
- **Commit only green.** Never commit a red suite. An outside-in acceptance test that is RED by design
  is marked `{ todo }` / skipped (executed + fail-first internally, but reported `todo`, not `fail`) so
  the suite stays green at `exit 0`; the flag is removed at the apply step. No history rewriting —
  green-only from here on.

## 6. ADRs carry a `Scope:` field

Every ADR carries a `- **Scope:**` line right under `STATUS`, with an **explicit** value (never the
vague "both"): **Installer** · **Second brain (runtime)** · **Second brain (runtime) + Installer** ·
**Generator development (maintainer workflow)**. It forces the author to situate the decision on the
launcher↔brain backbone (ADR 0001). Full convention: [`README.md`](README.md) (the `decisions/`
section).

## 6bis. When a decision evolves, AMEND the existing ADR in place — don't spin off a new one

When an already-accepted decision **evolves**, **amend the existing ADR in place** (enrich the relevant
sections — Decision, Safety invariant, Consequences, Rejected alternatives) rather than spinning off a new
ADR. **Do NOT create a new ADR for each evolution.** An evolution that belongs to the **same topic** (e.g.
"what the reconciler is allowed to write") lives in that topic's ADR, not a separate one — multiplying ADRs
makes `decisions/` hard to navigate. A brand-new ADR stays the right choice only for a decision on a
**genuinely new topic**. (Origin: decision B was first split into a separate ADR 0031 + back-pointer;
corrected to fold it into ADR 0026 in place.) **How to write the amended result: see §6ter** — amending in
place is about keeping **one ADR per topic**, NOT about leaving dated "AMENDED" scars in the prose.

## 6ter. Write each ADR for a fresh reader — explain the decision, don't justify the change of mind

An ADR is read by someone **discovering** the project, who never witnessed the deliberation. Write it as a
**single, timeless decision**: explain **why the decision is right** (the reasoning that stands on its own),
**not** the autobiography of how the thinking evolved. Drop "we first did X, then reverted", "consciously
revised", "the original §N said…", commit hashes, and "(amended date, person)" markers from the **ADR prose**
— they address someone who was present, and an unpublished ADR has no "before" for the reader.

- **Where the deliberation history lives:** the **plan** (a process doc — checkboxes, commit hashes, "X then
  revised to Y"), the **memory**, and **git history**. Not the ADR.
- **Rejected alternatives stay** — but framed timelessly ("option A was *considered* and rejected because…"),
  never as "we shipped A then undid it".
- **The one carve-out:** when the prior decision was **actually published / shipped** and readers may have
  built on it, keep a short **`supersedes X — migration: …`** note. That serves the reader; an
  in-the-same-cycle, never-published amendment does not.
- Composes with §6bis: amend in place (one ADR per topic) **and** write the result clean. (Origin: ADR 0030
  and 0026 were amended pre-publication with dated "AMENDED IN PLACE" scars; rewritten timeless once we saw
  the ADR addresses a fresh reader, not a witness.)

## 6quater. Lead every ADR with a Crux block

Every ADR opens with a short **Crux** block placed **right under the metadata** (STATUS / Scope / Related),
**before** Context: 2–4 bold-led lines giving the **decision** in one sentence, the single **key guarantee**,
and — where it applies (§6quinquies) — the **prior art** it mirrors. The crucial information must stand out
at a glance; the Context / Decision / Consequences detail stays below. **Applies to every future ADR**, not
just the ones touched when this convention was written.

> Thomas asked for this explicitly (2026-06-21): make the essential decision + its key guarantee jump out
> for a fresh reader instead of being buried in the body.

## 6quinquies. Name the prior art — say when a decision isn't NIH

When an ADR adopts an **established pattern**, **say so explicitly** and **cite the prior art** — we are not
reinventing the wheel. Name the industry standard the design mirrors, in a real *"Prior art / why this isn't
NIH"* subsection (or folded into the Crux), so "why this design is right" is obvious to a fresh reader.
Example: ADR 0026 names the **desired-state reconciliation loop** (Kubernetes controllers, GitOps Argo/Flux,
Terraform plan→apply, Chef/Puppet converge, Microsoft DSC Test/Set, Windows Installer self-healing) and
explains the SessionStart tick as its *level-triggered* tick — not a local hack. **Applies to every future
ADR.**

> Thomas asked for this explicitly (2026-06-21): an ADR that quietly re-derives a known standard reads as
> NIH; naming the prior art shows the design is deliberate and battle-tested.

## 7. Plan done = archived

The moment a plan ships, **in the same change**: set its top `STATUS` to ✅ (with proof — commit
SHAs / what was verified) **and `git mv` it into [`plans/archived/`](plans/archived/)**. Never leave a
shipped plan at the root; never delete it (the archive keeps the step detail). A plan whose core
shipped but that still carries an open conditional/exploratory tail goes to `plans/prospective/`.
Update the plans listing in [`README.md`](README.md). Full convention: [`README.md`](README.md).

## 8. Terminology — `reconcile` (mechanism) vs `self-heal` (runtime/user)

Use the cloud-native 2020s vocabulary consistently, so code and prose name the same thing the same way:

- **Mechanism / code → `reconcile` / "the reconciler"** (Kubernetes + GitOps + Terraform, and our own
  `reconcileMcpServers` / `reconcileHooks` / `reconcileBrain`). **Do NOT call the component "the
  converger"** — that noun is retired.
- **Runtime / user-facing → `self-heal` / "auto-réparation"** (Argo, Windows Installer, our
  `session-self-heal` hook). This is what the brain *tells the user*.
- **Precise nouns:** *desired state* (the manifest / `target`), *drift* (the gap), *idempotent*,
  *level-triggered* (the SessionStart tick), *converged* (the steady state). **Keep `converge` /
  `converged` / `convergence` as verb/state only** — they are correct and stay (~30 sites); only the
  component **noun** "the converger" was renamed to "the reconciler".
- Optional mental frame: DSC's **Test** (= `self-heal-detect` / `detectHookGap`) → **Set**
  (= `reconcileBrain`).

> Origin (2026-06-21): code said `reconcile`, prose said "converge"/"the converger" — the industry's two
> names for one thing. Locked one term per usage to keep the desired-state-reconciliation design legible.

## See also (operative rules already homed in the repo)

- [`../DEVELOPING.md`](../DEVELOPING.md) — manual commits, neutrality (+ the Thomas-Pierrain
  carve-out), generated files not versioned, the bootstrap-stub `CLAUDE.md`, §6 TDD, §7 the
  "one open PR of mine" resume convention (ADR 0013), §8 cross-platform parity (ADR 0015).
- [`README.md`](README.md) — what `maintainers/` is, the ADR `Scope:` convention, the
  plan-done = archived convention.
- ADR [`0009-prefer-deterministic-mechanisms.md`](decisions/0009-prefer-deterministic-mechanisms.md) —
  at equal reliability, prefer a deterministic mechanism over a probabilistic / LLM / in-memory-timer one.

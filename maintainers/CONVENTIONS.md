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

## 3bis. Memory ⇄ plan: pointers, not copies (and the /clear resume)

> Named principle behind §3 + §7: Thomas Pierrain, *"Des pointeurs, pas des copies, banane"*
> (<https://medium.com/@tpierrain/des-pointeurs-pas-des-copies-banane-56c9d197b80b>).

The agent's working-memory `MEMORY.md` is **reloaded in full every session** and is **size-bounded
(~25 KB)**. Duplicating a plan's state there is not just redundant — past the bound it **silently
overflows and buries the critical instructions** under stale text. So the memory holds **pointers,
not copies**:

- **State of a chantier lives in the repo plan** (§3, the single source of truth) — checkboxes,
  commits, remains-to-do. The memory keeps **one thin pointer line**, never a copy of that state.
- **On ship, prune it** — retire the SHIPPED pointer + its index line in the archiving change (§7).
- **`/clear` resume ritual:** a `/clear` is *free* precisely because nothing is lost in memory —
  the state is in the plan. To resume: **follow the pointer → open the repo plan → restart at the
  first unticked `- [ ]` → announce it before writing any code.** (Ticking the plan as work
  proceeds, §1, is what makes this pointer not lie.)

This is the **all-projects** convention; the global rule
`use-case-driven-harness/rules/plans.md` § "Mémoire & /clear" carries the same, machine-wide.

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

## 5bis. Test the glue too — "pure I/O" is not an exemption

The 2026-06-23 mutation audit found `document-scanner` and `vault-watcher` at a **0 % mutation score**:
they had **no test at all**, waved off in their own comments as *"pure I/O glue, not unit-tested"*. That
dismissal is the bug. I/O glue still hides logic — a `.md` filter, a `.obsidian` exclusion, an
`isIgnoredPath` predicate, event wiring — and untested logic is where silent regressions live.

- **No "it's just glue" pass.** Anything with a branch, a filter, a mapping or a wiring gets a test.
  When the obstacle is a real boundary (filesystem, chokidar, network), **extract the logic behind a
  small port / DI seam** and unit-test that; cover the thin adapter itself with one deterministic test
  (e.g. "the default factory builds a live, closeable watcher" — no event-timing).
- **"Unreachable" is the diagnosis, not the exemption (broadened 2026-07).** The 2026-07 retrospective
  found the same 0 %-driver beyond plain I/O: **pure branches unreachable via the public API**
  (`aggregateHealth`'s `unknown` verdict), **top-level side-effect scripts never imported**
  (`clear-example-notes`/`auto-push`/`auto-commit`), and **composition roots** (`server.ts` boot). Same
  fix everywhere: **if a test can't reach a branch, that's a design smell** — extract a pure seam,
  inject a port, or name every wiring factory (no inline arrows) until every branch is reachable. For a
  top-level script: extract an injectable core (`runX(argv, deps)` + a `realXDeps` default) and shrink
  the entry guard to one line; keep **one subprocess integration test** to kill the entry-body mutants a
  pure import cannot.
- **Coverage ≠ verification.** A suite can show high line coverage and still kill ~0 % of mutants. The
  objective signal is the **mutation score**, not coverage. See the plan
  [`plans/prospective/mutation-testing-stryker.md`](plans/prospective/mutation-testing-stryker.md).
- **Two durable guardrails back this up** (Step 4 of that plan): a deterministic **sibling-test guard**
  (`rag/src/lib/lib-coverage-guard.test.ts` fails loud if a `src/lib` module has no `*.test.ts`), and a
  targeted **non-regression re-run** (`npm --prefix maintainers/mutation run mutate:changed`).

## 5ter. Assertion quality — what the mutation retrospective taught (2026-07)

The mutation audit + hardening of all three packages (plan
[`plans/prospective/mutation-testing-stryker.md`](plans/prospective/mutation-testing-stryker.md),
Step 6) found **recurring shapes** of surviving mutant. Two homes:

- **The 5 language-agnostic assertion habits** (assert the message not the fact; assert the whole
  object/call-sequence not one field; triangulate boundaries **and** operators; feed the null/absent
  twin of every `?.`/`??`/default-arg; test collections with ≥2 unsorted elements + a decoy) live in
  the **global `tdd-discipline` skill** (§ "Qualité des assertions") — they apply to every project.
- **The repo-specific / infra-shaped ones** are recorded **here**:

  1. **CLI/script fakes must key on the FULL command, and assert the whole call sequence.** A fake git
     keyed on `args[0]` lets every *later* arg-string mutant survive (`--get`, `@{u}..HEAD`, the commit
     `-m <message>`). Key the fake on `args.join(" ")` and `deepEqual` the full command list, message
     included. Mirror real trailing-newline output so the production `.trim()`s are pinned.
  2. **Composition roots / entry guards.** Name every wiring seam (no inline arrows Stryker can't
     observe), inject a `BootDeps`, and guard the boot behind `import.meta.url` so the module is
     import-testable. The entry guard itself is an **accepted equivalent** (runs only when the file IS
     the process) — earn it back with **one** subprocess integration test where it matters (that lone
     test is the whole gap between `auto-commit` 98 % and `auto-push` 92 %).
  3. **LLM-facing string surfaces** (MCP tool names + every tool/field description) never affect a
     return value, so behavioural tests miss them — **assert them explicitly** (drive the real
     registered surface via an in-memory `Client`/`InMemoryTransport`, assert names + non-empty
     descriptions). They steer the model; a blanked description is a silent contract regression.

**Equivalent-mutant literacy — don't chase these** (document + count as "effective 100 % on
non-equivalents"): the default-wiring of an injected port (only exercised in a real I/O run), a
`?? []`/`?? null` whose result is immediately `.map().join('')`ed back to the same string, a greedy
regex masked by a downstream `.trim()`, real-SDK/real-network construction (`new Client({auth})`),
`import.meta.url` entry guards, and `Number()`/parse that already trims. **Tooling trap:** Stryker
**inflates** the score via false timeouts (a bogus 87.5–100 % that masks the honest ~56 %) — bridle
`concurrency`/`timeout` in the config before trusting a run.

**Deterministic guard (ADR 0009 spirit).** Only one cluster is cheaply catchable mechanically — C1
(bare `throws`/`rejects`). [`scripts/lib/assert-matcher-lint.mjs`](../scripts/lib/assert-matcher-lint.mjs)
+ its `*.test.mjs` guard fail CI loud if any engine test file calls `assert.throws(…)`/`assert.rejects(…)`
with no matcher/2nd argument (dev-only, excluded from the brain copy via `DEV_ONLY_PREFIXES`). The
other clusters stay **written rules** (no cheap reliable check) — the on-demand net is
`npm --prefix maintainers/mutation run mutate:changed`.

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
**genuinely new topic**. (Origin: decision B was first split into a separate new ADR + back-pointer;
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

**Ship ⇒ also retire the working-memory pointer (anti-context-rot).** A maintainer's running
working-memory (the agent's `MEMORY.md` index, loaded in full every session) must NOT accumulate
"✅ SHIPPED" lines — a shipped chantier's trace already lives in git + the archived plan. So, **in the
same change that archives the plan**, delete the chantier's thin memory pointer and its index line. Keep
a memory only for a **durable lesson not derivable from the code** the work produced (saved as its own
`feedback`/`reference` note), never as a delivery-status line. An active chantier keeps exactly **one
thin pointer** to its repo plan — never a copy of the plan's state.

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

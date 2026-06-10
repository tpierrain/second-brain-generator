---
name: tdd-discipline
description: "Universal TDD discipline — baby-steps (one test at a time, complete red→green→refactor at each step, NOT test-first batch), make sure the test fails first (fail-first), triangulation, refactor never optional. Language-agnostic, for ALL code (libs, tools, helpers, algos, services). To load as soon as you write or modify code in TDD."
version: 1.0.0
origin: use-case-driven-harness
---

# TDD discipline (universal)

> Skill vendored from the `use-case-driven-harness` harness (manual re-sync).
> Deliberately reduced to the **universal foundation**: the specialized variants (back-end
> architecture, per-language conventions) live in the source harness, outside the scope of this generator.

The core TDD discipline, **language-agnostic**, which applies to **every type of code**:
small libs, simple tools, helpers, isolated algorithms as well as services and applications.
In this repo, it governs **all the code** without exception: the RAG engine (`rag/`) **as well as**
the install harness (`installer.mjs` and its helpers `scripts/lib/*.mjs`) — all tested via
`node --test`. Not just the engine.

## Baby steps, NOT test-first batch

**One test at a time.** Cycle 🔴 red → 🟢 green → ♻️ refactor **complete for each test**, before writing the next test.

- **Forbidden**: writing several tests ahead then implementing to make them all pass. That's *test-first batch*, not TDD.
- **Why**: writing tests in a batch freezes the design upfront (the API is decreed before a single line of implementation) and **kills emergent design**. In baby steps, each test pulls the strict minimum of code and the structure is discovered increment by increment.
- **In practice**: test 1 → red → smallest code that passes → refactor → test 2 → red → … Each step is the smallest one that makes the current test pass.
- **Refactor is never optional.** The step is only *done* after the ♻️. It applies **first to the implementation code**: better structure, same behaviors — a refactor **never changes the public contract** (that's its definition: behavior-preserving). On the tests, it is limited to making them **more readable** (names, helpers, intent) — **never** to weakening their assertions or making them check fewer things. If a test covers poorly, that's a *new* test, not a refactor. Even with nothing to clean up, you consciously go through the step and note it ("refactor: nothing to do"). Skipping the refactor "because it works" accumulates debt at every cycle — which is exactly what the baby-steps discipline is meant to prevent.

## Make sure the test fails first (fail-first)

Before writing a single line of implementation, **verify that the new test fails
for the right reason** (unsatisfied assertion, not an accidental compilation error
or a test that does not even run). A test that passes before you've coded proves nothing:
you have to see it 🔴 *red* first, then make it 🟢 *green*. That's the guarantee that the test
actually tests something.

## Triangulation

When the expected behavior is not obvious, you **triangulate**: you introduce
generalization in the implementation only when **at least two examples** (two tests)
demand it. The first test can be satisfied by a "hardcoded" answer; the second,
different, forces the real logic out. This avoids over-generalizing too early — generality
emerges from the examples, it is not decreed.

## Assert on behavior, never on display strings

Assertions (and test setups) must **not depend on the text** of an error
message, a log or a console output (e.g. `assert(!/PUSH ÉCHOUÉ/.test(stdout))`).

- **Why**: a message changes for a thousand reasons (refactor, i18n, punctuation) without the
  behavior moving → the test breaks wrongly, or worse passes wrongly. **The message is not the
  contract.**
- **In practice**: assert on the **real observable state/behavior**. Examples: for "the
  auto-commit hook did not push", verify that a bare repo serving as remote **received no
  commit** (`git --git-dir … rev-list --count HEAD`) rather than the absence of a failure message;
  for a decision, test a **pure function** that returns data rather than the script's log.

## Scope

This discipline **holds for all languages** and all types of code. It's the
non-negotiable foundation. The specialized variants (by framework, by language, by architecture style)
**presuppose** it without ever contradicting it.

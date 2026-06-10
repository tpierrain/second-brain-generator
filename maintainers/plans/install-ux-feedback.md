# Plan — Install UX feedback (v2 EN field test, 2026-06-10)

> Source: Thomas live-tested the **v2 English install** end-to-end (clone → chat-driven
> `--non-interactive` install → first conversation inside the brain `brainy`) and sent a series of
> field-feedback screenshots. This plan collects **all** the resulting changes so they can be
> delegated in a fresh session after a `/clear`.
>
> **Scope split (important):**
> - The **chat-driven install flow** is governed by the launcher's bootstrap stub `CLAUDE.md`
>   (the file Claude reads to drive the non-interactive install). Most items below live there.
> - The **generated brain's behaviour** (the demo/first-launch flow) lives in `CLAUDE.md.template`
>   (EN source) + `templates/fr/CLAUDE.md.template` (FR overlay). Item E lives there.
> - The **interactive installer** menu strings live in `installer.mjs` (Item F).

---

## Status legend
- ✅ DONE = already edited on disk this session (survives `/clear`); the delegate should **verify**, not redo.
- ⬜ TODO = not started.

---

## A. Location question — never offer cwd/launcher/temp; ask name first; reuse the real name  ✅ DONE
**File:** `CLAUDE.md` (launcher stub), Step 2 + Guardrails.
**What was changed:**
1. Added a 🚫 callout in Step 2: **never** offer the current working dir, the launcher folder, or any
   temp dir (e.g. `~/tmp4`) as a location option, and **never as the first/default**. Standing options =
   **Home (`~/<the-name>`, default)** + free-text **Other**. Push back if the user types launcher/cwd/temp.
2. Added a matching line in the **Guardrails** section.
3. **Ask the brain name FIRST, on its own** (Q1), then the remaining three (location, owner, language)
   **as one group** (Q2–Q4) — so the captured name can be substituted into the location option
   (`Home (~/<typed-name>)`, not the literal `Home (~/<name>)`).
4. **Never suggest a default/example brain name.** ⚠️ `brainy` in this plan and in the test screenshots
   was **only Thomas's throwaway test name** — it must **never** be proposed by the installer. The user
   always provides the name; capture exactly what they type. All `brainy` examples were removed from the
   stub and replaced with the `<name>` placeholder + a "never invent/suggest a name" instruction.
**Why:** screenshot showed `Inside ~/tmp4` offered as option 1 (working dir) — a known footgun (CWD-freeze,
temp-dir cleanup risk); and the location recap showed a literal `<name>` instead of the user's typed name.
**Verify:** re-run a dry chat-install; the location step must show `Home (~/<typedname>)` + Other only,
and no default name is ever pre-filled or suggested at Q1.

## B. Embedder option 2 — generic "via an API", add Mistral, de-dramatize the training framing  ✅ DONE (stub) / ⬜ TODO (installer.mjs)
**Files:** `CLAUDE.md` §2.bis ✅ ; `installer.mjs` ⬜ (see Item F).
**What was changed in the stub (✅):** option 2 relabelled **"Via an API (Gemini, OpenAI, Mistral, or
your own endpoint)"**; description de-dramatized — notes are sent to the provider's API, but **in many
cases data is NOT used for training**; it depends on provider/plan; tell the user to **pick the right
settings** (paid tier, or the provider's "no-training" / data-controls option). `--embedder gemini`
unchanged as the technical flag for this option.
**Why:** "Gemini API" was misleading (it's not only Gemini), and the old "free = exploited" framing was
needlessly scary. Thomas wants Mistral added as an example and a calmer, accurate framing.

## C. Embedder option 3 — "a model running locally, via Ollama", for the most technically advanced  ✅ DONE (stub) / ⬜ TODO (installer.mjs)
**Files:** `CLAUDE.md` §2.bis ✅ ; `installer.mjs` ⬜ (Item F).
**What was changed in the stub (✅):** option 3 relabelled **"A model running locally on your machine,
via Ollama"**; "advanced" reworded to **"Setup for the most technically advanced users."**

## D. Final recap "Next step" — TWO WAYS TO USE YOUR BRAIN, Desktop first, non-collapsible  ✅ DONE
**File:** `CLAUDE.md` (launcher stub), Step 4 point 3.
**What was changed:** restructured into an explicit **"TWO WAYS TO USE YOUR SECOND BRAIN"** block;
**Desktop FIRST** (`### 🖱️ OPTION 1 — CLAUDE DESKTOP APP`, the common case, non-devs), **CLI second**
(`### ⌨️ OPTION 2 — TERMINAL`). Added a hard **anti-dilution** rule: *NEVER collapse this to a single
`cd … && claude` line*. Keeps the can't-miss ⚠️ UPPERCASE header at the TOP of the final message;
substitutes the user's **actual** brain name everywhere (the one typed at Q1), no literal `<name>` and
no invented name.
**Why:** in the field test the recap had degraded to a lone `cd <brain> && claude` (CLI only), burying
the Desktop path most users need. Screenshot confirmed.
**Verify:** the final message of an install must lead with the ⚠️ block and show both labelled options,
Desktop first.

## E. NEW — Brain offers yes/no deletion of the fictional example notes after the demo answer  ⬜ TODO
**Files:** `CLAUDE.md.template` (EN, §0 "First launch") + `templates/fr/CLAUDE.md.template` (FR overlay).
Possibly a tiny brain-side helper for the actual removal.
**Desired behaviour (from Thomas):** right **after** the brain successfully answers the demo/canary
question (the "your brain is wired up" proof), it should **proactively propose to delete the fictional
test data**, asking a simple **yes/no**. And it must **reassure**: even if the user says no now, these
**~5 files** can be removed **later, any time, just by asking**, and the brain will have "forgotten"
them (re-index). No pressure, no drama.
**The 5 example-tagged files** (frontmatter `tags: [..., exemple]`):
- `vault/topics/flemmr.md`
- `vault/decisions/2025-11-20-inertia-trophy.md` (FR: `2025-11-20-trophee-de-l-inertie.md`)
- `vault/daily/2026-01-15.md`
- `vault/people/jean-kevin-de-la-glandee.md`
- `vault/backlog/personal.md` (FR: `perso.md`)
**Existing machinery to reuse:** `scripts/lib/example-notes.mjs` →
`findExampleNotes(vaultDir)` / `clearExampleNotes(vaultDir)` (tag-based, recursive). `vault/README.md`
and the harness backlog are NOT tagged → preserved by construction.
**Implementation notes / decisions to make:**
- The deletion is a **write** → must stay **confirmed** (yes/no), consistent with the brain's
  "writes always confirmed" posture. The yes/no offer itself satisfies that.
- On **yes**: delete the tagged example notes (reuse `clearExampleNotes`, or `git rm`), then **re-index**
  so the RAG forgets them; auto-commit will record it. Confirm in one line.
- On **no**: keep them; print the reassurance ("anytime, just ask — I'll remove these ~5 example notes
  and re-index"). The existing §0 startup directive already stops showing the wiring-test block once
  `vault/topics/flemmr.md` is gone, so deletion also retires the demo prompt naturally.
- Decide **where the offer text lives**: extend §0 of `CLAUDE.md.template` with a "after the demo
  answer" paragraph (the demo answer itself is improvised by Claude from §0). Mirror in the FR overlay.
- Keep it **locale-aware** (EN template + FR overlay strings).
**Verify:** ask the canary question in a fresh brain → answer + yes/no deletion offer; answer "no" →
reassurance shown; answer "yes" → 5 files gone, re-indexed, demo block no longer appears.

## F. Align the interactive installer menu with the new embedder wording  ⬜ TODO
**File:** `installer.mjs` (lines ~284–324 region) + check `SETUP.md` / `.env.example` for the old framing.
**What to change:** mirror Items B & C in the interactive menu so both flows match:
- `EMBEDDER_LABELS.api.title` → "Via an API (Gemini, OpenAI, Mistral, or your own endpoint)".
- `EMBEDDER_LABELS.api.hint` and `printEmbedderEducation()` "privacy scale" → de-dramatize:
  drop the blunt "free ≠ private / 🔴 FREE … exploited" framing; replace with "depending on the
  provider & plan, choose the right settings so your notes aren't used for training".
- `EMBEDDER_LABELS.ollama.title`/hint → "A model running locally, via Ollama — setup for the most
  technically advanced".
- The Gemini sub-flow message (lines ~367–372) "free ≠ private" → soften similarly (still honest:
  notes leave the machine; the right plan/settings prevent training use).
- Grep `SETUP.md`, `.env.example`, `CLAUDE.md` Step 4 CASE B for residual "free ≠ private" mentions and
  align tone (keep the **factual** "notes leave the machine"; drop the alarmist "exploited").
**Tests:** `embedder-choice` tests assert **logic** (keys/recommendation), not label strings, so wording
changes should be safe — but run the suite (`node --test`) after editing. If any test asserts a label,
update it as a wording change.
**Note:** this is consistency work; the field test used the **chat** flow (already fixed), so F is lower
priority than E but should ship together for coherence.

## G. README — make the install section findable & visually scannable  ⬜ TODO
**File:** `README.md`. Field feedback: the install/onboarding part feels "lost" when scrolling.
**Structure today:** pitch (l.1–31) → `---` (l.33) → explainer sections → `---` (l.135) → `## Ready to
try it?` (l.137, the install) with `### How do I choose my RAG / What you need / Installation`.
GitHub auto-generates heading anchors.
**Changes requested by Thomas:**
1. **Two nav links at the very top** (just under the pitch, ~l.8): one to *what is a second brain?*
   (`#what-is-a-second-brain`, the section just below) and one *install now*
   (`#ready-to-try-it`, the block after the `---`). E.g.:
   `**[🧠 What's a second brain?](#what-is-a-second-brain) · [🚀 Install yours now](#ready-to-try-it)**`
   ⚠️ Verify the actual auto-anchors after any heading-emoji change (an emoji in the heading changes
   the slug — keep the link target in sync, or anchor with an explicit `<a id="...">`).
2. **Reinforce the separator before the install block** so it's a clear visual break: keep the `---`
   and strengthen the heading, e.g. `## 🚀 Ready to try it? — install your brain in one paste`, plus a
   short emoji callout right after the `---` to catch the eye on scroll.
3. **Visual rhythm in the install subsections** — emoji-prefix the `###` headers
   (🧭 choose RAG / 📦 what you need / ⚙️ installation) and the "3 moves" list (🔑 / 💾 / 🔄).
4. **Add a visual — DECISION: option A chosen** (Thomas, 2026-06-10, "A pour l'instant"):
   - **A ✅ CHOSEN: a 4-step flow strip** at the top of the install section —
     `📋 clone → 💬 4 questions → 🧠 brain created → 🔄 new conversation`. Most scannable; explains the
     flow at a glance. New asset in `docs/img/` (deliver the strip image; keep alt text descriptive).
   - **B (deferred): a real screenshot/GIF of the chat install** (the 4 questions + final recap).
     Possible later complement; `docs/img/` already holds `desktop-folder-chips.png` +
     `desktop-recent-menu.png` to reuse.
   - **C (rejected): a decorative banner** as the separator (low value, purely cosmetic).
**Note:** if heading text changes (emojis), re-check every in-page anchor link in the README (TOC,
the two new top links, and the existing `#-the-rag-à-la-carte…` / `#how-do-i-choose…` links).
**Verify:** open the rendered README on GitHub; the two top links jump correctly; the install section
stands out on a fast scroll.

---

## Cross-cutting reminders for the delegate
- The launcher stub `CLAUDE.md` is **English-only** (no FR copy) → no overlay to sync for Items A–D.
- Item E **must** touch both `CLAUDE.md.template` and `templates/fr/CLAUDE.md.template` (FR is an overlay).
- Respect the existing tone of the constitution (warm, plain language; fail-loud posture for RAG).
- Decision D1 framing softening (Items B/F) is an **intentional reversal** of the earlier "free ≠
  private" hard line — Thomas asked for it explicitly (2026-06-10). Update the memory note
  `local-embedder-in-process-path.md` accordingly when done.

## Suggested commit grouping
1. `docs(installer-stub): location guardrail + name-first + reuse captured name` (Item A)
2. `docs(installer-stub): generic API embedder wording (+Mistral), de-dramatize, Ollama label` (B+C, stub)
3. `docs(installer-stub): final recap = two ways to use the brain, Desktop first, non-collapsible` (D)
4. `feat(brain): offer yes/no deletion of example notes after the demo answer (EN+FR)` (E)
5. `chore(installer): align interactive menu + docs with new embedder wording` (F)
6. `docs(readme): top nav links + visible install separator + emojis + flow visual` (G)

## How to validate end-to-end (per Thomas's working style: prove empirically)
Re-run a disposable install into a tmp folder (different `--name`), then open a NEW conversation rooted
in the created brain and walk the first-launch flow:
- 4 questions: name asked first; location shows `Home (~/<name>)` + Other (no tmp/cwd option).
- embedder: 3 options with the new wording.
- final recap: ⚠️ TWO WAYS block, Desktop first.
- demo question → wired-up proof → yes/no deletion offer → both branches behave.
Then delete the disposable brain.

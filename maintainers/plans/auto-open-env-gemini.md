# Plan — Auto-open `.env` in the editor on the Gemini-key path (CASE B)

> **Delegated, to run after `/clear`.** Branch: `chore/install-ux-feedback` (or a fresh
> `feat/auto-open-env`). Goal Thomas stated: *"I expect the `.env` to open by itself; that's what I
> want the INSTALLER to do. It did at some point — I think there's been a regression."*
> TDD where it applies (Thomas's discipline). Validate **empirically** on a disposable Gemini install.

---

## Diagnosis (verified 2026-06-10 — NOT a code regression)

- **There is no auto-open logic anywhere in `installer.mjs` / `scripts/`** — `grep` for
  `open -t`, `xdg-open`, `notepad`, `openEnv` returns nothing; `git log -S"open -t"` on the installer
  returns nothing. It was **never** in the installer code.
- The behaviour Thomas remembers ("it opened `.env` for me") was **Claude executing the launcher
  amorce** (`CLAUDE.md` bootstrap stub, **Step 4 → point 1 → CASE B**: *"open the .env YOURSELF … LAUNCH
  it via a shell command (Bash) … `open -t "$HOME/<sub-path>/.env"`"*). That path is **Claude-driven,
  hence non-deterministic**: some sessions run `open -t`, others (e.g. the brainito capture) only print
  the path. → perceived "regression".
- Today, on the Gemini path (`embedderCfg.needsGeminiKey && !geminiKey`, i.e. `geminiKeyMissing`),
  `installer.mjs` only **prints** a banner (~`installer.mjs:698`): *"⚠️ Gemini key not provided yet…
  paste it into `<envPath>`"* and then `Next steps: cd … && claude`. It never opens the file.
- **Field evidence (brainito QA, 2026-06-10):** the `.env` opened **only after the user typed
  "ouvre moi le fichier stp"** → Claude then ran *"Open .env in default text editor"* and confirmed
  *"C'est ouvert — ~/brainito/.env est affiché dans TextEdit. Remplis la ligne 12…"*. So the open is
  **reactive** (needs the user to ask), never **proactive**. A user who doesn't think to ask stays
  stuck on "paste your key into `<path>`" with nothing opening. → confirms: make it proactive in the
  installer, and Part 3 must have Claude announce "I've opened it" instead of waiting to be asked.

**Fix = make the installer open `.env` itself, deterministically, on CASE B only.** Keep the amorce
as a *fallback*, not the primary mechanism.

---

## The fix

### Part 1 — A tested, cross-platform opener seam (TDD)
New lib **`scripts/lib/open-env.mjs`** with two **pure / seam-injectable** units (unit-test first,
fail-first, baby-steps per `tdd-discipline`):

1. `buildOpenEnvCommand(platform, absPath)` → `{ command, args } | null`
   - `darwin` → `{ command: "open", args: ["-t", absPath] }` (TextEdit; field-verified).
   - `win32`  → `{ command: "notepad", args: [absPath] }`.
   - `linux`  → `{ command: process.env.EDITOR ?? "xdg-open", args: [absPath] }` (decide EDITOR vs
     xdg-open in the test; xdg-open opens the GUI default, EDITOR may be a TTY editor — prefer
     `xdg-open` for the GUI case, fall back to `${EDITOR}` only if no DISPLAY but a terminal editor is
     set). Keep it simple: `xdg-open` by default.
   - unknown platform → `null`.
   - **Always an absolute path** (`envPath` from the installer), never a quoted `~` (doesn't expand).

2. `shouldOpenEnv(env, platform)` → `boolean` — the guard (test the matrix):
   - **false** if `env.SBG_NO_OPEN_ENV` is set (the escape hatch for tests/CI/disposable installs).
   - **false** if `env.CI` is set.
   - **false** on `linux` when neither `DISPLAY` nor `WAYLAND_DISPLAY` is set (headless → would hang/no-op).
   - **true** otherwise (incl. `--non-interactive` Claude-driven installs: the human IS at the keyboard).

3. `openEnvInEditor(absPath, { platform, env, spawn })` — thin wrapper: if `shouldOpenEnv` and
   `buildOpenEnvCommand` give a command, `spawn(command, args, { detached: true, stdio: "ignore" })`
   and `unref()`. **Best-effort: swallow every error** (a failed open must NEVER fail the install or
   throw). Returns `{ opened: boolean }`. Inject `spawn` so the test asserts it's called with the right
   `(command, args)` and that a throwing spawn is caught and yields `{ opened: false }`.

> ⚠️ **The guard is the whole point of not regressing the dev/CI experience.** Without
> `SBG_NO_OPEN_ENV`, every disposable Gemini install (mine, CI) would pop a TextEdit window. The
> validation installs in this plan **must export `SBG_NO_OPEN_ENV=1`**.

### Part 2 — Wire it into `installer.mjs` (CASE B only)
In the `geminiKeyMissing` branch (~`installer.mjs:698`, where the "⚠️ Gemini key not provided yet"
banner is printed):
- Call `const { opened } = openEnvInEditor(envPath, { platform: process.platform, env: process.env, spawn });`
- **Adapt the banner copy** to the outcome:
  - `opened` → *"✓ I opened your `.env` in your editor. Paste your Gemini key right after
    `GOOGLE_GEMINI_API_KEY=`, save (⌘S on macOS), then run `cd rag && npm run index` (or just open your
    brain — it indexes on first launch)."*
  - `!opened` → keep today's copy: *"paste it into `<envPath>` (line `GOOGLE_GEMINI_API_KEY=`)"* +
    the "if nothing opened" Finder/VS Code fallbacks already described in the amorce.
- **Only on CASE B** (`needsGeminiKey && !geminiKey`). In-process / Ollama / endpoint-completed →
  **never** open `.env` (no key to paste; verified by a test asserting `openEnvInEditor` is not invoked
  for `in-process`).
- Import `spawn` from `node:child_process` at the top alongside the existing imports.

### Part 3 — Reconcile the amorce (avoid a double-open)
`CLAUDE.md` (launcher bootstrap stub), **Step 4 → point 1 → CASE B**: change the instruction from
*"open the .env YOURSELF via `open -t`"* to: *"the installer has **already opened** the user's `.env`
in their editor — tell them to paste the key after `GOOGLE_GEMINI_API_KEY=`, save, and confirm. **Only
if it did NOT open** (headless / no GUI editor) do you open it yourself (`open -t`/`xdg-open`/…) or, last
resort, give the path."* Keep the **"key never in chat / never an argument"** guardrail intact.
*(This also pre-empts P1/P3 of the handoff feedback — see memory `install-handoff-feedback-gemini`.)*

---

## Validation (all must pass before committing)
1. `node --test scripts/**/*.test.mjs scripts/*.test.mjs` → green, incl. the new `open-env.test.mjs`
   (command matrix + guard matrix + swallow-errors + not-invoked-for-in-process).
2. **Disposable Gemini install, GUARD ON (no editor should pop) — proves the wiring without spam:**
   ```bash
   DEST=$(mktemp -d /tmp/sbg-gem.XXXXXX)
   SBG_NO_OPEN_ENV=1 node installer.mjs --non-interactive --name brain-gem --dest "$DEST" \
     --owner Thomas --lang en --embedder gemini
   ```
   → exit 0; banner shows the `!opened` copy (path to paste); **no TextEdit window**.
3. **Manual (Thomas, real Mac, GUI):** same install **without** `SBG_NO_OPEN_ENV` → **TextEdit opens
   on `<DEST>/brain-gem/.env`** and the banner shows the `opened` copy. *(A headless agent can't see the
   GUI; assert the spawn was attempted via a wrapper if you want determinism, but the human check is the
   bar Thomas asked for.)*
4. **Disposable in-process install** → exit 0 and **`.env` NOT opened** (no key path).
5. Clean up: `rm -rf /tmp/sbg-gem.*`.

> Don't pretend: a failing `open` must not fail the install, but the install must still exit 0 and the
> path must still be printed. Only declare done on a real exit 0 + the manual GUI confirm.

---

## Suggested commits (separate, on the branch)
1. `feat(installer): tested cross-platform open-env seam (buildOpenEnvCommand + shouldOpenEnv + openEnvInEditor)`
2. `feat(installer): auto-open .env in the editor on the Gemini-key path (CASE B), guarded by SBG_NO_OPEN_ENV`
3. `docs(amorce): CASE B — installer already opens .env; Claude only guides the paste (fallback if it didn't)`

## Cross-cutting reminders
- **CASE B only** — never open `.env` for in-process/Ollama/endpoint-completed.
- **Best-effort, non-fatal** — a failing/absent editor never breaks the install; always keep the
  printed path as the fallback.
- **`SBG_NO_OPEN_ENV` is mandatory** in every automated/disposable/CI install (incl. this plan's own
  validation) to avoid popping editors.
- **Key never in chat / never an argument** stays true — this plan only opens the *file*, never handles
  the key value.
- Relates to memory `install-handoff-feedback-gemini` (P1/P2/P3 of the broader "option B"); this plan
  ships the `.env` auto-open slice cleanly on its own.

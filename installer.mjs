#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// installer.mjs — interactive installer for the Second Brain Generator.
// Checks prerequisites, customizes the harness, installs the RAG engine.
// Idempotent: can be re-run without breakage.
//
// Multi-OS: pure Node (the only runtime prerequisite). Works in cmd /
// PowerShell (Windows) as well as bash/zsh (macOS/Linux). No dependency on a
// shell, jq, sqlite3 or sed.
//
//   Usage:  node installer.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, homedir, totalmem } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { smokeTestMcp } from "./scripts/lib/mcp-smoke.mjs";
import { CONNECTORS } from "./scripts/lib/connectors-catalog.mjs";
import { applyConnectorFiles } from "./scripts/lib/connectors-apply.mjs";
import { clearExampleNotes } from "./scripts/lib/example-notes.mjs";
import { isInstallerStub } from "./scripts/lib/claude-md.mjs";
import { parseAnswers, resolveTargetDir, resolveRunMode } from "./scripts/lib/installer-args.mjs";
import { parseLsFilesZ, filterCopyable } from "./scripts/lib/tracked-files.mjs";
import { resolveLocale, chooseLocale } from "./scripts/lib/locale.mjs";
import { overlayLocale } from "./scripts/lib/locale-overlay.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  applyRagLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  nodeHookCommand,
  minimalPathEnv,
} from "./scripts/lib/rag-launcher.mjs";
import { DEMO_BY_LOCALE, DEMO_EXPECT } from "./scripts/lib/demo.mjs";
import {
  buildEmbedderOptions,
  recommendedEmbedderKey,
  envConfigForEmbedder,
  embedderReady,
} from "./scripts/lib/embedder-choice.mjs";

// ROOT = the LAUNCHER (this cloned repo). READ-ONLY, reusable source: the
// installer NEVER writes to it. It CREATES a brain folder elsewhere (TARGET),
// copies the tracked files into it, then `git init` inside → no link to the
// launcher by construction. No process.chdir: everything goes through explicit
// paths (ROOT to read, TARGET to write).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

// npm/npx carry a .cmd extension on Windows; node/git are .exe files.
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

// Paths injected into JSON: we normalize to forward slashes "/" (valid on
// Windows for node/npx/cwd and safe in JSON, unlike backslashes).
const toPosix = (p) => p.split("\\").join("/");

// ── Colors ──────────────────────────────────────────────────────────────────
const tty = stdout.isTTY;
const c = {
  B: tty ? "\x1b[1m" : "",
  G: tty ? "\x1b[32m" : "",
  Y: tty ? "\x1b[33m" : "",
  R: tty ? "\x1b[31m" : "",
  C: tty ? "\x1b[36m" : "",
  X: tty ? "\x1b[0m" : "",
};
const ok = (m) => console.log(`${c.G}✓${c.X} ${m}`);
const warn = (m) => console.log(`${c.Y}!${c.X} ${m}`);
const err = (m) => console.error(`${c.R}✗${c.X} ${m}`);
const step = (m) => console.log(`\n${c.B}━━ ${m}${c.X}`);

// DEMO (canary question) + DEMO_EXPECT: from scripts/lib/demo.mjs (source of truth
// shared with verify-rag.mjs). Used by the post-flight probe and the final message
// ("ask a question, e.g. …"). The question is resolved to the INSTALLED locale (see
// `DEMO` below, once `locale` is known) so an fr brain probes with the fr question
// against its fr vault — the launcher-root export would otherwise always be `en`.

console.log(`${c.B}${c.C}`);
console.log(`  ╔══════════════════════════════════════════════╗`);
console.log(`  ║        Second Brain Generator — installer    ║`);
console.log(`  ╚══════════════════════════════════════════════╝`);
console.log(c.X);

// Help (installs NOTHING). Shown before the prerequisites so it works even
// without git/node, and so an agent can inspect the options without risk.
function printUsage() {
  console.log(`Usage: node installer.mjs [options]

CREATES a new brain folder from this launcher (the launcher stays intact).

Options:
  --name <name>         Brain name = name of the created folder (default: second-brain)
  --dest <folder>       Parent folder where the brain is created (default: your home → ~/<name>)
  --owner <name>        Your name (default: git config user.name)
  --lang <language>     Default language for notes (default: français)
  --embedder <choice>   Search engine: in-process | gemini | ollama
                        (omitted → adaptive recommendation based on the machine)
  --non-interactive     Run without asking any questions (REQUIRED outside a terminal).
                        Aliases: --yes, --no-input
  --help, -h            Show this help and exit (installs nothing)

Security: the API key is NEVER an argument — it goes into .env afterwards.

Without an interactive terminal AND without --non-interactive, the installer
REFUSES to guess (no phantom install with default values).`);
}

// --help / -h short-circuits everything, even before the prerequisites: nothing is installed.
if (parseAnswers(process.argv.slice(2), {}, {}).help) {
  printUsage();
  process.exit(0);
}

// Runs a command without throwing; returns { out, ok }.
function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { out: out ?? "", ok: true };
  } catch (e) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
  }
}

// ── 1. Prerequisites ──────────────────────────────────────────────────────────
step("1/9 · Checking prerequisites");
let missing = false;

// Node: we are already running inside it, version readable directly.
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 18) {
  ok(`node found (v${process.versions.node})`);
} else {
  err(`Node ${nodeMajor} too old — Node ≥ 18 required: https://nodejs.org`);
  missing = true;
}

const git = run("git", ["--version"]);
if (git.ok) ok(`git found (${git.out.trim()})`);
else {
  err("git missing — install it: https://git-scm.com");
  missing = true;
}

const npm = run(NPM, ["--version"]);
if (npm.ok) ok(`npm found (v${npm.out.trim()})`);
else {
  err("npm missing — shipped with Node.js: https://nodejs.org");
  missing = true;
}

if (missing) {
  err("Missing prerequisites — fix the items above then re-run: node installer.mjs");
  process.exit(1);
}

// ── 2. Customization ──────────────────────────────────────────────────────────
step("2/9 · Customizing the harness");

const gitUser = run("git", ["config", "user.name"]).out.trim();

// Answers drivable without a keyboard: CLI flags > env variables > defaults.
// Serves the "Claude-driven onboarding" flow (cf. CLAUDE.md bootstrap stub): Claude
// collects the answers in chat then calls ONE --non-interactive command.
// The Gemini key is NEVER an argument (security) — always deferred to .env.
const cli = parseAnswers(process.argv.slice(2), process.env, {
  projectName: "second-brain",
  ownerName: gitUser,
  language: "français",
  destParent: undefined,
});

// Central guardrail: we NEVER install with defaults without consent.
// Without a TTY (e.g. launched by an agent) AND without --non-interactive → outright
// REFUSAL, before any folder creation. Avoids the phantom install seen when the installer
// is invoked without a keyboard and without the flag (e.g. to "inspect the options").
const mode = resolveRunMode({
  isTTY: stdin.isTTY,
  nonInteractive: cli.nonInteractive,
  help: cli.help,
});
if (mode === "refuse") {
  err("Refusing to install with default values without explicit consent.");
  err("No interactive terminal detected (stdin not a TTY) and --non-interactive absent.");
  err("→ Run the installer in a REAL terminal to answer the questions,");
  err("  or pass --non-interactive with at least --name (see: node installer.mjs --help).");
  process.exit(1);
}
const interactive = mode === "interactive";
const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

async function ask(prompt, def = "") {
  if (!rl) return def;
  const suffix = def ? ` ${c.C}[${def}]${c.X} : ` : " : ";
  const ans = (await rl.question(`${prompt}${suffix}`)).trim();
  return ans || def;
}

let projectName, ownerName, language, destParent;
if (interactive) {
  // Prompts pre-filled with the CLI/env answers (or the defaults) as the proposed value.
  projectName = await ask("Brain name (folder to create)", cli.projectName);
  destParent = await ask("Location (parent folder)", cli.destParent ?? homedir());
  ownerName = await ask("Your name", cli.ownerName);
  language = await ask("Default language for notes", cli.language);
} else {
  warn("Non-interactive mode — answers taken from flags/env (or defaults).");
  projectName = cli.projectName;
  ownerName = cli.ownerName;
  language = cli.language;
  destParent = cli.destParent;
}

// ── Resolving the brain folder (TARGET) ──────────────────────────────────────
// We REFUSE an existing target (guarantees the installer is the one creating
// the folder — no grafting into an already-populated folder), then create it and
// copy the launcher's TRACKED files into it (git ls-files -z, in pure Node → handles
// spaces/accents, multi-OS). The launcher (ROOT) stays intact.
const TARGET = resolveTargetDir({ name: projectName, destParent, home: homedir() });
if (existsSync(TARGET)) {
  err(`The target folder already exists: ${TARGET}`);
  err("Choose another name (--name) or location (--dest), or delete it, then re-run.");
  process.exit(1);
}
mkdirSync(TARGET, { recursive: true });

const lsFiles = run("git", ["-C", ROOT, "ls-files", "-z"]);
if (!lsFiles.ok) {
  err("Could not list the launcher's files (git ls-files) — is the launcher a git repo?");
  process.exit(1);
}
const tracked = filterCopyable(parseLsFilesZ(lsFiles.out));
for (const rel of tracked) {
  const dst = join(TARGET, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(ROOT, rel), dst);
}
ok(`brain folder created: ${TARGET} (${tracked.length} files copied from the launcher)`);

// ── 2bis. Overlay of LOCALIZED artifacts (constitution, skills, demo vault) ────
// `--lang` (the notes language) ALSO drives the language of the generated artifacts.
// The localized sources live under templates/<locale>/ (excluded from the bulk
// copy); HERE we overlay only the chosen locale onto the brain, at relative
// paths. As long as templates/ is not populated, chooseLocale returns null →
// no overlay → the inherited artifacts (root) stay in place.
const locale = resolveLocale(language);
const templatesRoot = join(ROOT, "templates");
const availableLocales = existsSync(templatesRoot)
  ? readdirSync(templatesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];
const chosenLocale = chooseLocale(locale, availableLocales);
if (chosenLocale) {
  overlayLocale({ templatesRoot, locale: chosenLocale, target: TARGET });
  ok(`localized artifacts overlaid: locale "${chosenLocale}" (requested: "${locale}")`);
}
// Canary question for the vault actually installed (the overlaid locale, or `en`
// at the root when no overlay applies) — so an fr brain probes/suggests the fr
// question, matching its fr vault and its demo-locale.mjs marker.
const DEMO = DEMO_BY_LOCALE[chosenLocale ?? "en"] ?? DEMO_BY_LOCALE.en;

// ── 3. Embedding engine (private local / API key) ────────────────────────────
// Decision D1 (ADR 0007): explicit 3-way choice, ADAPTIVE recommendation per machine.
// We no longer FORCE the Gemini key: it is only asked for if the user picks the
// "API key + Gemini" option. The rest writes EMBEDDING_PROVIDER into .env.
step("3/9 · RAG embedding engine (the privacy choice)");
const envPath = join(TARGET, ".env");

// Menu labels (reuse the validated educational artifacts — ADR 0007).
const EMBEDDER_LABELS = {
  "in-process": {
    title: "Everything on your machine, nothing to install (\"Gemma inside\")",
    hint: "🟢 private + free + offline. ~1.5 GB RAM at rest, up to ~6 GB during indexing (16 GB+ recommended). Apple Silicon / Windows.",
  },
  api: {
    title: "With an API key (Gemini, OpenAI, or your company's endpoint)",
    hint: "🟡 light on the machine, but your notes go through the provider — \"free ≠ private\" (see below).",
  },
  ollama: {
    title: "Local via Ollama (advanced)",
    hint: "🟢 nothing leaves either, but a separate app to install + a model to download.",
  },
};

const machine = {
  platform: process.platform,
  arch: process.arch,
  totalMemBytes: totalmem(),
};
const options = buildEmbedderOptions(machine);
const recoOption = options.find((o) => o.recommended);
const ramGo = Math.round(machine.totalMemBytes / 1024 ** 3);
console.log(
  `Detected machine: ${c.C}${ramGo} GB RAM, ${machine.platform}/${machine.arch}${c.X}` +
    (machine.platform === "darwin" && machine.arch === "x64"
      ? ` ${c.Y}(Intel Mac → "fully-local" option unavailable)${c.X}`
      : ""),
);

// Education (interactive): the embedder ≠ a chat LLM + the privacy scale.
function printEmbedderEducation() {
  console.log(`\n${c.B}Useful note:${c.X} the embedder is NOT "ChatGPT on your machine".`);
  console.log(
    "  It's a small model that turns your notes into vectors for search —",
  );
  console.log("  lightweight (≈ a few hundred MB), not a large LLM. The LLM that ANSWERS is still Claude.");
  console.log(`\n${c.B}Privacy scale:${c.X}`);
  console.log("  🟢 fully-local (option 1/3) — nothing leaves your machine. Free, max privacy.");
  console.log("  🟡 paid API key / company endpoint — leaves, but 0 training (contractual).");
  console.log("  🔴 FREE API key (free Gemini included) — often exploited. Paying ≈ makes it private.");
  console.log(`\n${c.B}And your notes?${c.X} never lost: switching embedder re-encodes (a few minutes), that's all.`);
}

// Resolves the choice → providerKey ∈ {in-process, gemini, openai-compatible, ollama}
// + collects the secrets (never as an argument: entered here, written to .env).
let providerKey;
let providerDetails = {};
let geminiKey = "";
let apiKey = "";

if (interactive) {
  printEmbedderEducation();
  console.log(`\n${c.B}Which embedding engine?${c.X}`);
  for (const o of options) {
    const lbl = EMBEDDER_LABELS[o.key];
    const star = o.recommended ? `  ${c.G}⭐ recommended for your machine${c.X}` : "";
    console.log(`  ${c.B}${o.num}.${c.X} ${lbl.title}${star}`);
    console.log(`     ${c.C}↳ ${lbl.hint}${c.X}`);
  }
  const pick = await ask(`Your choice`, String(recoOption.num));
  const chosen = options.find((o) => String(o.num) === pick.trim()) ?? recoOption;

  if (chosen.key === "in-process") {
    providerKey = "in-process";
  } else if (chosen.key === "ollama") {
    providerKey = "ollama";
    providerDetails.model = await ask("  Ollama model (already pulled)", "embeddinggemma");
    providerDetails.dimension = await ask("  Model dimension", "768");
  } else {
    // "API key" option → sub-choice Gemini (simple) or OpenAI-compatible endpoint.
    const sub = await ask(
      "  a) Gemini key (simple)   b) OpenAI-compatible endpoint (OpenAI / Azure / company)",
      "a",
    );
    if (/^b/i.test(sub)) {
      providerKey = "openai-compatible";
      providerDetails.baseURL = await ask("  Base URL (e.g. https://api.openai.com/v1)");
      providerDetails.model = await ask("  Model name (e.g. text-embedding-3-small)");
      providerDetails.dimension = await ask("  Model dimension (e.g. 1536)");
      apiKey = await ask("  API key (Enter if the endpoint doesn't require one)");
    } else {
      providerKey = "gemini";
      // "free ≠ private" framing BEFORE asking for the key (ADR 0007 requirement).
      console.log(
        `\n  ${c.Y}⚠️ "free ≠ private"${c.X}: with a Gemini key, the text of your notes is sent to Google.`,
      );
      console.log(`     • ${c.B}FREE${c.X} tier → ⚠️ Google may exploit your data (avoid for a confidential vault).`);
      console.log(`     • ${c.B}PAID${c.X} tier → a few tens of cents/month, and that is what guarantees non-exploitation.`);
      console.log(`     ${c.C}Going paid = privacy. For truly-nothing-leaves free: pick option 1.${c.X}`);
      console.log(`     Free key: ${c.C}https://aistudio.google.com/apikey${c.X}`);
      geminiKey = await ask("  Paste your Gemini key (or Enter to configure later)");
    }
  }
} else {
  // Non-interactive (Claude-driven install): --embedder flag, otherwise machine reco.
  // Values accepted without input: in-process | gemini | ollama (the OpenAI endpoint
  // requires URL/model/key → reserved for interactive mode or a manual .env config).
  const fallback = recommendedEmbedderKey(machine) === "in-process" ? "in-process" : "gemini";
  const chosen = (cli.embedder ?? fallback) === "api" ? "gemini" : cli.embedder ?? fallback;
  if (!["in-process", "gemini", "ollama"].includes(chosen)) {
    err(
      `--embedder "${chosen}" not supported in non-interactive mode (values: in-process | gemini | ollama). ` +
        "For an OpenAI/company endpoint, configure EMBEDDING_* in .env after the install.",
    );
    process.exit(1);
  }
  providerKey = chosen;
  warn(`Non-interactive mode — embedder: ${providerKey}${cli.embedder ? "" : " (machine reco)"}.`);
}

const embedderCfg = envConfigForEmbedder(providerKey, providerDetails);
const providerLines = embedderCfg.lines;
ok(`embedder selected: ${c.B}${providerKey}${c.X}${embedderCfg.needsGeminiKey ? " (Gemini key)" : " (no Gemini key)"}`);

// ── 4. File generation ──────────────────────────────────────────────────────
step("4/9 · Generating customized files");
const replacements = {
  // {{NODE}} = prefix of the hook commands (cf. .claude/settings.json.template).
  // Points to the self-heal launcher run-node.* (generated below) instead of `node`
  // directly: the desktop app launches the hooks with a minimal PATH where a node
  // installed via nvm/Homebrew is not found → silent hooks (including auto-commit).
  // The brain path is already baked in, so it does NOT contain {{PROJECT_ROOT}}
  // (no dependency on the order of the substitutions below).
  "{{NODE}}": nodeHookCommand(process.platform, toPosix(TARGET)),
  "{{PROJECT_ROOT}}": toPosix(TARGET),
  "{{PROJECT_NAME}}": projectName,
  "{{OWNER_NAME}}": ownerName,
  "{{LANGUAGE}}": language,
  "{{TMP_DIR}}": toPosix(tmpdir()),
  "{{SOURCE_1}}": "(your source)",
};
// `canOverwrite(existingContent)` (optional): if the file already exists but
// this predicate returns true, we regenerate it (the CLAUDE.md "bootstrap stub" case).
function gen(tpl, out, canOverwrite) {
  if (existsSync(out)) {
    if (!(canOverwrite && canOverwrite(readFileSync(out, "utf8")))) {
      warn(`${out} already exists — left as-is (delete it to regenerate).`);
      return;
    }
    warn(`${out} was a bootstrap stub — replaced with your customized version.`);
  }
  let content = readFileSync(tpl, "utf8");
  for (const [k, v] of Object.entries(replacements)) content = content.split(k).join(v);
  writeFileSync(out, content);
  ok(`generated: ${out}`);
}
// The templates were copied into TARGET: we read them there and write alongside.
// The copied CLAUDE.md is the bootstrap stub → isInstallerStub gets it replaced by
// the customized constitution. .mcp.json / settings.json are gitignored (so
// absent from the copy) → gen writes them from scratch.
gen(join(TARGET, "CLAUDE.md.template"), join(TARGET, "CLAUDE.md"), isInstallerStub);
gen(join(TARGET, ".mcp.json.template"), join(TARGET, ".mcp.json"));
gen(join(TARGET, ".claude", "settings.json.template"), join(TARGET, ".claude", "settings.json"));

// Self-heal launchers for the RAG server (cf. scripts/lib/rag-launcher.mjs): the
// desktop app launches the MCPs with a minimal PATH → we add the usual node
// locations before starting the server. .mcp.json (gitignored, per-machine) points
// to the launcher suited to the current OS.
writeFileSync(join(TARGET, "rag", "launch.sh"), buildShLauncher());
writeFileSync(join(TARGET, "rag", "launch.cmd"), buildCmdLauncher());
{
  const mcpPath = join(TARGET, ".mcp.json");
  const mcp = applyRagLauncher(JSON.parse(readFileSync(mcpPath, "utf8")), process.platform);
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
  ok("self-heal RAG launchers generated (launch.sh + launch.cmd), .mcp.json adapted to the OS");
}

// Self-heal node launchers FOR THE HOOKS (same root cause as the RAG: minimal
// PATH of the desktop app → node via nvm/Homebrew not found → silent hooks, including
// auto-commit). settings.json (generated above) calls these launchers via {{NODE}}
// instead of `node` directly. Same source of truth as the RAG: scripts/lib/rag-launcher.mjs.
const runNodeSh = join(TARGET, "scripts", "run-node.sh");
mkdirSync(dirname(runNodeSh), { recursive: true });
writeFileSync(runNodeSh, buildNodeRunnerSh());
writeFileSync(join(TARGET, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
ok("self-heal node launchers for the hooks generated (run-node.sh + run-node.cmd)");

// Smoke-test of the launcher (the "the script judges itself" principle). PROOF UNDER
// REAL CONDITIONS: we run run-node with an IMPOVERISHED PATH (minimalPathEnv) like the
// desktop app — otherwise the test would inherit the rich PATH of the install shell (node
// always findable) and would answer "does node exist somewhere?" instead of "does the
// wrapper, ALONE, find node on a minimal PATH?" (a near-false-positive). If run-node fails
// here, the hooks would stay silent at runtime → LOUD install failure, not a warning.
{
  const runner =
    process.platform === "win32"
      ? { command: "cmd", args: ["/c", join(TARGET, "scripts", "run-node.cmd")] }
      : { command: "/bin/sh", args: [runNodeSh] };
  const smoke = run(runner.command, [...runner.args, "-e", "process.exit(0)"], {
    cwd: TARGET,
    env: minimalPathEnv(process.platform, process.env),
  });
  if (smoke.ok) ok("run-node smoke-test OK — node resolved by the launcher even on an impoverished PATH");
  else {
    err(
      "run-node did not find node on an impoverished PATH (real conditions of the desktop app) → " +
        "the hooks would be silent at runtime (auto-commit broken). Your node is probably in " +
        "an UNUSUAL location. The self-heal covers: /usr/bin, /usr/local/bin, " +
        "/opt/homebrew/bin, asdf, nvm, volta, nodenv, fnm (and on Windows: nodejs, npm, Volta, " +
        "NVM_SYMLINK). Add your location to scripts/lib/rag-launcher.mjs (pathPrependSh/Cmd) " +
        "or report the case. Details:\n" + smoke.out,
    );
    process.exit(1);
  }
}

// .env
if (!existsSync(envPath)) {
  copyFileSync(join(TARGET, ".env.example"), envPath);
  ok("generated: .env (from .env.example)");
}
// Replaces an existing `KEY=…` line, otherwise appends it at the end of the file.
function setEnvVar(env, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(env) ? env.replace(re, `${key}=${value}`) : `${env}\n${key}=${value}\n`;
}
{
  let env = readFileSync(envPath, "utf8");
  // Embedder selection lines (EMBEDDING_PROVIDER…): written EXCEPT for native
  // Gemini (default provider, no line to set → `providerLines` empty).
  for (const line of providerLines) {
    const [k, ...rest] = line.split("=");
    env = setEnvVar(env, k, rest.join("="));
  }
  if (geminiKey) env = setEnvVar(env, "GOOGLE_GEMINI_API_KEY", geminiKey);
  if (apiKey) env = setEnvVar(env, "EMBEDDING_API_KEY", apiKey);
  writeFileSync(envPath, env);
  if (providerLines.length) ok(`embedder configured in .env (${providerKey})`);
  if (geminiKey) ok("Gemini key saved in .env");
  if (apiKey) ok("endpoint API key saved in .env");
}

// Git repo OF THE BRAIN — foundation of auto-commit. NEW folder → `git init`
// always, no conditional, no remote, no deletion. No link to the launcher by
// construction (we copied the tracked files, never the launcher's .git). The
// leak protection comes from the hook's opt-in push (secondbrain.autopush).
run("git", ["init", "-q"], { cwd: TARGET });
// Main branch = `main` (never `master`, too historically loaded).
// `symbolic-ref` is portable across all git versions (unlike
// `git init -b main`, ≥ 2.28) and points HEAD at main BEFORE the first commit,
// so the entire history is born on `main` — no after-the-fact rename.
run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: TARGET });
run("git", ["add", "-A"], { cwd: TARGET });
const commit = run(
  "git",
  ["commit", "-q", "-m", "chore: initialize the second brain"],
  { cwd: TARGET },
);
if (commit.ok) ok("local git repo ready (install commit)");
else warn("install commit failed (configure git user.name/email).");

// ── 5. External connectors (optional) ────────────────────────────────────────
// Offers to wire up external sources (Drive/Notion/Slack/Calendar…).
// "Generator" spirit: guided but not magical. For MCP connectors, we
// merge the server block into .mcp.json + the permissions into settings.json
// (idempotent — re-runnable without duplicates). For the native claude.ai ones, we
// touch nothing: we just point to the account's *Connectors*.
// Non-interactive (CI / stdin not a TTY) → step fully skipped.
step("5/9 · Wire up external sources (optional)");
if (interactive) {
  const want = await ask("Wire up external sources now? [y/N]", "N");
  if (/^y/i.test(want)) {
    const mcpPath = join(TARGET, ".mcp.json");
    const settingsPath = join(TARGET, ".claude", "settings.json");
    for (const conn of CONNECTORS) {
      for (const u of conn.useCases ?? []) console.log(`    ${c.C}· ${u}${c.X}`);
      const pick = await ask(`  • ${conn.label}? [y/N]`, "N");
      if (!/^y/i.test(pick)) continue;
      if (conn.kind === "mcp") {
        applyConnectorFiles(conn, { mcpPath, settingsPath });
        ok(`${conn.id} wired up → .mcp.json + permissions settings.json`);
      } else {
        warn(`${conn.id}: native claude.ai connector — nothing to write into .mcp.json.`);
      }
      console.log(`    ${c.C}↳ ${conn.credentialsHint}${c.X}`);
    }
  } else {
    warn("No connector wired up — you can do it later (SETUP §6).");
  }
} else {
  warn("Non-interactive input — connectors step skipped.");
}

// ── 6. Example notes (optional) ──────────────────────────────────────────────
// The vault ships with demo notes (tag `exemple`) so the 1st test works
// right away. Once you're ready to switch to your real notes, better to
// clear them: otherwise they pollute the RAG (answers citing fictional facts). We
// offer the purge HERE, before indexing, so the index stays clean.
// The machinery (vault/backlog/harness.md) and the docs (README) are preserved.
step("6/9 · Clean up the example notes (optional)");
const vaultDir = join(TARGET, "vault");
if (interactive) {
  const purge = await ask(
    "Clear the example notes? (keep them to test the 1st run) [y/N]",
    "N",
  );
  if (/^y/i.test(purge)) {
    const deleted = clearExampleNotes(vaultDir);
    ok(`${deleted.length} example note(s) deleted — vault ready for your real notes.`);
  } else {
    warn("Example notes kept (useful for the 1st test). Re-run the installer to clear them later.");
  }
} else {
  warn("Non-interactive input — example notes kept.");
}

if (rl) rl.close();

// ── 6. RAG engine install ────────────────────────────────────────────────────
step("7/9 · Installing the RAG engine (npm install)");
const rag = join(TARGET, "rag");
const install = run(NPM, ["install", "--silent"], { cwd: rag, stdio: "inherit" });
if (install.ok) ok("RAG dependencies installed");
else {
  err("npm install failed in rag/ — re-run: cd rag && npm install");
  process.exit(1);
}

// ── 7. Initial indexing (if the embedder is ready) ───────────────────────────
// "Ready" depends on the chosen embedder (cf. embedderReady): Gemini → key present;
// in-process → always (the weights download on 1st use, ~28 s once);
// OpenAI/Ollama endpoint → base URL provided. The fully-local option thus self-verifies
// right at install, with no key at all.
step("8/9 · Initial indexing of the example vault");
const envNow = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
const embedderIsReady = embedderReady(envNow);
if (embedderIsReady) {
  if (providerKey === "in-process") {
    console.log("  (1st time fully-local: downloading the model weights ~28 s, then offline.)");
  }
  const idx = run(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit" });
  if (idx.ok) ok("example vault indexed");
  else warn("Indexing interrupted (quota/key/endpoint?) — it will resume the next time Claude Code starts.");
} else if (embedderCfg.needsGeminiKey) {
  warn("No Gemini key → indexing deferred. Add the key in .env then: cd rag && npm run index");
} else {
  warn("Embedder not configured yet (.env) → indexing deferred. Complete .env then: cd rag && npm run index");
}

// ── 8. Post-flight — verify the brain answers FROM the vault ─────────────────
// "Loud failure" strategy: we don't try to prevent a broken install,
// we CATCH it. Two levels:
//   • structural — stdio handshake + `vault-rag` tools exposed (no key required).
//   • functional (probe) — if the key is there, we actually call search_vault with
//     the DEMO question and require a vault source to be cited ("vault/…"). That's
//     what distinguishes a real brain from one that would answer off-target (failure B).
// With key: a failing probe = LOUD FAIL + exit(1) BEFORE the success banner
// (no false green). Without key: structural only + demo check honestly deferred.
step("9/9 · Post-flight — does the brain answer from the vault?");
const EXPECT_TOOLS = ["search_vault", "get_document", "list_documents", "vault_stats"];
try {
  const mcp = JSON.parse(readFileSync(join(TARGET, ".mcp.json"), "utf8"));
  const srv = mcp.mcpServers?.["vault-rag"];
  if (!srv) {
    warn(".mcp.json without a \"vault-rag\" server — verification skipped.");
  } else {
    // npx/npm carry .cmd on Windows (cf. NPM above).
    const cmd =
      process.platform === "win32" && /^(npx|npm)$/.test(srv.command)
        ? `${srv.command}.cmd`
        : srv.command;
    const res = await smokeTestMcp({
      command: cmd,
      args: srv.args ?? [],
      cwd: srv.cwd ?? TARGET,
      expectTools: EXPECT_TOOLS,
      // In-process reloads an ONNX session in the smoke's MCP process → we
      // allow more headroom (the fallback stays 30 s for network embedders).
      timeoutMs: providerKey === "in-process" ? 60000 : 30000,
      // Functional probe only if the embedder is ready (otherwise search_vault
      // fails because the index doesn't exist yet — Gemini key absent, or endpoint
      // not configured). In-process: ready with no key → the canary runs.
      ...(embedderIsReady
        ? { probe: { tool: "search_vault", args: { query: DEMO }, expectText: DEMO_EXPECT } }
        : {}),
    });
    if (embedderIsReady) {
      if (res.ok) {
        ok("post-flight OK — the RAG finds a fact unfindable outside the vault (canary Pélagie de Mollecuisse).");
      } else {
        err(`POST-FLIGHT FAILURE — the brain does NOT answer from the vault: ${res.error ?? "unknown reason"}`);
        err("Refusing to declare the install successful (a brain that answers off the vault is worse than a broken one).");
        err("Troubleshooting: SETUP.md §8 (.env, index, MCP connection), then re-run the installer.");
        process.exit(1); // LOUD FAIL — before any success banner
      }
    } else {
      // Embedder not ready → we can't prove retrieval; structural only, KO = warn.
      if (res.ok) {
        ok(`MCP connection OK — ${res.tools.length} tools exposed (${EXPECT_TOOLS.join(", ")}).`);
      } else {
        warn(`MCP connection KO: ${res.error ?? "unknown reason"}`);
        warn("Claude Code might not see the vault. Troubleshooting: SETUP.md §8.");
      }
      if (embedderCfg.needsGeminiKey) {
        warn("Demo check DEFERRED (no key) — next step: paste your Gemini key into .env,");
      } else {
        warn("Demo check DEFERRED (embedder still to be configured) — complete .env,");
      }
      warn("then validate the RAG with:  node scripts/verify-rag.mjs  (loud verdict, sourced from the vault).");
    }
  }
} catch (e) {
  warn(`MCP verification impossible (${e.message}) — see SETUP.md §8.`);
}

// ── End ───────────────────────────────────────────────────────────────────────
console.log(`\n${c.B}${c.G}✓ Installation complete.${c.X}\n`);
console.log(`Your second brain was created in: ${c.C}${TARGET}${c.X}`);
// Key banner: only if the chosen embedder IS Gemini and the key is still
// missing (fully-local / endpoint option → no Gemini key to request).
const geminiKeyMissing = embedderCfg.needsGeminiKey && !geminiKey;
if (geminiKeyMissing) {
  console.log(
    `\n${c.B}⚠️ Gemini key not provided yet.${c.X} Before opening Claude Code, paste it into`
  );
  console.log(`   ${c.C}${toPosix(envPath)}${c.X} (line ${c.C}GOOGLE_GEMINI_API_KEY=${c.X}).`);
  console.log(
    `   If you open Claude Code first: paste the key then ask your question again (the server re-reads`
  );
  console.log(`   .env on its own); worst case, ${c.C}/mcp${c.X} to reconnect, or restart Claude Code.`);
}
console.log(`Next steps:`);
console.log(`  1. ${c.C}cd ${toPosix(TARGET)} && claude${c.X}   ← open Claude Code in the brain folder`);
console.log(`  2. Ask a question, e.g.:`);
console.log(`     ${c.C}"${DEMO}"${c.X}`);
console.log(`     → Claude answers from the vault, sources cited.`);
console.log(`  3. Replace the example notes with your own, edit ${c.C}CLAUDE.md${c.X} to suit you.`);
console.log(`\nFull docs: ${c.C}SETUP.md${c.X}`);

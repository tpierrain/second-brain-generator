#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// installer.mjs — installateur interactif du Second Brain Generator.
// Vérifie les prérequis, personnalise le harnais, installe le moteur RAG.
// Idempotent : peut être relancé sans casse.
//
// Multi-OS : pur Node (le seul prérequis runtime). Fonctionne en cmd /
// PowerShell (Windows) comme en bash/zsh (macOS/Linux). Aucune dépendance
// shell, jq, sqlite3 ni sed.
//
//   Usage :  node installer.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
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
import { parseAnswers, resolveTargetDir } from "./scripts/lib/installer-args.mjs";
import { parseLsFilesZ, filterCopyable } from "./scripts/lib/tracked-files.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  applyRagLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  nodeHookCommand,
  minimalPathEnv,
} from "./scripts/lib/rag-launcher.mjs";
import { DEMO_QUESTION as DEMO, DEMO_EXPECT } from "./scripts/lib/demo.mjs";
import {
  buildEmbedderOptions,
  recommendedEmbedderKey,
  envConfigForEmbedder,
  embedderReady,
} from "./scripts/lib/embedder-choice.mjs";

// ROOT = le LAUNCHER (ce dépôt cloné). Source en LECTURE SEULE, réutilisable :
// l'installeur n'y écrit JAMAIS. Il CRÉE ailleurs un dossier cerveau (TARGET),
// y copie les fichiers suivis, puis `git init` dedans → aucun lien vers le
// launcher par construction. Pas de process.chdir : tout passe par des chemins
// explicites (ROOT pour lire, TARGET pour écrire).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

// npm/npx portent une extension .cmd sur Windows ; node/git sont des .exe.
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

// Chemins injectés dans du JSON : on normalise en slashes « / » (valides sur
// Windows pour node/npx/cwd et sûrs en JSON, contrairement aux backslashes).
const toPosix = (p) => p.split("\\").join("/");

// ── Couleurs ────────────────────────────────────────────────────────────────
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

// DEMO (question canari) + DEMO_EXPECT : importés de scripts/lib/demo.mjs (source
// de vérité partagée avec verify-rag.mjs). Servent au probe du post-flight et au
// message de fin (« pose une question, ex. … »).

console.log(`${c.B}${c.C}`);
console.log(`  ╔══════════════════════════════════════════════╗`);
console.log(`  ║        Second Brain Generator — installeur   ║`);
console.log(`  ╚══════════════════════════════════════════════╝`);
console.log(c.X);

// Exécute une commande sans throw ; renvoie { out, ok }.
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

// ── 1. Prérequis ────────────────────────────────────────────────────────────
step("1/9 · Vérification des prérequis");
let missing = false;

// Node : on tourne déjà dedans, version lisible directement.
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 18) {
  ok(`node trouvé (v${process.versions.node})`);
} else {
  err(`Node ${nodeMajor} trop ancien — il faut Node ≥ 18 : https://nodejs.org`);
  missing = true;
}

const git = run("git", ["--version"]);
if (git.ok) ok(`git trouvé (${git.out.trim()})`);
else {
  err("git manquant — installe-le : https://git-scm.com");
  missing = true;
}

const npm = run(NPM, ["--version"]);
if (npm.ok) ok(`npm trouvé (v${npm.out.trim()})`);
else {
  err("npm manquant — fourni avec Node.js : https://nodejs.org");
  missing = true;
}

if (missing) {
  err("Prérequis manquants — corrige les points ci-dessus puis relance : node installer.mjs");
  process.exit(1);
}

// ── 2. Personnalisation ─────────────────────────────────────────────────────
step("2/9 · Personnalisation du harnais");

const gitUser = run("git", ["config", "user.name"]).out.trim();

// Réponses pilotables sans clavier : flags CLI > variables d'env > défauts.
// Sert au flux « onboarding piloté par Claude » (cf. CLAUDE.md amorce) : Claude
// récolte les réponses en chat puis appelle UNE commande --non-interactive.
// La clé Gemini n'est JAMAIS un argument (sécurité) — toujours différée en .env.
const cli = parseAnswers(process.argv.slice(2), process.env, {
  projectName: "second-brain",
  ownerName: gitUser,
  language: "français",
  destParent: undefined,
});

// Interactif seulement si vrai TTY ET pas de --non-interactive demandé.
const interactive = stdin.isTTY && !cli.nonInteractive;
const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

async function ask(prompt, def = "") {
  if (!rl) return def;
  const suffix = def ? ` ${c.C}[${def}]${c.X} : ` : " : ";
  const ans = (await rl.question(`${prompt}${suffix}`)).trim();
  return ans || def;
}

let projectName, ownerName, language, destParent;
if (interactive) {
  // Prompts pré-remplis avec les réponses CLI/env (ou les défauts) comme valeur proposée.
  projectName = await ask("Nom du cerveau (dossier à créer)", cli.projectName);
  destParent = await ask("Emplacement (dossier parent)", cli.destParent ?? homedir());
  ownerName = await ask("Ton nom", cli.ownerName);
  language = await ask("Langue par défaut des notes", cli.language);
} else {
  warn("Mode non interactif — réponses prises des flags/env (ou défauts).");
  projectName = cli.projectName;
  ownerName = cli.ownerName;
  language = cli.language;
  destParent = cli.destParent;
}

// ── Résolution du dossier cerveau (TARGET) ───────────────────────────────────
// On REFUSE une cible existante (garantit que c'est bien l'installeur qui crée
// le dossier — pas de greffe dans un dossier déjà peuplé), puis on la crée et on
// y copie les fichiers SUIVIS du launcher (git ls-files -z, en Node pur → gère
// espaces/accents, multi-OS). Le launcher (ROOT) reste intact.
const TARGET = resolveTargetDir({ name: projectName, destParent, home: homedir() });
if (existsSync(TARGET)) {
  err(`Le dossier cible existe déjà : ${TARGET}`);
  err("Choisis un autre nom (--name) ou emplacement (--dest), ou supprime-le, puis relance.");
  process.exit(1);
}
mkdirSync(TARGET, { recursive: true });

const lsFiles = run("git", ["-C", ROOT, "ls-files", "-z"]);
if (!lsFiles.ok) {
  err("Impossible de lister les fichiers du launcher (git ls-files) — le launcher est-il un dépôt git ?");
  process.exit(1);
}
const tracked = filterCopyable(parseLsFilesZ(lsFiles.out));
for (const rel of tracked) {
  const dst = join(TARGET, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(ROOT, rel), dst);
}
ok(`dossier cerveau créé : ${TARGET} (${tracked.length} fichiers copiés depuis le launcher)`);

// ── 3. Moteur d'embedding (privé local / clé d'API) ──────────────────────────
// Décision D1 (ADR 0007) : choix explicite à 3, reco ADAPTATIVE selon la machine.
// On ne FORCE plus la clé Gemini : elle n'est demandée que si l'utilisateur choisit
// l'option « clé d'API + Gemini ». Le reste écrit EMBEDDING_PROVIDER dans .env.
step("3/9 · Moteur d'embedding du RAG (le choix de confidentialité)");
const envPath = join(TARGET, ".env");

// Libellés du menu (réutilisent les artefacts pédagogiques validés — ADR 0007).
const EMBEDDER_LABELS = {
  "in-process": {
    title: "Tout sur ta machine, rien à installer (« Gemma inside »)",
    hint: "🟢 privé + gratuit + offline. ~1,5 Go RAM au repos, jusqu'à ~6 Go en indexation (16 Go+ conseillé). Apple Silicon / Windows.",
  },
  api: {
    title: "Avec une clé d'API (Gemini, OpenAI, ou l'endpoint de ton entreprise)",
    hint: "🟡 léger pour la machine, mais tes notes transitent par le fournisseur — « gratuit ≠ privé » (voir ci-dessous).",
  },
  ollama: {
    title: "Local via Ollama (avancé)",
    hint: "🟢 rien ne sort non plus, mais une app séparée à installer + un modèle à télécharger.",
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
  `Machine détectée : ${c.C}${ramGo} Go de RAM, ${machine.platform}/${machine.arch}${c.X}` +
    (machine.platform === "darwin" && machine.arch === "x64"
      ? ` ${c.Y}(Mac Intel → option « tout-local » indisponible)${c.X}`
      : ""),
);

// Pédagogie (interactif) : l'embedder ≠ un LLM de chat + l'échelle de confidentialité.
function printEmbedderEducation() {
  console.log(`\n${c.B}Repère utile :${c.X} l'embedder n'est PAS « ChatGPT chez toi ».`);
  console.log(
    "  C'est un petit modèle qui transforme tes notes en vecteurs pour la recherche —",
  );
  console.log("  léger (≈ quelques centaines de Mo), pas un gros LLM. Le LLM qui RÉPOND reste Claude.");
  console.log(`\n${c.B}Échelle de confidentialité :${c.X}`);
  console.log("  🟢 tout-local (option 1/3) — rien ne sort de ta machine. Gratuit, privacy max.");
  console.log("  🟡 clé d'API payante / endpoint entreprise — sort, mais 0 entraînement (contractuel).");
  console.log("  🔴 clé d'API GRATUITE (Gemini gratuit inclus) — souvent exploitée. Payer ≈ rend privé.");
  console.log(`\n${c.B}Et tes notes ?${c.X} jamais perdues : changer d'embedder ré-encode (quelques minutes), c'est tout.`);
}

// Résout le choix → providerKey ∈ {in-process, gemini, openai-compatible, ollama}
// + collecte les secrets (jamais en argument : saisis ici, écrits dans .env).
let providerKey;
let providerDetails = {};
let geminiKey = "";
let apiKey = "";

if (interactive) {
  printEmbedderEducation();
  console.log(`\n${c.B}Quel moteur d'embedding ?${c.X}`);
  for (const o of options) {
    const lbl = EMBEDDER_LABELS[o.key];
    const star = o.recommended ? `  ${c.G}⭐ recommandé pour ta machine${c.X}` : "";
    console.log(`  ${c.B}${o.num}.${c.X} ${lbl.title}${star}`);
    console.log(`     ${c.C}↳ ${lbl.hint}${c.X}`);
  }
  const pick = await ask(`Ton choix`, String(recoOption.num));
  const chosen = options.find((o) => String(o.num) === pick.trim()) ?? recoOption;

  if (chosen.key === "in-process") {
    providerKey = "in-process";
  } else if (chosen.key === "ollama") {
    providerKey = "ollama";
    providerDetails.model = await ask("  Modèle Ollama (déjà pull)", "embeddinggemma");
    providerDetails.dimension = await ask("  Dimension du modèle", "768");
  } else {
    // Option « clé d'API » → sous-choix Gemini (simple) ou endpoint compatible-OpenAI.
    const sub = await ask(
      "  a) clé Gemini (simple)   b) endpoint compatible-OpenAI (OpenAI / Azure / entreprise)",
      "a",
    );
    if (/^b/i.test(sub)) {
      providerKey = "openai-compatible";
      providerDetails.baseURL = await ask("  URL de base (ex. https://api.openai.com/v1)");
      providerDetails.model = await ask("  Nom du modèle (ex. text-embedding-3-small)");
      providerDetails.dimension = await ask("  Dimension du modèle (ex. 1536)");
      apiKey = await ask("  Clé d'API (Entrée si l'endpoint n'en exige pas)");
    } else {
      providerKey = "gemini";
      // Cadrage « gratuit ≠ privé » AVANT de demander la clé (exigence ADR 0007).
      console.log(
        `\n  ${c.Y}⚠️ « gratuit ≠ privé »${c.X} : avec une clé Gemini, le texte de tes notes est envoyé à Google.`,
      );
      console.log(`     • palier ${c.B}GRATUIT${c.X} → ⚠️ Google peut exploiter tes données (à éviter pour un vault confidentiel).`);
      console.log(`     • palier ${c.B}PAYANT${c.X} → quelques dizaines de centimes/mois, et c'est ce qui garantit la non-exploitation.`);
      console.log(`     ${c.C}Le passage payant = la confidentialité. Pour du vraiment-rien-ne-sort gratuit : choisis l'option 1.${c.X}`);
      console.log(`     Clé gratuite : ${c.C}https://aistudio.google.com/apikey${c.X}`);
      geminiKey = await ask("  Colle ta clé Gemini (ou Entrée pour configurer plus tard)");
    }
  }
} else {
  // Non-interactif (install pilotée par Claude) : flag --embedder, sinon reco machine.
  // Valeurs acceptées sans saisie : in-process | gemini | ollama (l'endpoint OpenAI
  // exige URL/modèle/clé → réservé à l'interactif ou à une config .env manuelle).
  const fallback = recommendedEmbedderKey(machine) === "in-process" ? "in-process" : "gemini";
  const chosen = (cli.embedder ?? fallback) === "api" ? "gemini" : cli.embedder ?? fallback;
  if (!["in-process", "gemini", "ollama"].includes(chosen)) {
    err(
      `--embedder « ${chosen} » non géré en non-interactif (valeurs : in-process | gemini | ollama). ` +
        "Pour un endpoint OpenAI/entreprise, configure EMBEDDING_* dans .env après l'install.",
    );
    process.exit(1);
  }
  providerKey = chosen;
  warn(`Mode non interactif — embedder : ${providerKey}${cli.embedder ? "" : " (reco machine)"}.`);
}

const embedderCfg = envConfigForEmbedder(providerKey, providerDetails);
const providerLines = embedderCfg.lines;
ok(`embedder retenu : ${c.B}${providerKey}${c.X}${embedderCfg.needsGeminiKey ? " (clé Gemini)" : " (sans clé Gemini)"}`);

// ── 4. Génération des fichiers ──────────────────────────────────────────────
step("4/9 · Génération des fichiers personnalisés");
const replacements = {
  // {{NODE}} = préfixe des commandes de hook (cf. .claude/settings.json.template).
  // Pointe vers le lanceur self-heal run-node.* (généré plus bas) au lieu de `node`
  // en direct : l'app desktop lance les hooks avec un PATH minimal où un node
  // installé via nvm/Homebrew est introuvable → hooks muets (dont l'auto-commit).
  // Le chemin du cerveau y est déjà baké, donc ne contient PAS {{PROJECT_ROOT}}
  // (aucune dépendance à l'ordre des substitutions ci-dessous).
  "{{NODE}}": nodeHookCommand(process.platform, toPosix(TARGET)),
  "{{PROJECT_ROOT}}": toPosix(TARGET),
  "{{PROJECT_NAME}}": projectName,
  "{{OWNER_NAME}}": ownerName,
  "{{LANGUAGE}}": language,
  "{{TMP_DIR}}": toPosix(tmpdir()),
  "{{SOURCE_1}}": "(ta source)",
};
// `canOverwrite(existingContent)` (optionnel) : si le fichier existe déjà mais
// que ce prédicat renvoie vrai, on le régénère (cas du CLAUDE.md « amorce »).
function gen(tpl, out, canOverwrite) {
  if (existsSync(out)) {
    if (!(canOverwrite && canOverwrite(readFileSync(out, "utf8")))) {
      warn(`${out} existe déjà — laissé tel quel (supprime-le pour régénérer).`);
      return;
    }
    warn(`${out} était une amorce — remplacé par ta version personnalisée.`);
  }
  let content = readFileSync(tpl, "utf8");
  for (const [k, v] of Object.entries(replacements)) content = content.split(k).join(v);
  writeFileSync(out, content);
  ok(`généré : ${out}`);
}
// Les templates ont été copiés dans TARGET : on les lit là et on écrit à côté.
// Le CLAUDE.md copié est l'amorce (stub) → isInstallerStub la fait remplacer par
// la constitution personnalisée. .mcp.json / settings.json sont gitignorés (donc
// absents de la copie) → gen les écrit à neuf.
gen(join(TARGET, "CLAUDE.md.template"), join(TARGET, "CLAUDE.md"), isInstallerStub);
gen(join(TARGET, ".mcp.json.template"), join(TARGET, ".mcp.json"));
gen(join(TARGET, ".claude", "settings.json.template"), join(TARGET, ".claude", "settings.json"));

// Lanceurs self-heal du serveur RAG (cf. scripts/lib/rag-launcher.mjs) : l'app
// desktop lance les MCP avec un PATH minimal → on rajoute les emplacements node
// usuels avant de démarrer le serveur. .mcp.json (gitignoré, par-machine) pointe
// vers le lanceur adapté à l'OS courant.
writeFileSync(join(TARGET, "rag", "launch.sh"), buildShLauncher());
writeFileSync(join(TARGET, "rag", "launch.cmd"), buildCmdLauncher());
{
  const mcpPath = join(TARGET, ".mcp.json");
  const mcp = applyRagLauncher(JSON.parse(readFileSync(mcpPath, "utf8")), process.platform);
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
  ok("lanceurs RAG self-heal générés (launch.sh + launch.cmd), .mcp.json adapté à l'OS");
}

// Lanceurs self-heal de node POUR LES HOOKS (même cause racine que le RAG : PATH
// minimal de l'app desktop → node via nvm/Homebrew introuvable → hooks muets, dont
// l'auto-commit). settings.json (généré ci-dessus) appelle ces lanceurs via {{NODE}}
// au lieu de `node` en direct. Même source de vérité que le RAG : scripts/lib/rag-launcher.mjs.
const runNodeSh = join(TARGET, "scripts", "run-node.sh");
mkdirSync(dirname(runNodeSh), { recursive: true });
writeFileSync(runNodeSh, buildNodeRunnerSh());
writeFileSync(join(TARGET, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
ok("lanceurs self-heal node pour les hooks générés (run-node.sh + run-node.cmd)");

// Smoke-test du lanceur (principe « le script juge lui-même »). PREUVE EN CONDITIONS
// RÉELLES : on lance run-node avec un PATH APPAUVRI (minimalPathEnv) façon app desktop
// — sinon le test hériterait du PATH riche du shell d'install (node toujours trouvable)
// et répondrait à « node existe quelque part ? » au lieu de « le wrapper, SEUL,
// retrouve-t-il node en PATH minimal ? » (quasi-faux-positif). Si run-node échoue ici,
// les hooks resteront muets au runtime → échec d'install BRUYANT, pas un warning.
{
  const runner =
    process.platform === "win32"
      ? { command: "cmd", args: ["/c", join(TARGET, "scripts", "run-node.cmd")] }
      : { command: "/bin/sh", args: [runNodeSh] };
  const smoke = run(runner.command, [...runner.args, "-e", "process.exit(0)"], {
    cwd: TARGET,
    env: minimalPathEnv(process.platform, process.env),
  });
  if (smoke.ok) ok("smoke-test run-node OK — node résolu par le lanceur même en PATH appauvri");
  else {
    err(
      "run-node n'a pas retrouvé node en PATH appauvri (conditions réelles de l'app desktop) → " +
        "les hooks seraient muets au runtime (auto-commit cassé). Ton node est probablement dans " +
        "un emplacement INHABITUEL. Le self-heal couvre : /usr/bin, /usr/local/bin, " +
        "/opt/homebrew/bin, asdf, nvm, volta, nodenv, fnm (et côté Windows : nodejs, npm, Volta, " +
        "NVM_SYMLINK). Ajoute ton emplacement à scripts/lib/rag-launcher.mjs (pathPrependSh/Cmd) " +
        "ou signale le cas. Détail :\n" + smoke.out,
    );
    process.exit(1);
  }
}

// .env
if (!existsSync(envPath)) {
  copyFileSync(join(TARGET, ".env.example"), envPath);
  ok("généré : .env (depuis .env.example)");
}
// Remplace une ligne `KEY=…` existante, sinon l'ajoute en fin de fichier.
function setEnvVar(env, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(env) ? env.replace(re, `${key}=${value}`) : `${env}\n${key}=${value}\n`;
}
{
  let env = readFileSync(envPath, "utf8");
  // Lignes de sélection d'embedder (EMBEDDING_PROVIDER…) : écrites SAUF pour Gemini
  // natif (provider par défaut, aucune ligne à poser → `providerLines` vide).
  for (const line of providerLines) {
    const [k, ...rest] = line.split("=");
    env = setEnvVar(env, k, rest.join("="));
  }
  if (geminiKey) env = setEnvVar(env, "GOOGLE_GEMINI_API_KEY", geminiKey);
  if (apiKey) env = setEnvVar(env, "EMBEDDING_API_KEY", apiKey);
  writeFileSync(envPath, env);
  if (providerLines.length) ok(`embedder configuré dans .env (${providerKey})`);
  if (geminiKey) ok("clé Gemini enregistrée dans .env");
  if (apiKey) ok("clé d'API endpoint enregistrée dans .env");
}

// Dépôt git DU CERVEAU — socle de l'auto-commit. Dossier NEUF → `git init`
// systématique, aucun conditionnel, aucun remote, aucune suppression. Aucun lien
// vers le launcher par construction (on a copié les fichiers suivis, jamais le
// .git du launcher). L'anti-fuite vient du push opt-in du hook (secondbrain.autopush).
run("git", ["init", "-q"], { cwd: TARGET });
// Branche principale = `main` (jamais `master`, trop connoté historiquement).
// `symbolic-ref` est portable sur toutes les versions de git (contrairement à
// `git init -b main`, ≥ 2.28) et pointe HEAD sur main AVANT le premier commit,
// donc l'historique entier naît sur `main` — pas de rename a posteriori.
run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: TARGET });
run("git", ["add", "-A"], { cwd: TARGET });
const commit = run(
  "git",
  ["commit", "-q", "-m", "chore: initialisation du second cerveau"],
  { cwd: TARGET },
);
if (commit.ok) ok("dépôt git local prêt (commit d'installation)");
else warn("commit d'installation impossible (configure git user.name/email).");

// ── 5. Connecteurs externes (optionnel) ─────────────────────────────────────
// Propose de brancher des sources externes (Drive/Notion/Slack/Calendar…).
// Esprit « générateur » : guidé mais pas magique. Pour les connecteurs MCP, on
// fusionne le bloc serveur dans .mcp.json + les permissions dans settings.json
// (idempotent — relançable sans doublon). Pour les natifs claude.ai, on ne
// touche à rien : on pointe juste vers les *Connectors* du compte.
// Non interactif (CI / stdin non-TTY) → étape entièrement ignorée.
step("5/9 · Brancher des sources externes (optionnel)");
if (interactive) {
  const want = await ask("Brancher des sources externes maintenant ? [o/N]", "N");
  if (/^o/i.test(want)) {
    const mcpPath = join(TARGET, ".mcp.json");
    const settingsPath = join(TARGET, ".claude", "settings.json");
    for (const conn of CONNECTORS) {
      for (const u of conn.useCases ?? []) console.log(`    ${c.C}· ${u}${c.X}`);
      const pick = await ask(`  • ${conn.label} ? [o/N]`, "N");
      if (!/^o/i.test(pick)) continue;
      if (conn.kind === "mcp") {
        applyConnectorFiles(conn, { mcpPath, settingsPath });
        ok(`${conn.id} branché → .mcp.json + permissions settings.json`);
      } else {
        warn(`${conn.id} : connecteur natif claude.ai — rien à écrire dans .mcp.json.`);
      }
      console.log(`    ${c.C}↳ ${conn.credentialsHint}${c.X}`);
    }
  } else {
    warn("Aucun connecteur branché — tu pourras le faire plus tard (SETUP §6).");
  }
} else {
  warn("Entrée non interactive — étape connecteurs ignorée.");
}

// ── 6. Notes d'exemple (optionnel) ──────────────────────────────────────────
// Le vault est livré avec des notes de démo (tag `exemple`) pour que le 1er test
// fonctionne d'emblée. Une fois prêt à passer à tes vraies notes, mieux vaut les
// vider : sinon elles polluent le RAG (réponses citant des faits fictifs). On
// propose la purge ICI, avant l'indexation, pour que l'index reste propre.
// La machinerie (vault/backlog/harnais.md) et la doc (README) sont préservées.
step("6/9 · Nettoyer les notes d'exemple (optionnel)");
const vaultDir = join(TARGET, "vault");
if (interactive) {
  const purge = await ask(
    "Vider les notes d'exemple ? (garde-les pour tester le 1er run) [o/N]",
    "N",
  );
  if (/^o/i.test(purge)) {
    const deleted = clearExampleNotes(vaultDir);
    ok(`${deleted.length} note(s) d'exemple supprimée(s) — vault prêt pour tes vraies notes.`);
  } else {
    warn("Notes d'exemple conservées (utiles pour le 1er test). Relance l'installeur pour les vider plus tard.");
  }
} else {
  warn("Entrée non interactive — notes d'exemple conservées.");
}

if (rl) rl.close();

// ── 6. Installation du moteur RAG ───────────────────────────────────────────
step("7/9 · Installation du moteur RAG (npm install)");
const rag = join(TARGET, "rag");
const install = run(NPM, ["install", "--silent"], { cwd: rag, stdio: "inherit" });
if (install.ok) ok("dépendances RAG installées");
else {
  err("npm install a échoué dans rag/ — relance : cd rag && npm install");
  process.exit(1);
}

// ── 7. Indexation initiale (si l'embedder est prêt) ──────────────────────────
// « Prêt » dépend de l'embedder choisi (cf. embedderReady) : Gemini → clé présente ;
// in-process → toujours (les poids se téléchargent au 1er usage, ~28 s une fois) ;
// endpoint OpenAI/Ollama → base URL renseignée. L'option tout-local s'auto-vérifie
// donc dès l'install, sans aucune clé.
step("8/9 · Indexation initiale du vault d'exemple");
const envNow = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
const embedderIsReady = embedderReady(envNow);
if (embedderIsReady) {
  if (providerKey === "in-process") {
    console.log("  (1ʳᵉ fois en tout-local : téléchargement des poids du modèle ~28 s, puis offline.)");
  }
  const idx = run(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit" });
  if (idx.ok) ok("vault d'exemple indexé");
  else warn("Indexation interrompue (quota/clé/endpoint ?) — elle reprendra au prochain démarrage de Claude Code.");
} else if (embedderCfg.needsGeminiKey) {
  warn("Pas de clé Gemini → indexation reportée. Ajoute la clé dans .env puis : cd rag && npm run index");
} else {
  warn("Embedder pas encore configuré (.env) → indexation reportée. Complète .env puis : cd rag && npm run index");
}

// ── 8. Post-flight — vérification que le cerveau répond DEPUIS le vault ───────
// Stratégie « échec bruyant » : on n'essaie pas de prévenir une install cassée,
// on l'ATTRAPE. Deux niveaux :
//   • structurel — handshake stdio + outils `vault-rag` exposés (pas de clé requise).
//   • fonctionnel (probe) — si la clé est là, on appelle vraiment search_vault avec
//     la question de DÉMO et on exige une source du vault citée (« vault/… »). C'est
//     ce qui distingue un vrai cerveau d'un cerveau qui répondrait à côté (panne B).
// Avec clé : un probe en échec = FAIL BRUYANT + exit(1) AVANT la bannière succès
// (pas de faux vert). Sans clé : structurel seul + check démo honnêtement reporté.
step("9/9 · Post-flight — le cerveau répond-il depuis le vault ?");
const EXPECT_TOOLS = ["search_vault", "get_document", "list_documents", "vault_stats"];
try {
  const mcp = JSON.parse(readFileSync(join(TARGET, ".mcp.json"), "utf8"));
  const srv = mcp.mcpServers?.["vault-rag"];
  if (!srv) {
    warn(".mcp.json sans serveur « vault-rag » — vérification ignorée.");
  } else {
    // npx/npm portent .cmd sur Windows (cf. NPM ci-dessus).
    const cmd =
      process.platform === "win32" && /^(npx|npm)$/.test(srv.command)
        ? `${srv.command}.cmd`
        : srv.command;
    const res = await smokeTestMcp({
      command: cmd,
      args: srv.args ?? [],
      cwd: srv.cwd ?? TARGET,
      expectTools: EXPECT_TOOLS,
      // L'in-process recharge une session ONNX dans le process MCP du smoke → on
      // laisse plus de marge (le repli reste 30 s pour les embedders réseau).
      timeoutMs: providerKey === "in-process" ? 60000 : 30000,
      // Probe fonctionnel uniquement si l'embedder est prêt (sinon search_vault
      // échoue car l'index n'existe pas encore — clé Gemini absente, ou endpoint
      // non configuré). En in-process : prêt sans aucune clé → le canari tourne.
      ...(embedderIsReady
        ? { probe: { tool: "search_vault", args: { query: DEMO }, expectText: DEMO_EXPECT } }
        : {}),
    });
    if (embedderIsReady) {
      if (res.ok) {
        ok("post-flight OK — le RAG retrouve un fait introuvable hors-vault (canari Pélagie de Mollecuisse).");
      } else {
        err(`POST-FLIGHT ÉCHEC — le cerveau ne répond PAS depuis le vault : ${res.error ?? "raison inconnue"}`);
        err("Refus de déclarer l'install réussie (un cerveau qui répond à côté du vault est pire qu'un cerveau en panne).");
        err("Dépannage : SETUP.md §8 (.env, index, connexion MCP), puis relance l'installeur.");
        process.exit(1); // FAIL BRUYANT — avant toute bannière de succès
      }
    } else {
      // Embedder pas prêt → on ne peut pas prouver le retrieval ; structurel seul, KO = warn.
      if (res.ok) {
        ok(`connexion MCP OK — ${res.tools.length} outils exposés (${EXPECT_TOOLS.join(", ")}).`);
      } else {
        warn(`connexion MCP KO : ${res.error ?? "raison inconnue"}`);
        warn("Claude Code pourrait ne pas voir le vault. Dépannage : SETUP.md §8.");
      }
      if (embedderCfg.needsGeminiKey) {
        warn("Check démo REPORTÉ (pas de clé) — étape suivante : colle ta clé Gemini dans .env,");
      } else {
        warn("Check démo REPORTÉ (embedder à finir de configurer) — complète .env,");
      }
      warn("puis valide le RAG avec :  node scripts/verify-rag.mjs  (verdict bruyant, sourcé du vault).");
    }
  }
} catch (e) {
  warn(`vérification MCP impossible (${e.message}) — voir SETUP.md §8.`);
}

// ── Fin ─────────────────────────────────────────────────────────────────────
console.log(`\n${c.B}${c.G}✓ Installation terminée.${c.X}\n`);
console.log(`Ton second cerveau a été créé dans : ${c.C}${TARGET}${c.X}`);
// Bannière clé : seulement si l'embedder choisi EST Gemini et que la clé manque
// encore (option tout-local / endpoint → aucune clé Gemini à réclamer).
const geminiKeyMissing = embedderCfg.needsGeminiKey && !geminiKey;
if (geminiKeyMissing) {
  console.log(
    `\n${c.B}⚠️ Clé Gemini pas encore renseignée.${c.X} Avant d'ouvrir Claude Code, colle-la dans`
  );
  console.log(`   ${c.C}${toPosix(envPath)}${c.X} (ligne ${c.C}GOOGLE_GEMINI_API_KEY=${c.X}).`);
  console.log(
    `   Si tu ouvres Claude Code avant : colle la clé puis repose ta question (le serveur relit`
  );
  console.log(`   .env tout seul) ; au pire, ${c.C}/mcp${c.X} pour reconnecter, ou relance Claude Code.`);
}
console.log(`Prochaines étapes :`);
console.log(`  1. ${c.C}cd ${toPosix(TARGET)} && claude${c.X}   ← ouvre Claude Code dans le dossier cerveau`);
console.log(`  2. Pose une question, ex. :`);
console.log(`     ${c.C}"${DEMO}"${c.X}`);
console.log(`     → Claude répond depuis le vault, sources citées.`);
console.log(`  3. Remplace les notes d'exemple par les tiennes, édite ${c.C}CLAUDE.md${c.X} à ton image.`);
console.log(`\nDoc complète : ${c.C}SETUP.md${c.X}`);

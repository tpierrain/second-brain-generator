#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// bootstrap.mjs — installateur interactif du Second Brain Generator.
// Vérifie les prérequis, personnalise le harnais, installe le moteur RAG.
// Idempotent : peut être relancé sans casse.
//
// Multi-OS : pur Node (le seul prérequis runtime). Fonctionne en cmd /
// PowerShell (Windows) comme en bash/zsh (macOS/Linux). Aucune dépendance
// shell, jq, sqlite3 ni sed.
//
//   Usage :  node bootstrap.mjs
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
import { tmpdir, homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { smokeTestMcp } from "./scripts/lib/mcp-smoke.mjs";
import { CONNECTORS } from "./scripts/lib/connectors-catalog.mjs";
import { applyConnectorFiles } from "./scripts/lib/connectors-apply.mjs";
import { clearExampleNotes } from "./scripts/lib/example-notes.mjs";
import { isBootstrapStub } from "./scripts/lib/claude-md.mjs";
import { parseAnswers, resolveTargetDir } from "./scripts/lib/bootstrap-args.mjs";
import { parseLsFilesZ, filterCopyable } from "./scripts/lib/tracked-files.mjs";

// ROOT = le LAUNCHER (ce dépôt cloné). Source en LECTURE SEULE, réutilisable :
// le bootstrap n'y écrit JAMAIS. Il CRÉE ailleurs un dossier cerveau (TARGET),
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

console.log(`${c.B}${c.C}`);
console.log(`  ╔══════════════════════════════════════════════╗`);
console.log(`  ║        Second Brain Generator — bootstrap    ║`);
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
  err("Prérequis manquants — corrige les points ci-dessus puis relance : node bootstrap.mjs");
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
  ownerContext: "usage professionnel",
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

let projectName, ownerName, ownerContext, language, destParent;
if (interactive) {
  // Prompts pré-remplis avec les réponses CLI/env (ou les défauts) comme valeur proposée.
  projectName = await ask("Nom du cerveau (dossier à créer)", cli.projectName);
  destParent = await ask("Emplacement (dossier parent)", cli.destParent ?? homedir());
  ownerName = await ask("Ton nom", cli.ownerName);
  ownerContext = await ask("Ton contexte (ex: CTO d'une scale-up)", cli.ownerContext);
  language = await ask("Langue par défaut des notes", cli.language);
} else {
  warn("Mode non interactif — réponses prises des flags/env (ou défauts).");
  projectName = cli.projectName;
  ownerName = cli.ownerName;
  ownerContext = cli.ownerContext;
  language = cli.language;
  destParent = cli.destParent;
}

// ── Résolution du dossier cerveau (TARGET) ───────────────────────────────────
// On REFUSE une cible existante (garantit que c'est bien le bootstrap qui crée
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

// ── 3. Clé Gemini ───────────────────────────────────────────────────────────
step("3/9 · Clé API Google Gemini (pour le RAG)");
warn(
  "Confidentialité : sur le palier GRATUIT, Google peut exploiter tes contenus (amélioration produit, relecture humaine). Pour un vault confidentiel, active la FACTURATION (palier payant) — quelques centimes. Détails : SETUP §9.",
);
let geminiKey = "";
const envPath = join(TARGET, ".env");
const envHasKey =
  existsSync(envPath) && /^GOOGLE_GEMINI_API_KEY=.+/m.test(readFileSync(envPath, "utf8"));
if (envHasKey) {
  ok(".env existe déjà avec une clé — conservée.");
} else {
  console.log(`Clé gratuite : ${c.C}https://aistudio.google.com/apikey${c.X}`);
  geminiKey = await ask("Colle ta clé Gemini (ou Entrée pour configurer plus tard)");
}

// ── 4. Génération des fichiers ──────────────────────────────────────────────
step("4/9 · Génération des fichiers personnalisés");
const replacements = {
  "{{PROJECT_ROOT}}": toPosix(TARGET),
  "{{PROJECT_NAME}}": projectName,
  "{{OWNER_NAME}}": ownerName,
  "{{OWNER_CONTEXT}}": ownerContext,
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
// Le CLAUDE.md copié est l'amorce (stub) → isBootstrapStub la fait remplacer par
// la constitution personnalisée. .mcp.json / settings.json sont gitignorés (donc
// absents de la copie) → gen les écrit à neuf.
gen(join(TARGET, "CLAUDE.md.template"), join(TARGET, "CLAUDE.md"), isBootstrapStub);
gen(join(TARGET, ".mcp.json.template"), join(TARGET, ".mcp.json"));
gen(join(TARGET, ".claude", "settings.json.template"), join(TARGET, ".claude", "settings.json"));

// .env
if (!existsSync(envPath)) {
  copyFileSync(join(TARGET, ".env.example"), envPath);
  ok("généré : .env (depuis .env.example)");
}
if (geminiKey) {
  let env = readFileSync(envPath, "utf8");
  env = /^GOOGLE_GEMINI_API_KEY=/m.test(env)
    ? env.replace(/^GOOGLE_GEMINI_API_KEY=.*$/m, `GOOGLE_GEMINI_API_KEY=${geminiKey}`)
    : `${env}\nGOOGLE_GEMINI_API_KEY=${geminiKey}\n`;
  writeFileSync(envPath, env);
  ok("clé Gemini enregistrée dans .env");
}

// Dépôt git DU CERVEAU — socle de l'auto-commit. Dossier NEUF → `git init`
// systématique, aucun conditionnel, aucun remote, aucune suppression. Aucun lien
// vers le launcher par construction (on a copié les fichiers suivis, jamais le
// .git du launcher). L'anti-fuite vient du push opt-in du hook (secondbrain.autopush).
run("git", ["init", "-q"], { cwd: TARGET });
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
    warn("Notes d'exemple conservées (utiles pour le 1er test). Relance le bootstrap pour les vider plus tard.");
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

// ── 7. Indexation initiale (si clé présente) ────────────────────────────────
step("8/9 · Indexation initiale du vault d'exemple");
const keyReady =
  existsSync(envPath) && /^GOOGLE_GEMINI_API_KEY=.+/m.test(readFileSync(envPath, "utf8"));
if (keyReady) {
  const idx = run(NPM, ["run", "--silent", "index"], { cwd: rag, stdio: "inherit" });
  if (idx.ok) ok("vault d'exemple indexé");
  else warn("Indexation interrompue (quota/clé ?) — elle reprendra au prochain démarrage de Claude Code.");
} else {
  warn("Pas de clé Gemini → indexation reportée. Ajoute la clé dans .env puis : cd rag && npm run index");
}

// ── 8. Vérification de la connexion MCP ──────────────────────────────────────
// Confirme que Claude Code pourra réellement parler au serveur `vault-rag`
// (handshake stdio), avant de lancer `claude`. Non bloquant : un échec ici
// n'empêche pas d'utiliser le générateur, mais pointe vers le dépannage SETUP.
// Pas de clé Gemini requise — lister les outils n'embedde rien.
step("9/9 · Vérification de la connexion MCP");
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
      timeoutMs: 30000,
    });
    if (res.ok) {
      ok(`connexion MCP OK — ${res.tools.length} outils exposés (${EXPECT_TOOLS.join(", ")})`);
    } else {
      warn(`connexion MCP KO : ${res.error ?? "raison inconnue"}`);
      warn("Claude Code pourrait ne pas voir le vault. Dépannage : SETUP.md §8.");
    }
  }
} catch (e) {
  warn(`vérification MCP impossible (${e.message}) — voir SETUP.md §8.`);
}

// ── Fin ─────────────────────────────────────────────────────────────────────
console.log(`\n${c.B}${c.G}✓ Bootstrap terminé.${c.X}\n`);
console.log(`Ton second cerveau a été créé dans : ${c.C}${TARGET}${c.X}`);
console.log(`Prochaines étapes :`);
console.log(`  1. ${c.C}cd ${toPosix(TARGET)} && claude${c.X}   ← ouvre Claude Code dans le dossier cerveau`);
console.log(`  2. Pose une question, ex. :`);
console.log(`     ${c.C}"Quelle base de données a-t-on choisie pour la facturation et pourquoi ?"${c.X}`);
console.log(`     → Claude répond depuis le vault, sources citées.`);
console.log(`  3. Remplace les notes d'exemple par les tiennes, édite ${c.C}CLAUDE.md${c.X} à ton image.`);
console.log(`\nDoc complète : ${c.C}SETUP.md${c.X}`);

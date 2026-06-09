// ─────────────────────────────────────────────────────────────────────────────
// measure-batch.mts — mesure footprint de l'indexation IN-PROCESS sur un vault dense
// (Étape 4-ter du plan embedder : caler le plafond de lot `EMBED_BATCH`).
//
//   node --import tsx scripts/measure-batch.mts <batchSize> [vaultPath]
//
// Réplique le câblage in-process de selectEmbedder (EmbeddingGemma-300m ONNX q8 +
// prompts de tâche) et le pipeline d'indexation (scan → parse → chunk → embed par
// doc), mais avec une persistance NEUTRE (compte seulement). Rien n'est écrit, rien
// ne sort du process (embedder local). Échantillonne le RSS pour en sortir le PIC.
//
// Sortie = une ligne CSV-like : batch, notes, chunks, pic RSS, temps, chunks/s.
// Tout le reste de l'instrument est inchangé entre runs → comparaison honnête.
// ─────────────────────────────────────────────────────────────────────────────
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

import { parseDocument } from "../src/lib/frontmatter-parser.js";
import { chunkMarkdown } from "../src/lib/chunker.js";
import {
  InProcessEmbedder,
  promptsForModel,
} from "../src/lib/in-process-embedder.js";

const MODEL = "onnx-community/embeddinggemma-300m-ONNX";

// Défaut public-safe = le vault d'exemple du repo (Flemmr, 7 notes). Pour caler le
// plafond, pointer un VRAI vault dense via l'argument ou $MEASURE_VAULT (jamais
// codé en dur ici — un chemin personnel n'a rien à faire dans le dépôt).
const REPO_VAULT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "vault");
const batchSize = Number(process.argv[2]);
const vaultPath = process.argv[3] ?? process.env.MEASURE_VAULT ?? REPO_VAULT;

if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error(
    "usage: node --import tsx scripts/measure-batch.mts <batchSize> [vaultPath]\n" +
      "       (sinon $MEASURE_VAULT, sinon le vault d'exemple du repo)"
  );
  process.exit(1);
}

/** Liste récursive des .md sous `dir`. */
async function listMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (e.name.endsWith(".md")) files.push(full);
  }
  return files;
}

/** Échantillonne le RSS en continu et retient le pic (bytes). */
function startRssSampler(): { stop: () => number } {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 200);
  timer.unref();
  return { stop: () => { clearInterval(timer); return peak; } };
}

const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);

async function main() {
  const files = await listMarkdown(vaultPath);

  // Phase 1 — scan + parse + chunk (sans embed), comme index-manager.
  const docs: { path: string; contents: string[] }[] = [];
  let totalChunks = 0;
  for (const abs of files) {
    const raw = await readFile(abs, "utf-8");
    const parsed = parseDocument(raw, relative(vaultPath, abs));
    const chunks = chunkMarkdown(parsed.content);
    if (chunks.length === 0) continue;
    docs.push({ path: abs, contents: chunks.map((c) => c.content) });
    totalChunks += chunks.length;
  }

  const embedder = new InProcessEmbedder({
    model: MODEL,
    dimension: 768,
    prompts: promptsForModel(MODEL),
    batchSize,
  });

  console.error(
    `[batch=${batchSize}] ${docs.length} notes · ${totalChunks} chunks · chargement du modèle + indexation…`
  );

  const sampler = startRssSampler();
  const t0 = process.hrtime.bigint();

  // Phase 2 — embed par doc + persistance NEUTRE (on jette les vecteurs, on compte).
  let embedded = 0;
  for (const doc of docs) {
    const vectors = await embedder.embedDocuments(doc.contents);
    embedded += vectors.length; // « persiste » : ici on compte seulement
  }

  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  const peak = sampler.stop();

  const line = [
    `batch=${batchSize}`,
    `notes=${docs.length}`,
    `chunks=${embedded}`,
    `picRSS=${gib(peak)}Go`,
    `temps=${(seconds / 60).toFixed(2)}min`,
    `débit=${(embedded / seconds).toFixed(1)}chunks/s`,
  ].join(" · ");
  console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

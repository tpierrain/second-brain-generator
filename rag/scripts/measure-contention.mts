// ═══════════════════════════════════════════════════════════════════════════
// measure-contention.mts — DEV-ONLY (exclu du cerveau). Répond à la question
// d'archi : « le serveur MCP indexe DANS son process ; une recherche lancée
// PENDANT l'indexation va-t-elle laguer ? »
//
// Reproduit fidèlement l'archi réelle (index.ts) :
//   • search_vault appelle createEmbedder() À CHAQUE requête  → on fait pareil.
//   • reindex() tourne en tâche de fond (embedDocuments en boucle, lot=EMBED_BATCH).
//
// Mesure 3 choses :
//   A. Coût d'un createEmbedder()+embedQuery RÉPÉTÉ (la session reste-t-elle chaude
//      entre instances, ou cold-start ~675 ms à chaque recherche ?).
//   B. Latence de recherche AU REPOS (baseline).
//   C. Latence de recherche PENDANT une indexation de fond (contention CPU).
//
//   Lancer :  cd rag && npx tsx scripts/measure-contention.mts
// ═══════════════════════════════════════════════════════════════════════════
process.env.EMBEDDING_PROVIDER = "in-process";

import { createEmbedder } from "../src/lib/embedder.js";

const now = () => Number(process.hrtime.bigint() / 1_000_000n);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const summary = (label: string, xs: number[]) =>
  `${label}: n=${xs.length} min=${Math.min(...xs)}ms p50=${pct(xs, 50)}ms p95=${pct(xs, 95)}ms max=${Math.max(...xs)}ms`;

// Une « recherche » telle que la fait search_vault : createEmbedder() neuf + embedQuery.
async function searchOnce(query: string): Promise<number> {
  const t = now();
  const embedder = createEmbedder();
  await embedder.embedQuery(query);
  return now() - t;
}

// Faux corpus de documents « longs » (proche d'un transcript : ~1500 caractères).
function fakeDocs(n: number): string[] {
  const lorem =
    "Réunion hebdomadaire de synthèse sur les sujets d'ingénierie et de produit. " +
    "On y parle d'architecture, de RAG, d'embeddings et de la feuille de route. ";
  return Array.from({ length: n }, (_, i) => `Note ${i} — ` + lorem.repeat(12));
}

async function main() {
  console.log("⏳ Chargement du modèle (1ʳᵉ recherche, cold-start attendu)…");
  const warm = await searchOnce("première question canari");
  console.log(`  1ʳᵉ recherche (cold) : ${warm}ms\n`);

  // ── A + B : recherches répétées AU REPOS (pas d'indexation concurrente) ──
  const idle: number[] = [];
  for (let i = 0; i < 12; i++) idle.push(await searchOnce(`question repos ${i}`));
  console.log(summary("A/B  REPOS  (createEmbedder()+embedQuery par requête)", idle));
  console.log(
    idle.slice(1).every((x) => x < 200)
      ? "  → session CHAUDE entre instances (pas de rechargement par recherche). ✅\n"
      : "  → ⚠️ coût élevé répété : rechargement probable à chaque createEmbedder().\n",
  );

  // ── C : recherches PENDANT une indexation de fond ──
  console.log("⏳ Lancement d'une indexation de fond (200 docs longs, lot=4)…");
  const indexer = createEmbedder();
  const docs = fakeDocs(200);
  let indexingDone = false;
  const tIndexStart = now();
  const indexingPromise = indexer.embedDocuments(docs).then(() => {
    indexingDone = true;
    return now() - tIndexStart;
  });

  const busy: number[] = [];
  while (!indexingDone) {
    busy.push(await searchOnce(`question pendant indexation ${busy.length}`));
    await new Promise((r) => setTimeout(r, 150)); // ~cadence d'un humain qui tape
  }
  const indexMs = await indexingPromise;
  console.log(`  indexation de fond terminée en ${indexMs}ms (200 docs)\n`);
  console.log(summary("C    CONTENTION (recherche pendant indexation)", busy));

  const baseP95 = pct(idle.slice(1), 95);
  const busyP95 = pct(busy, 95);
  const factor = (busyP95 / Math.max(1, baseP95)).toFixed(1);
  console.log(`\n📊 ACTUEL : recherche au repos p95=${baseP95}ms vs sous indexation p95=${busyP95}ms → ×${factor}`);

  // ═══ CORRECTIF SIMULÉ : un SEUL embedder partagé (mémoïsé au niveau process) ═══
  console.log("\n──────── CORRECTIF : embedder partagé (1 instance) ────────");
  const shared = createEmbedder();
  await shared.embedQuery("réchauffe"); // 1ʳᵉ fois paie le chargement, comme aujourd'hui

  // A2 — repos, instance réutilisée (au lieu de createEmbedder() par requête)
  const idleShared: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = now();
    await shared.embedQuery(`question repos partagée ${i}`);
    idleShared.push(now() - t);
  }
  console.log(summary("A2   REPOS  (instance partagée réutilisée)", idleShared));

  // C2 — recherche pendant indexation, en PARTAGEANT la même instance (1 session ONNX)
  console.log("⏳ Indexation de fond (200 docs) sur la MÊME instance partagée…");
  let done2 = false;
  const idx2 = shared.embedDocuments(fakeDocs(200)).then(() => (done2 = true));
  const busyShared: number[] = [];
  while (!done2) {
    const t = now();
    await shared.embedQuery(`q pendant indexation partagée ${busyShared.length}`);
    busyShared.push(now() - t);
    await new Promise((r) => setTimeout(r, 150));
  }
  await idx2;
  console.log(summary("C2   CONTENTION (instance partagée)", busyShared));

  console.log(
    `\n📊 CORRIGÉ : repos p95=${pct(idleShared, 95)}ms vs sous indexation p95=${pct(busyShared, 95)}ms`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

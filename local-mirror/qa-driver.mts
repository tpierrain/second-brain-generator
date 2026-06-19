// Throwaway live-QA driver for local-mirror (Step 9, Block A reconciliation).
// Confined to /tmp/gss-qa scratch — purged after QA. Reads the token + root URL + source
// name from /tmp/gss-qa/.env (never the chat, never the repo). Wires the REAL Notion SPI
// adapter against the live API, with vault/sidecar/config pointed at the scratch.
//
// Usage:  node --import tsx /tmp/gss-qa/driver.mts <setup|sync|sync2|list|status|tree> [name]

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '/tmp/gss-qa/.env' });

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = './src';
const { LocalMirror } = await import(`./src/domain/local-mirror.js`);
const { FsConfigStore } = await import(`./src/adapters/fs-config-store.js`);
const { FsStateStore } = await import(`./src/adapters/fs-state-store.js`);
const { FsVaultWriter } = await import(`./src/adapters/fs-vault-writer.js`);
const { SystemClock } = await import(`./src/adapters/system-clock.js`);
const { notionConnectorFactory } = await import(`./src/adapters/notion-gateway.js`);

const SCRATCH = '/tmp/gss-qa';
const VAULT = `${SCRATCH}/vault`;

const api = new LocalMirror({
  configStore: new FsConfigStore(`${SCRATCH}/config.json`),
  stateStore: new FsStateStore(`${SCRATCH}/.sidecar`),
  vaultWriter: new FsVaultWriter(VAULT),
  clock: new SystemClock(),
  connectorFor: notionConnectorFactory,
});

// Source A from .env; B (nested/overlapping) and C (disjoint + deep) for the perimeter test.
const NAME_A = process.env.QA_SOURCE_NAME ?? 'qa-a';
const NAME_B = process.env.QA_SOURCE_NAME_B ?? 'qa-b';
const NAME_C = process.env.QA_SOURCE_NAME_C ?? 'qa-c';

function listVault(name: string): string[] {
  const dir = resolve(VAULT, 'mirrors', name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

// Privacy: NEVER print page titles/content (the zone is private). Show only the file name
// (a Notion page UUID — not sensitive) + a short hash of the body, enough to prove a rename
// rewrote the SAME file (hash changes) and a delete removed it (file gone).
function fingerprintsIn(name: string): { file: string; hash8: string }[] {
  const dir = resolve(VAULT, 'mirrors', name);
  return listVault(name).map((file) => {
    const body = readFileSync(resolve(dir, file), 'utf8');
    const hash8 = createHash('sha256').update(body).digest('hex').slice(0, 8);
    return { file, hash8 };
  });
}

const cmd = process.argv[2] ?? 'list';

if (cmd === 'setup') {
  const res = await api.setupSource({
    name: NAME_A,
    title: 'QA zone A',
    description: 'Throwaway QA source A',
    rootPageUrl: requireEnv('QA_ROOT_URL'),
    tokenEnv: requireEnv('QA_TOKEN_ENV'),
  });
  console.log(JSON.stringify(res, null, 2));
} else if (cmd === 'setup2') {
  const res = await api.setupSource({
    name: NAME_B,
    title: 'QA zone B',
    description: 'Throwaway QA source B',
    rootPageUrl: requireEnv('QA_ROOT_URL_B'),
    tokenEnv: requireEnv('QA_TOKEN_ENV_B'),
  });
  console.log(JSON.stringify(res, null, 2));
} else if (cmd === 'setup3') {
  const res = await api.setupSource({
    name: NAME_C,
    title: 'QA zone C',
    description: 'Throwaway QA source C (disjoint + deep)',
    rootPageUrl: requireEnv('QA_ROOT_URL_C'),
    tokenEnv: requireEnv('QA_TOKEN_ENV_C'),
  });
  console.log(JSON.stringify(res, null, 2));
} else if (cmd === 'sync') {
  console.log(JSON.stringify(await api.sync(process.argv[3] ?? NAME_A), null, 2));
} else if (cmd === 'list') {
  console.log(JSON.stringify(await api.listSources(), null, 2));
} else if (cmd === 'status') {
  console.log(JSON.stringify(await api.status(process.argv[3] ?? NAME_A), null, 2));
} else if (cmd === 'files') {
  for (const name of [NAME_A, NAME_B, NAME_C]) {
    const items = fingerprintsIn(name);
    if (items.length) {
      console.log(`\n[${name}] ${items.length} file(s):`);
      for (const it of items) console.log(`  ${it.file}  body#${it.hash8}`);
    }
  }
} else if (cmd === 'perimeters') {
  // Perimeter isolation, content-free: compare the SETS of page UUIDs across source folders.
  // Expected: A∩B > 0 (B nests A), A∩C = 0 and B∩C = 0 (C is disjoint) → no cross-source leak.
  const ids = (name: string) => new Set(listVault(name).map((f) => f.replace(/\.md$/, '')));
  const sets = { [NAME_A]: ids(NAME_A), [NAME_B]: ids(NAME_B), [NAME_C]: ids(NAME_C) } as Record<string, Set<string>>;
  for (const name of [NAME_A, NAME_B, NAME_C]) console.log(`[${name}] ${sets[name].size} page(s)`);
  const overlap = (x: string, y: string) => [...sets[x]].filter((id) => sets[y].has(id)).length;
  console.log(`overlap ${NAME_A}∩${NAME_B} = ${overlap(NAME_A, NAME_B)} (expect > 0: B nests A)`);
  console.log(`overlap ${NAME_A}∩${NAME_C} = ${overlap(NAME_A, NAME_C)} (expect 0: disjoint)`);
  console.log(`overlap ${NAME_B}∩${NAME_C} = ${overlap(NAME_B, NAME_C)} (expect 0: disjoint)`);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing ${key} in /tmp/gss-qa/.env`);
    process.exit(3);
  }
  return v;
}

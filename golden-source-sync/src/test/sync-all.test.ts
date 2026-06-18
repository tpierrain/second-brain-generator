import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoldenSourceSync } from '../domain/golden-source-sync.js';
import type {
  ConnectorFactory,
  IClock,
  IConfigStore,
  ISourceConnector,
  IStateStore,
  PersistedState,
  SourceItem,
} from '../domain/ports.js';
import type { GoldenSourceConfig } from '../domain/types.js';

// Acceptance tests for `sync("all")` — the fan-out that refreshes EVERY declared source in one
// call. Two non-negotiable properties on top of "it syncs them": the sources are isolated, so one
// source failing must NOT abort the others (containment); and the fan-out runs them CONCURRENTLY,
// so a slow source never head-of-line-blocks the rest. Each source has its own connector (its own
// token/scope), its own vault subfolder and its own sidecar — nothing mutable is shared.

/** A declared source serving a fixed page set, with optional per-source enumeration behavior. */
interface SourceSpec {
  name: string;
  pages: SourceItem[];
  /** When set, this source's enumeration throws (token lost, network…). */
  fail?: string;
  /** A gate awaited on entry to listItems — lets a test observe/Force concurrency. */
  onEnumerate?: () => Promise<void>;
}

function buildSyncOver(specs: SourceSpec[]): {
  api: GoldenSourceSync;
  written: Map<string, string>;
  deleted: string[];
} {
  const configs: GoldenSourceConfig[] = specs.map((s) => aConfig(s.name));
  const written = new Map<string, string>();
  const deleted: string[] = [];

  const configStore: IConfigStore = {
    async loadAll() {
      return [...configs];
    },
    async upsert() {},
    async remove() {},
  };
  const stateStore = new InMemoryStateStore();
  const vaultWriter = {
    async write(path: string, content: string) {
      written.set(path, content);
    },
    async delete(path: string) {
      written.delete(path);
      deleted.push(path);
    },
  };
  const clock: IClock = { now: () => new Date('2026-06-17T00:00:00.000Z') };
  const connectorFor: ConnectorFactory = (config) => {
    const spec = specs.find((s) => s.name === config.name)!;
    return new SpecConnector(spec);
  };

  return {
    api: new GoldenSourceSync({ configStore, stateStore, vaultWriter, clock, connectorFor }),
    written,
    deleted,
  };
}

class SpecConnector implements ISourceConnector {
  constructor(private readonly spec: SourceSpec) {}
  async listItems(): Promise<SourceItem[]> {
    if (this.spec.onEnumerate) await this.spec.onEnumerate();
    if (this.spec.fail) throw new Error(this.spec.fail);
    return this.spec.pages;
  }
  async fetchContent(item: SourceItem): Promise<string> {
    return `# ${item.title}\n\nbody of ${item.id}\n`;
  }
}

class InMemoryStateStore implements IStateStore {
  private readonly states = new Map<string, PersistedState>();
  async load(name: string) {
    return this.states.get(name) ?? null;
  }
  async save(name: string, state: PersistedState) {
    this.states.set(name, state);
  }
  async delete(name: string) {
    this.states.delete(name);
  }
}

function aConfig(name: string): GoldenSourceConfig {
  return {
    name,
    title: `Source ${name}`,
    description: `topics of ${name}`,
    connector: {
      type: 'notion',
      config: { root_page_url: `https://www.notion.so/${name}-304a2ca0b1c24d6e8f0a1b2c3d4e5f60`, token_env: `TOKEN_${name}` },
    },
    target_dir: `golden-sources/${name}`,
  };
}

function aPage(id: string): SourceItem {
  return { id, title: `Page ${id}`, url: `https://www.notion.so/${id}`, lastEditedTime: '2026-06-12T14:21:00.000Z' };
}

/** A gate that resolves only once `n` callers have entered — a barrier proving concurrency. */
function barrierFor(n: number): () => Promise<void> {
  let entered = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return async () => {
    if (++entered >= n) release();
    await gate;
  };
}

/** Reject after `ms` so a sequential (deadlocking) fan-out fails fast instead of hanging. */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms).unref()),
  ]);
}

test('sync("all") fans out over every declared source and aggregates the report', async () => {
  const { api, written } = buildSyncOver([
    { name: 'alpha', pages: [aPage('a1'), aPage('a2')] },
    { name: 'beta', pages: [aPage('b1')] },
  ]);

  const report = await api.sync('all');

  assert.equal(report.name, 'all');
  assert.equal(report.status, 'ok');
  assert.equal(report.written, 3); // 2 (alpha) + 1 (beta)
  // Per-source breakdown, so the user sees what each source did.
  assert.deepEqual(
    (report.sources ?? []).map((r) => [r.name, r.written]).sort(),
    [['alpha', 2], ['beta', 1]],
  );
  // Each source wrote into its OWN subfolder.
  assert.ok(written.has('golden-sources/alpha/a1.md'));
  assert.ok(written.has('golden-sources/beta/b1.md'));
});

test('sync("all") is contained: one source failing never aborts the others', async () => {
  const { api, written } = buildSyncOver([
    { name: 'alpha', pages: [aPage('a1')], fail: 'notion: 401 unauthorized' },
    { name: 'beta', pages: [aPage('b1')] },
  ]);

  const report = await api.sync('all');

  // The batch did not blow up; beta synced fully despite alpha being down.
  assert.equal(report.status, 'partial');
  assert.ok(written.has('golden-sources/beta/b1.md'));
  const byName = Object.fromEntries((report.sources ?? []).map((r) => [r.name, r]));
  assert.equal(byName.alpha.status, 'partial'); // §7 guardrail: a doubtful perimeter freezes, writes nothing
  assert.equal(byName.alpha.written, 0);
  assert.equal(byName.beta.status, 'ok');
  assert.equal(byName.beta.written, 1);
});

test('sync("all") runs the sources concurrently — a slow one never blocks the others', async () => {
  // The barrier resolves ONLY once BOTH sources have started enumerating. A sequential fan-out
  // would have the first source await a barrier that needs the second to have started → deadlock,
  // surfaced as a timeout. It passes only if both syncs are genuinely in flight at the same time.
  const enter = barrierFor(2);
  const { api, written } = buildSyncOver([
    { name: 'alpha', pages: [aPage('a1')], onEnumerate: enter },
    { name: 'beta', pages: [aPage('b1')], onEnumerate: enter },
  ]);

  const report = await withTimeout(api.sync('all'), 2000, 'sync("all") did not run sources concurrently');

  assert.equal(report.status, 'ok');
  assert.ok(written.has('golden-sources/alpha/a1.md'));
  assert.ok(written.has('golden-sources/beta/b1.md'));
});

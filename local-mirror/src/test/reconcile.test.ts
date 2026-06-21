import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesToDelete } from '../domain/reconcile.js';
import type { PersistedItem } from '../domain/ports.js';

// Pure reconciliation core (PRD §7): given the freshly-enumerated perimeter and the previous
// state map, which tracked pages are gone and must have their `.md` deleted? It is a plain
// set difference — `previous \ perimeter` — kept side-effect-free so the §7 guardrail (when to
// even call it) lives in the Domain Service, not here.

const tracked = (vaultPath: string): PersistedItem => ({
  title: 'whatever',
  vaultPath,
  lastEditedTime: '2026-06-12T14:21:00.000Z',
  contentHash: 'sha256:deadbeef',
  lastWrittenAt: '2026-06-12T14:30:00.000Z',
});

test('a page still in the perimeter is not a deletion candidate', () => {
  const deletions = pagesToDelete([{ id: 'page-1' }], { 'page-1': tracked('mirrors/team-a/page-1.md') });

  assert.deepEqual(deletions, []);
});

test('a tracked page absent from the perimeter is returned for deletion', () => {
  const deletions = pagesToDelete([{ id: 'page-1' }], {
    'page-1': tracked('mirrors/team-a/page-1.md'),
    'page-2': tracked('mirrors/team-a/page-2.md'),
  });

  assert.deepEqual(deletions, [{ id: 'page-2', ...tracked('mirrors/team-a/page-2.md') }]);
});

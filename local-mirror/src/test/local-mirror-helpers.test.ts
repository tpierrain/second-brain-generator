// @ts-nocheck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateHealth,
  aggregateStatus,
  aggregateReports,
  failedReport,
  maxLastEditedTime,
  rootPageIdOf,
  configFromRequest,
  errorMessage,
} from '../domain/local-mirror.js';
import { aNotionLocalMirror } from './builder.js';

// Unit tests for the Domain Service's pure helpers. Several of their branches are NOT reachable
// through the public API (e.g. aggregateHealth's `unknown` verdict never arises from healthCheck,
// which only ever produces `ok`/`broken` sub-checks; aggregateStatus's mixed verdicts need
// per-source rejections that the fan-out swallows). Testing the glue directly, per the
// "test the glue too" convention, is how those verdicts get pinned.

// aggregateHealth: any broken → broken; else any unknown → unknown; else ok (ADR 0030).
test('aggregateHealth: a broken sub-check dominates', () => {
  assert.equal(aggregateHealth([{ status: 'ok' }, { status: 'broken' }]), 'broken');
});

test('aggregateHealth: an unknown sub-check (no broken) yields unknown', () => {
  assert.equal(aggregateHealth([{ status: 'ok' }, { status: 'unknown' }]), 'unknown');
});

test('aggregateHealth: all ok yields ok', () => {
  assert.equal(aggregateHealth([{ status: 'ok' }, { status: 'ok' }]), 'ok');
});

// aggregateStatus: ok iff every source ok; failed iff every source failed; else partial.
test('aggregateStatus: an empty batch is ok', () => {
  assert.equal(aggregateStatus([]), 'ok');
});

test('aggregateStatus: every source ok → ok', () => {
  assert.equal(aggregateStatus([{ status: 'ok' }, { status: 'ok' }]), 'ok');
});

test('aggregateStatus: every source failed → failed', () => {
  assert.equal(aggregateStatus([{ status: 'failed' }, { status: 'failed' }]), 'failed');
});

test('aggregateStatus: a mix of ok and failed → partial (not failed, not ok)', () => {
  assert.equal(aggregateStatus([{ status: 'ok' }, { status: 'failed' }]), 'partial');
});

test('aggregateStatus: a partial anywhere → partial', () => {
  assert.equal(aggregateStatus([{ status: 'partial' }, { status: 'ok' }]), 'partial');
});

// A 'skipped' source (its lock was held by another live window) is BENIGN, not a failure — it must
// not drag a healthy fan-out to 'partial'. It is excluded from the verdict; the real attempts decide.
test('aggregateStatus: a skipped source among ok ones → ok (skipped is benign, excluded)', () => {
  assert.equal(aggregateStatus([{ status: 'ok' }, { status: 'skipped' }]), 'ok');
});

test('aggregateStatus: every source skipped → ok (nothing failed; another window has them)', () => {
  assert.equal(aggregateStatus([{ status: 'skipped' }, { status: 'skipped' }]), 'ok');
});

test('aggregateStatus: skipped alongside a real failure → failed (the failure still counts)', () => {
  assert.equal(aggregateStatus([{ status: 'failed' }, { status: 'skipped' }]), 'failed');
});

// aggregateReports: name 'all', worst-of status, and per-count SUMS (not just written).
test('aggregateReports sums every count and reports the per-source breakdown', () => {
  const a = { name: 'a', status: 'ok', written: 2, deleted: 1, unchanged: 3 };
  const b = { name: 'b', status: 'partial', written: 1, deleted: 4, unchanged: 5 };

  const report = aggregateReports([a, b]);

  assert.equal(report.name, 'all');
  assert.equal(report.status, 'partial');
  assert.equal(report.written, 3);
  assert.equal(report.deleted, 5);
  assert.equal(report.unchanged, 8);
  assert.deepEqual(report.sources, [a, b]);
});

// failedReport: the exact "this source threw" shape.
test('failedReport is a fully-zeroed failed report carrying the source name', () => {
  assert.deepEqual(failedReport('beta'), {
    name: 'beta',
    status: 'failed',
    written: 0,
    deleted: 0,
    unchanged: 0,
  });
});

// maxLastEditedTime: the MAX over the perimeter (order-independent), null when empty.
test('maxLastEditedTime returns null for an empty perimeter', () => {
  assert.equal(maxLastEditedTime([]), null);
});

test('maxLastEditedTime returns the max even when it is NOT the last item', () => {
  const max = maxLastEditedTime([
    { lastEditedTime: '2026-06-15T09:00:00.000Z' },
    { lastEditedTime: '2026-06-10T08:00:00.000Z' },
  ]);

  assert.equal(max, '2026-06-15T09:00:00.000Z');
});

// rootPageIdOf: prefer the stored id; only extract from the URL when there is no prior state.
test('rootPageIdOf keeps the previously-persisted root page id', () => {
  const stored = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';

  assert.equal(rootPageIdOf(aNotionLocalMirror(), { rootPageId: stored }), stored);
});

test('rootPageIdOf extracts the id from the config URL when there is no prior state', () => {
  assert.equal(rootPageIdOf(aNotionLocalMirror(), null), '0123abc0-b1c2-4d6e-8f0a-1b2c3d4e5f60');
});

// configFromRequest: assembles the declared config; the connector is always Notion, files land
// under mirrors/<name>, and only the token's ENV VAR NAME is stored (never the token).
test('configFromRequest builds a Notion config under mirrors/<name>, storing only the token env var', () => {
  const config = configFromRequest({
    name: 'team-x',
    title: 'Team X',
    description: 'topics',
    rootPageUrl: 'https://www.notion.so/acme/Page-0123abc0b1c24d6e8f0a1b2c3d4e5f60',
    tokenEnv: 'TEAM_X_TOKEN',
  });

  assert.equal(config.connector.type, 'notion');
  assert.equal(config.target_dir, 'mirrors/team-x');
  assert.equal(config.connector.config.root_page_url, 'https://www.notion.so/acme/Page-0123abc0b1c24d6e8f0a1b2c3d4e5f60');
  assert.equal(config.connector.config.token_env, 'TEAM_X_TOKEN');
});

// errorMessage: an Error's message; anything else stringified.
test('errorMessage unwraps an Error message', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
});

test('errorMessage stringifies a non-Error thrown value', () => {
  assert.equal(errorMessage('plain string'), 'plain string');
});

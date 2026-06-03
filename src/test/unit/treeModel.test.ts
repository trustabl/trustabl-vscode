import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScanResult } from '../../types';
import { buildFindings, buildScores, buildHelp, findingsCount } from '../../treeModel';

const result = parseScanResult(
  fs.readFileSync(path.join(__dirname, '../fixtures/sample-scan.json'), 'utf8'));

describe('buildFindings', () => {
  it('groups by severity by default and respects minSeverity', () => {
    const high = buildFindings(result, 'high', 'severity').map((n) => n.label);
    assert.ok(high.some((l) => l.startsWith('high')));
    assert.ok(!high.some((l) => l.startsWith('info')));
  });
  it('groups by scope', () => {
    const labels = buildFindings(result, 'info', 'scope').map((n) => n.label);
    assert.ok(labels.some((l) => l.startsWith('tool')));
    assert.ok(labels.some((l) => l.startsWith('meta')));
  });
  it('groups by file with repo-scope under (repository)', () => {
    const labels = buildFindings(result, 'info', 'file').map((n) => n.label);
    assert.ok(labels.some((l) => l.startsWith('src/tools.py')));
    assert.ok(labels.some((l) => l.startsWith('(repository)')));
  });
  it('returns empty when nothing meets the threshold', () => {
    assert.strictEqual(buildFindings(result, 'critical', 'severity').length, 0);
  });
});

describe('findingsCount', () => {
  it('counts findings at or above the threshold', () => {
    assert.strictEqual(findingsCount(result, 'info'), 2);
    assert.strictEqual(findingsCount(result, 'high'), 1);
  });
});

describe('buildScores', () => {
  it('lists overall and per-surface scores plus the skip note', () => {
    const labels = buildScores(result).map((n) => n.label);
    assert.ok(labels.some((l) => l.toLowerCase().includes('overall')));
    assert.ok(labels.some((l) => l.startsWith('tool fetch_url')));
    assert.ok(labels.some((l) => l.includes('skipped')));
  });
});

describe('buildHelp', () => {
  it('returns external https links', () => {
    const help = buildHelp();
    assert.ok(help.length >= 3);
    assert.ok(help.every((n) => !!n.url && n.url.startsWith('https://')));
  });
});

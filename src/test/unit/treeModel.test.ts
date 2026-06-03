import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScanResult } from '../../types';
import { buildTree } from '../../treeModel';

const result = parseScanResult(
  fs.readFileSync(path.join(__dirname, '../fixtures/sample-scan.json'), 'utf8'));

describe('buildTree', () => {
  it('produces a Findings group and a Scores group', () => {
    const roots = buildTree(result, 'info');
    const labels = roots.map((r) => r.label);
    assert.ok(labels.some((l) => l.startsWith('Findings')));
    assert.ok(labels.includes('Scores'));
  });

  it('groups by severity by default and respects minSeverity', () => {
    const roots = buildTree(result, 'high', 'severity');
    const findings = roots.find((r) => r.label.startsWith('Findings'))!;
    const buckets = findings.children!.map((c) => c.label);
    assert.ok(buckets.some((b) => b.startsWith('high')));
    assert.ok(!buckets.some((b) => b.startsWith('info'))); // META info filtered out
  });

  it('groups by scope', () => {
    const roots = buildTree(result, 'info', 'scope');
    const labels = roots.find((r) => r.label.startsWith('Findings'))!.children!.map((c) => c.label);
    assert.ok(labels.some((l) => l.startsWith('tool')));
    assert.ok(labels.some((l) => l.startsWith('meta'))); // META finding has empty scope
  });

  it('groups by file, repo-scope findings under (repository)', () => {
    const labels = buildTree(result, 'info', 'file')
      .find((r) => r.label.startsWith('Findings'))!.children!.map((c) => c.label);
    assert.ok(labels.some((l) => l.startsWith('src/tools.py')));
    assert.ok(labels.some((l) => l.startsWith('(repository)')));
  });

  it('lists the overall score node', () => {
    const scores = buildTree(result, 'info').find((r) => r.label === 'Scores')!;
    assert.ok(scores.children!.some((c) => c.label.toLowerCase().includes('overall')));
  });
});

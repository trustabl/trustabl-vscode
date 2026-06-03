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
    assert.ok(labels.includes('Findings'));
    assert.ok(labels.includes('Scores'));
  });

  it('nests findings under severity buckets and respects minSeverity', () => {
    const roots = buildTree(result, 'high');
    const findings = roots.find((r) => r.label === 'Findings')!;
    const buckets = findings.children!.map((c) => c.label);
    assert.ok(buckets.some((b) => b.startsWith('high')));
    assert.ok(!buckets.some((b) => b.startsWith('info'))); // META info filtered
  });

  it('lists the overall score node', () => {
    const roots = buildTree(result, 'info');
    const scores = roots.find((r) => r.label === 'Scores')!;
    assert.ok(scores.children!.some((c) => c.label.toLowerCase().includes('overall')));
  });
});

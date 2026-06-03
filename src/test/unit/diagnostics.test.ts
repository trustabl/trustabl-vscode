import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScanResult } from '../../types';
import { buildDiagnostics, formatMessage, pickAnchorFile } from '../../diagnostics';

const result = parseScanResult(
  fs.readFileSync(path.join(__dirname, '../fixtures/sample-scan.json'), 'utf8'));
// Use a resolved absolute root so path.resolve in the impl and the lookups
// below agree on Windows (where path.resolve('/repo') prepends the drive).
const ROOT = path.resolve('/repo');

describe('pickAnchorFile', () => {
  it('returns the first existing manifest', () => {
    const exists = (p: string) => p.endsWith('package.json');
    assert.strictEqual(pickAnchorFile(ROOT, exists), path.join(ROOT, 'package.json'));
  });
  it('falls back to the workspace root', () => {
    assert.strictEqual(pickAnchorFile(ROOT, () => false), ROOT);
  });
});

describe('buildDiagnostics', () => {
  const map = buildDiagnostics(result, ROOT, 'info', () => false);

  it('places a located finding under its absolute file path, 0-based line', () => {
    const tools = map.get(path.resolve(ROOT, 'src/tools.py'));
    assert.ok(tools && tools.length === 1);
    assert.strictEqual(tools![0].line, 11); // CLI line 12 -> 0-based 11
    assert.strictEqual(tools![0].code, 'OAI-016');
    assert.strictEqual(tools![0].severity, 'high');
  });

  it('places a repo/META finding (empty file_path) on the anchor (root here)', () => {
    const repo = map.get(ROOT);
    assert.ok(repo && repo.length === 1);
    assert.strictEqual(repo![0].code, 'META-001');
    assert.strictEqual(repo![0].line, 0);
  });

  it('filters findings below minSeverity', () => {
    const high = buildDiagnostics(result, ROOT, 'high', () => false);
    assert.ok(!high.has(ROOT)); // META info dropped
    assert.ok(high.has(path.resolve(ROOT, 'src/tools.py')));
  });
});

describe('formatMessage', () => {
  it('joins title, explanation and a Fix line', () => {
    const msg = formatMessage(result.findings[0]);
    assert.ok(msg.includes('HTTP call without timeout'));
    assert.ok(msg.includes('Fix: Pass a timeout'));
  });
});

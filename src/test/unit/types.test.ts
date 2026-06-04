import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScanResult, SEVERITY_RANK } from '../../types';

const fixture = fs.readFileSync(
  path.join(__dirname, '../fixtures/sample-scan.json'), 'utf8');

describe('parseScanResult', () => {
  it('parses findings and surfaces from valid JSON', () => {
    const r = parseScanResult(fixture);
    assert.strictEqual(r.findings.length, 2);
    assert.strictEqual(r.findings[0].rule_id, 'OAI-016');
    assert.strictEqual(r.findings[0].severity, 'high');
    assert.strictEqual(r.surfaces.length, 2);
    assert.strictEqual(r.overall_score, 0.6);
    assert.strictEqual(r.coverage.files_skipped, 1);
  });

  it('treats null/absent findings as an empty array (clean scan → Go nil slice → null)', () => {
    // A repo with zero findings: the engine marshals the nil slice as `null`.
    assert.deepStrictEqual(parseScanResult('{"findings":null,"surfaces":[]}').findings, []);
    assert.deepStrictEqual(parseScanResult('{"repo":"x"}').findings, []);
  });

  it('throws on non-object JSON', () => {
    assert.throws(() => parseScanResult('null'), /expected a JSON object/);
    assert.throws(() => parseScanResult('42'), /expected a JSON object/);
    assert.throws(() => parseScanResult('"nope"'), /expected a JSON object/);
  });

  it('ranks severities low to high', () => {
    assert.ok(SEVERITY_RANK.critical > SEVERITY_RANK.medium);
    assert.ok(SEVERITY_RANK.medium > SEVERITY_RANK.info);
  });
});

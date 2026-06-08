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
    assert.strictEqual(r.findings[0].start_line, 12);
    assert.strictEqual(r.surfaces.length, 2);
    assert.strictEqual(r.overall_score, 0.6);
    assert.strictEqual(r.coverage.files_skipped, 1);
  });

  it('parses the dependency BOM and vulnerability matches', () => {
    const r = parseScanResult(fixture);
    assert.strictEqual(r.dependencies.length, 3);
    assert.strictEqual(r.dependencies[0].name, 'requests');
    assert.strictEqual(r.dependencies[0].ecosystem, 'pypi');
    assert.strictEqual(r.dependencies[0].start_line, 1);
    assert.strictEqual(r.vulnerabilities.length, 1);
    assert.strictEqual(r.vulnerabilities[0].id, 'GHSA-x84v-xcm2-53pg');
    assert.deepStrictEqual(r.vulnerabilities[0].aliases, ['CVE-2018-18074']);
    assert.strictEqual(r.vulnerabilities[0].dep.name, 'requests');
  });

  it('treats null/absent findings as an empty array (clean scan → Go nil slice → null)', () => {
    // A repo with zero findings: the engine marshals the nil slice as `null`.
    assert.deepStrictEqual(parseScanResult('{"findings":null,"surfaces":[]}').findings, []);
    assert.deepStrictEqual(parseScanResult('{"repo":"x"}').findings, []);
  });

  it('treats null/absent dependencies and vulnerabilities as empty arrays', () => {
    const r = parseScanResult('{"dependencies":null,"vulnerabilities":null}');
    assert.deepStrictEqual(r.dependencies, []);
    assert.deepStrictEqual(r.vulnerabilities, []);
    assert.deepStrictEqual(parseScanResult('{"repo":"x"}').dependencies, []);
    assert.deepStrictEqual(parseScanResult('{"repo":"x"}').vulnerabilities, []);
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

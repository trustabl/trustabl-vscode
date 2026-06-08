import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArgs, runScan } from '../../runner';

describe('buildArgs', () => {
  it('always uses json and no-progress', () => {
    const args = buildArgs('/repo', { cachedRules: true, timeoutMs: 1000 });
    assert.deepStrictEqual(args,
      ['scan', '/repo', '--format', 'json', '--no-progress', '--no-rules-update']);
  });
  it('omits --no-rules-update when cachedRules is false and adds flags', () => {
    const args = buildArgs('/repo', { cachedRules: false, detectors: 'claude_sdk', strict: true, timeoutMs: 1 });
    assert.ok(!args.includes('--no-rules-update'));
    assert.ok(args.includes('--detectors') && args.includes('claude_sdk'));
    assert.ok(args.includes('--strict'));
  });
  it('adds --vuln-scan only when vulnScan is set', () => {
    assert.ok(buildArgs('/repo', { cachedRules: true, timeoutMs: 1, vulnScan: true }).includes('--vuln-scan'));
    assert.ok(!buildArgs('/repo', { cachedRules: true, timeoutMs: 1 }).includes('--vuln-scan'));
  });
});

describe('runScan', () => {
  it('parses JSON on exit 1 (findings present is not a failure)', async () => {
    // Fake binary: a Node script that ignores args, prints the fixture, exits 1.
    const fixture = path.join(__dirname, '../fixtures/sample-scan.json');
    const script = path.join(os.tmpdir(), `fake-trustabl-${Date.now()}.js`);
    fs.writeFileSync(script,
      `process.stdout.write(require('fs').readFileSync(${JSON.stringify(fixture)}, 'utf8')); process.exit(1);`);
    const outcome = await runScan(process.execPath, os.tmpdir(),
      { cachedRules: true, timeoutMs: 10000 }, undefined, [script]);
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) { assert.strictEqual(outcome.result.findings.length, 2); }
    fs.unlinkSync(script);
  });

  it('treats exit 2 as a scan error', async () => {
    const script = path.join(os.tmpdir(), `fake-fail-${Date.now()}.js`);
    fs.writeFileSync(script, `process.stderr.write("boom"); process.exit(2);`);
    const outcome = await runScan(process.execPath, os.tmpdir(),
      { cachedRules: true, timeoutMs: 10000 }, undefined, [script]);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) { assert.strictEqual(outcome.kind, 'scan'); }
    fs.unlinkSync(script);
  });
});

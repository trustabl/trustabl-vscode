import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScanResult, ScanResult } from '../../types';
import {
  buildFindings, buildScores, buildHelp, buildDependencies, buildVulnerabilities,
  findingsCount, dependenciesCount, vulnerabilitiesCount,
} from '../../treeModel';

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
    assert.ok(labels.some((l) => l.includes('60%'))); // overall_score 0.6 -> 60%
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

describe('buildDependencies', () => {
  it('groups deps by ecosystem, sorted, with per-dep version and source', () => {
    const ecos = buildDependencies(result);
    const labels = ecos.map((n) => n.label);
    assert.deepStrictEqual(labels, ['npm (1)', 'pypi (2)']); // sorted, counted
    const pypi = ecos.find((n) => n.label.startsWith('pypi'))!;
    const names = pypi.children!.map((c) => c.label);
    assert.deepStrictEqual(names, ['flask@2.0.1', 'requests@2.19.0']); // sorted by name
    const requests = pypi.children!.find((c) => c.label.startsWith('requests'))!;
    assert.strictEqual(requests.file, 'requirements.txt');
    assert.strictEqual(requests.line, 1);
  });

  it('flags a vulnerable dependency with a warning icon and count', () => {
    const pypi = buildDependencies(result).find((n) => n.label.startsWith('pypi'))!;
    const requests = pypi.children!.find((c) => c.label.startsWith('requests'))!;
    const flask = pypi.children!.find((c) => c.label.startsWith('flask'))!;
    assert.strictEqual(requests.icon, 'warning');
    assert.ok(requests.description!.includes('1 vuln'));
    assert.strictEqual(flask.icon, undefined); // not vulnerable
  });

  it('is empty when there are no dependencies', () => {
    assert.strictEqual(buildDependencies({ ...result, dependencies: [] }).length, 0);
    assert.strictEqual(dependenciesCount({ ...result, dependencies: [] }), 0);
    assert.strictEqual(dependenciesCount(result), 3);
  });
});

describe('buildVulnerabilities', () => {
  it('groups by severity and labels each with the CVE alias', () => {
    const groups = buildVulnerabilities(result);
    assert.deepStrictEqual(groups.map((n) => n.label), ['high (1)']);
    const leaf = groups[0].children![0];
    assert.strictEqual(leaf.label, 'CVE-2018-18074'); // alias preferred over GHSA id
    assert.strictEqual(leaf.description, 'requests 2.19.0');
    assert.strictEqual(leaf.file, 'requirements.txt');
    assert.strictEqual(leaf.line, 1);
    assert.ok(leaf.vuln); // drives the detail panel
    assert.strictEqual(vulnerabilitiesCount(result), 1);
  });

  it('is empty (welcome view) when no vuln scan ran', () => {
    assert.strictEqual(buildVulnerabilities({ ...result, vulnerabilities: [] }).length, 0);
  });
});

describe('vulnerability findings are not duplicated in the Findings view', () => {
  // Under --vuln-scan the engine emits each match into findings[] (rule_id =
  // the CVE alias) AND vulnerabilities[]. buildFindings must drop the former.
  const withVulnFinding: ScanResult = {
    ...result,
    findings: [
      ...result.findings,
      {
        rule_id: 'CVE-2018-18074', category: '', scope: '', severity: 'high',
        tool_name: 'requests', file_path: 'requirements.txt', start_line: 1, end_line: 1,
        title: 'Vulnerable dependency', explanation: 'x', suggested_fix: '', confidence: 1,
      },
    ],
  };

  it('parseScanResult keeps the raw finding but buildFindings hides it', () => {
    assert.strictEqual(withVulnFinding.findings.length, 3);
    assert.strictEqual(findingsCount(withVulnFinding, 'info'), 2); // CVE finding filtered
    const allLabels = buildFindings(withVulnFinding, 'info', 'rule').flatMap((g) => g.label);
    assert.ok(!allLabels.some((l) => l.startsWith('CVE-2018-18074')));
  });
});

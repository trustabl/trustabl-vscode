import * as assert from 'assert';
import { renderFindingHtml, renderVulnHtml, escapeHtml } from '../../detailHtml';
import { DepVuln, Finding } from '../../types';

const base: Finding = {
  rule_id: 'OAI-016', category: 'openai_sdk', scope: 'tool', severity: 'high',
  tool_name: 'fetch_url', file_path: 'src/tools.py', start_line: 12, end_line: 12,
  title: 'HTTP call without timeout', explanation: 'No timeout <set>.',
  suggested_fix: 'Pass a timeout.', confidence: 0.9,
};

describe('escapeHtml', () => {
  it('escapes angle brackets, ampersands and quotes', () => {
    assert.strictEqual(escapeHtml('<a> & "b"'), '&lt;a&gt; &amp; &quot;b&quot;');
  });
});

describe('renderFindingHtml', () => {
  const html = renderFindingHtml(base, 'NONCE');

  it('includes title, escaped explanation, fix, rule id and confidence', () => {
    assert.ok(html.includes('HTTP call without timeout'));
    assert.ok(html.includes('No timeout &lt;set&gt;.'));
    assert.ok(html.includes('Pass a timeout.'));
    assert.ok(html.includes('OAI-016'));
    assert.ok(html.includes('90%'));
    assert.ok(html.includes('src/tools.py:12'));
  });

  it('gates scripts and styles with the nonce', () => {
    assert.ok(html.includes("'nonce-NONCE'"));
    assert.ok(html.includes('nonce="NONCE"'));
  });

  it('escapes a malicious field so it cannot inject markup', () => {
    const evil = { ...base, title: '<script>alert(1)</script>' };
    const out = renderFindingHtml(evil, 'N');
    assert.ok(!out.includes('<script>alert(1)</script>'));
    assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('omits the reveal button for repo-scope findings with no file', () => {
    const repo = { ...base, file_path: '', start_line: 0, end_line: 0 };
    const out = renderFindingHtml(repo, 'N');
    assert.ok(!out.includes('id="reveal"'));
    assert.ok(out.includes('repository'));
  });
});

const vuln: DepVuln = {
  dep: { name: 'requests', version: '2.19.0', ecosystem: 'pypi', source: 'requirements.txt', start_line: 1, end_line: 1 },
  id: 'GHSA-x84v-xcm2-53pg', aliases: ['CVE-2018-18074'],
  summary: 'Leaks Authorization on <redirect>.', severity: 'high', fixed_in: '2.20.0',
};

describe('renderVulnHtml', () => {
  const html = renderVulnHtml(vuln, 'NONCE');

  it('shows the package, the CVE alias, the OSV link, location and fix', () => {
    assert.ok(html.includes('requests 2.19.0'));
    assert.ok(html.includes('CVE-2018-18074'));
    assert.ok(html.includes('https://osv.dev/vulnerability/GHSA-x84v-xcm2-53pg'));
    assert.ok(html.includes('requirements.txt:1'));
    assert.ok(html.includes('Upgrade requests to 2.20.0 or later.'));
    assert.ok(html.includes('id="reveal"'));
  });

  it('gates scripts and styles with the nonce', () => {
    assert.ok(html.includes("'nonce-NONCE'"));
    assert.ok(html.includes('nonce="NONCE"'));
  });

  it('escapes the advisory summary so it cannot inject markup', () => {
    assert.ok(!html.includes('<redirect>'));
    assert.ok(html.includes('&lt;redirect&gt;'));
  });

  it('falls back to the OSV id and a no-fix note when there is no alias or fix', () => {
    const out = renderVulnHtml({ ...vuln, aliases: undefined, fixed_in: undefined }, 'N');
    assert.ok(out.includes('GHSA-x84v-xcm2-53pg'));
    assert.ok(out.includes('No fixed version is published'));
  });
});

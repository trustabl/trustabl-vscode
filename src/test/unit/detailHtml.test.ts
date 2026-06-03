import * as assert from 'assert';
import { renderFindingHtml, escapeHtml } from '../../detailHtml';
import { Finding } from '../../types';

const base: Finding = {
  rule_id: 'OAI-016', category: 'openai_sdk', scope: 'tool', severity: 'high',
  tool_name: 'fetch_url', file_path: 'src/tools.py', line: 12,
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
    const repo = { ...base, file_path: '', line: 0 };
    const out = renderFindingHtml(repo, 'N');
    assert.ok(!out.includes('id="reveal"'));
    assert.ok(out.includes('repository'));
  });
});

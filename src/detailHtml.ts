import { Finding, Severity } from './types';

export function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

const SEV_COLOR: Record<Severity, string> = {
  critical: 'var(--vscode-errorForeground)',
  high: 'var(--vscode-errorForeground)',
  medium: 'var(--vscode-editorWarning-foreground)',
  low: 'var(--vscode-editorInfo-foreground)',
  info: 'var(--vscode-descriptionForeground)',
};

// Pure: render a finding to a self-contained webview HTML document. All
// finding-derived text is HTML-escaped; scripts/styles are nonce-gated by CSP.
export function renderFindingHtml(f: Finding, nonce: string): string {
  const location = f.file_path
    ? escapeHtml(f.file_path) + (f.line > 0 ? ':' + f.line : '')
    : 'repository';
  const confidence = Math.round((f.confidence ?? 0) * 100) + '%';
  const docUrl = 'https://github.com/trustabl/trustabl-rulebook/search?q=' + encodeURIComponent(f.rule_id);
  const surfaceRow = f.tool_name
    ? '<div class="meta"><span class="k">Surface</span><span>' + escapeHtml(f.tool_name) + '</span></div>'
    : '';
  const fixBlock = f.suggested_fix
    ? '<h3>Suggested fix</h3><p>' + escapeHtml(f.suggested_fix) + '</p>'
    : '';
  const revealBtn = f.file_path ? '<button id="reveal">Reveal in editor</button>' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 6px 16px; }
  h1 { font-size: 1.25em; margin: .35em 0 .1em; }
  h3 { font-size: 1em; margin: 1.3em 0 .3em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 3px; }
  .sev { font-weight: 700; text-transform: uppercase; font-size: .78em; letter-spacing: .04em; }
  .meta { display: flex; gap: 10px; margin: 3px 0; font-size: .92em; }
  .meta .k { color: var(--vscode-descriptionForeground); min-width: 92px; }
  p { line-height: 1.5; white-space: pre-wrap; margin: .4em 0; }
  a { color: var(--vscode-textLink-foreground); }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; padding: 6px 12px; margin-top: 14px; cursor: pointer; border-radius: 2px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <div class="sev" style="color:${SEV_COLOR[f.severity]}">${escapeHtml(f.severity)}</div>
  <h1>${escapeHtml(f.title || f.rule_id)}</h1>
  <div class="meta"><span class="k">Rule</span><a href="${docUrl}">${escapeHtml(f.rule_id)}</a></div>
  <div class="meta"><span class="k">Scope</span><span>${escapeHtml(f.scope || 'meta')}</span></div>
  <div class="meta"><span class="k">Confidence</span><span>${confidence}</span></div>
  ${surfaceRow}
  <div class="meta"><span class="k">Location</span><span>${location}</span></div>
  <h3>What's wrong</h3>
  <p>${escapeHtml(f.explanation)}</p>
  ${fixBlock}
  ${revealBtn}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const b = document.getElementById('reveal');
    if (b) { b.addEventListener('click', () => vscode.postMessage({ type: 'reveal' })); }
  </script>
</body>
</html>`;
}

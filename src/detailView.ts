import * as vscode from 'vscode';
import * as path from 'path';
import { DepVuln, Finding } from './types';
import { renderFindingHtml, renderVulnHtml } from './detailHtml';

let panel: vscode.WebviewPanel | undefined;
// What "Reveal in editor/manifest" should jump to for the panel's current
// content — a 1-indexed line in a repo-relative file (0 = top of file).
let revealTarget: { file_path: string; line: number } | undefined;
let root = '';

export function setRoot(r: string): void {
  root = r;
}

function makeNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ensurePanel(): vscode.WebviewPanel {
  if (panel) return panel;
  panel = vscode.window.createWebviewPanel(
    'trustablDetail',
    'Trustabl',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.onDidDispose(() => { panel = undefined; });
  panel.webview.onDidReceiveMessage((msg: { type?: string }) => {
    if (msg?.type === 'reveal' && revealTarget?.file_path) {
      const abs = path.resolve(root, revealTarget.file_path);
      const line = revealTarget.line > 0 ? revealTarget.line - 1 : 0;
      void vscode.window.showTextDocument(vscode.Uri.file(abs), {
        selection: new vscode.Range(line, 0, line, 0),
      });
    }
  });
  return panel;
}

// Open (or reuse) the single detail panel showing the given finding.
export function showFinding(finding: Finding): void {
  revealTarget = { file_path: finding.file_path, line: finding.start_line };
  const p = ensurePanel();
  p.title = `Trustabl: ${finding.rule_id}`;
  p.webview.html = renderFindingHtml(finding, makeNonce());
  p.reveal(vscode.ViewColumn.Beside, true);
}

// Open (or reuse) the single detail panel showing the given vulnerability.
export function showVuln(vuln: DepVuln): void {
  revealTarget = { file_path: vuln.dep.source, line: vuln.dep.start_line };
  const id = vuln.aliases && vuln.aliases.length > 0 ? vuln.aliases[0] : vuln.id;
  const p = ensurePanel();
  p.title = `Trustabl: ${id}`;
  p.webview.html = renderVulnHtml(vuln, makeNonce());
  p.reveal(vscode.ViewColumn.Beside, true);
}

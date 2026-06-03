import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from './types';
import { renderFindingHtml } from './detailHtml';

let panel: vscode.WebviewPanel | undefined;
let current: Finding | undefined;
let root = '';

export function setRoot(r: string): void {
  root = r;
}

function makeNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Open (or reuse) a single webview panel showing the given finding's details.
export function showFinding(finding: Finding): void {
  current = finding;
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'trustablFinding',
      'Trustabl Finding',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.onDidDispose(() => { panel = undefined; });
    panel.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === 'reveal' && current?.file_path) {
        const abs = path.resolve(root, current.file_path);
        const line = current.line > 0 ? current.line - 1 : 0;
        void vscode.window.showTextDocument(vscode.Uri.file(abs), {
          selection: new vscode.Range(line, 0, line, 0),
        });
      }
    });
  }
  panel.title = `Trustabl: ${finding.rule_id}`;
  panel.webview.html = renderFindingHtml(finding, makeNonce());
  panel.reveal(vscode.ViewColumn.Beside, true);
}

import * as vscode from 'vscode';
import { Severity } from './types';
import { DiagnosticInput } from './diagnostics';

export function toVSCodeSeverity(s: Severity): vscode.DiagnosticSeverity {
  switch (s) {
    case 'critical':
    case 'high': return vscode.DiagnosticSeverity.Error;
    case 'medium': return vscode.DiagnosticSeverity.Warning;
    case 'low': return vscode.DiagnosticSeverity.Information;
    default: return vscode.DiagnosticSeverity.Hint;
  }
}

export function publishDiagnostics(
  collection: vscode.DiagnosticCollection,
  byFile: Map<string, DiagnosticInput[]>,
): void {
  collection.clear();
  for (const [file, inputs] of byFile) {
    const diags = inputs.map((i) => {
      const range = new vscode.Range(i.line, 0, i.line, Number.MAX_SAFE_INTEGER);
      const d = new vscode.Diagnostic(range, i.message, toVSCodeSeverity(i.severity));
      d.code = i.code;
      d.source = 'Trustabl';
      return d;
    });
    collection.set(vscode.Uri.file(file), diags);
  }
}

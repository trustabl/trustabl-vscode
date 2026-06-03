import * as fs from 'fs';
import * as path from 'path';
import { Finding, ScanResult, Severity, SEVERITY_RANK } from './types';

export interface DiagnosticInput {
  file: string;     // absolute path
  line: number;     // 0-based, for a vscode Range
  severity: Severity;
  code: string;
  message: string;
}

const ANCHOR_CANDIDATES = ['pyproject.toml', 'package.json', 'requirements.txt', 'go.mod', 'README.md'];

// Repo/META findings have no file_path; anchor them to a real file so they
// still appear in the Problems panel. Deterministic: first existing candidate.
export function pickAnchorFile(workspaceRoot: string, exists: (p: string) => boolean = fs.existsSync): string {
  for (const c of ANCHOR_CANDIDATES) {
    const p = path.join(workspaceRoot, c);
    if (exists(p)) return p;
  }
  return workspaceRoot;
}

export function formatMessage(f: Finding): string {
  const parts: string[] = [];
  if (f.title) parts.push(f.title);
  if (f.explanation && f.explanation !== f.title) parts.push(f.explanation);
  if (f.suggested_fix) parts.push(`Fix: ${f.suggested_fix}`);
  return parts.join('\n\n');
}

export function buildDiagnostics(
  result: ScanResult,
  workspaceRoot: string,
  minSeverity: Severity = 'info',
  exists: (p: string) => boolean = fs.existsSync,
): Map<string, DiagnosticInput[]> {
  const byFile = new Map<string, DiagnosticInput[]>();
  const anchor = pickAnchorFile(workspaceRoot, exists);
  const floor = SEVERITY_RANK[minSeverity];

  for (const f of result.findings) {
    if (SEVERITY_RANK[f.severity] < floor) continue;
    const hasLoc = !!f.file_path;
    const file = hasLoc ? path.resolve(workspaceRoot, f.file_path) : anchor;
    const line = hasLoc && f.line > 0 ? f.line - 1 : 0; // CLI lines are 1-based
    const entry: DiagnosticInput = {
      file, line, severity: f.severity, code: f.rule_id, message: formatMessage(f),
    };
    const list = byFile.get(file);
    if (list) { list.push(entry); } else { byFile.set(file, [entry]); }
  }
  return byFile;
}

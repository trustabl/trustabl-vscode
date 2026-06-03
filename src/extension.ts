import * as vscode from 'vscode';
import { readConfig, toScanOptions } from './config';
import { resolveBinary, BinaryUnavailableError } from './binary';
import { runScan } from './runner';
import { Canceller } from './process';
import { buildDiagnostics } from './diagnostics';
import { publishDiagnostics } from './diagnosticsView';
import { FindingsTreeProvider } from './treeView';

const RELEVANT = /\.(py|ts|tsx|mts|cts)$|\.claude[\\/]agents[\\/].*\.md$|(pyproject\.toml|requirements\.txt|Pipfile|poetry\.lock|package\.json|go\.mod)$/;

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let tree: FindingsTreeProvider;
let debounceTimer: NodeJS.Timeout | undefined;
let inFlight: { cancel: () => void } | undefined;
let rulesWarmed = false;

export function activate(ctx: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('trustabl');
  output = vscode.window.createOutputChannel('Trustabl');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.text = 'Trustabl';
  status.show();

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  tree = new FindingsTreeProvider(root);

  ctx.subscriptions.push(
    diagnostics, output, status,
    vscode.window.registerTreeDataProvider('trustablFindings', tree),
    vscode.commands.registerCommand('trustabl.scanWorkspace', () => scan(ctx, false)),
    vscode.commands.registerCommand('trustabl.refreshRules', () => scan(ctx, true)),
    vscode.workspace.onDidSaveTextDocument((doc) => onSave(ctx, doc)),
  );
}

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  inFlight?.cancel();
}

function onSave(ctx: vscode.ExtensionContext, doc: vscode.TextDocument): void {
  const cfg = readConfig();
  if (!cfg.scanOnSave) return;
  if (!RELEVANT.test(doc.fileName)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scan(ctx, false), 750);
}

async function scan(ctx: vscode.ExtensionContext, freshRules: boolean): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const root = folder.uri.fsPath;
  const cfg = readConfig();

  // Supersede any in-flight scan.
  inFlight?.cancel();
  let cancelled = false;
  const token: Canceller = { onCancel: (cb) => { inFlight = { cancel: () => { cancelled = true; cb(); } }; } };

  status.text = '$(sync~spin) Trustabl: scanning';

  let binary: string;
  try {
    binary = await resolveBinary(ctx, cfg.path);
  } catch (e) {
    status.text = '$(error) Trustabl';
    const msg = e instanceof BinaryUnavailableError ? e.message : String(e);
    output.appendLine(`binary error: ${msg}`);
    vscode.window.showErrorMessage(`Trustabl: ${msg}`, 'Install Instructions').then((pick) => {
      if (pick) vscode.env.openExternal(vscode.Uri.parse('https://github.com/trustabl/trustabl#install'));
    });
    return;
  }

  // First scan of the session fetches rules; later on-save scans use the cache.
  const cachedRules = !freshRules && rulesWarmed;
  const outcome = await runScan(binary, root, toScanOptions(cfg, cachedRules), token);
  if (cancelled) return;
  inFlight = undefined;

  if (!outcome.ok) {
    status.text = '$(error) Trustabl';
    output.appendLine(`scan ${outcome.kind}: ${outcome.error}`);
    if (outcome.kind === 'scan' && /no usable rules/i.test(outcome.error)) {
      vscode.window.showWarningMessage('Trustabl: no usable rules. Run "Trustabl: Refresh Rules and Scan" with a network connection.');
    }
    return;
  }

  rulesWarmed = true;
  const map = buildDiagnostics(outcome.result, root, cfg.minSeverity);
  publishDiagnostics(diagnostics, map);
  tree.update(outcome.result, cfg.minSeverity);

  const total = outcome.result.findings.length;
  status.text = total > 0 ? `$(warning) Trustabl: ${total}` : '$(check) Trustabl';
  if (outcome.result.coverage.files_skipped > 0) {
    output.appendLine(`note: ${outcome.result.coverage.files_skipped} file(s) skipped; findings may be incomplete`);
  }
}

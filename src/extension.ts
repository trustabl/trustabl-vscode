import * as vscode from 'vscode';
import { readConfig, toScanOptions } from './config';
import { resolveBinary, BinaryUnavailableError } from './binary';
import { runScan } from './runner';
import { Canceller } from './process';
import { buildDiagnostics } from './diagnostics';
import { publishDiagnostics } from './diagnosticsView';
import { NodeTreeProvider } from './treeView';
import { buildFindings, buildScores, buildHelp, findingsCount, TreeNode } from './treeModel';
import { Finding, GroupBy, ScanResult, Severity } from './types';
import { showFinding, setRoot as setDetailRoot } from './detailView';

const RELEVANT = /\.(py|ts|tsx|mts|cts)$|\.claude[\\/]agents[\\/].*\.md$|(pyproject\.toml|requirements\.txt|Pipfile|poetry\.lock|package\.json|go\.mod)$/;

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let findings: NodeTreeProvider;
let scores: NodeTreeProvider;
let findingsView: vscode.TreeView<TreeNode>;
let debounceTimer: NodeJS.Timeout | undefined;
let inFlight: { cancel: () => void } | undefined;
let rulesWarmed = false;
let lastResult: ScanResult | undefined;
let currentRoot = '';

export function activate(ctx: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('trustabl');
  output = vscode.window.createOutputChannel('Trustabl');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.text = 'Trustabl';
  status.tooltip = 'Run a Trustabl scan';
  status.command = 'trustabl.scanWorkspace';
  status.show();

  currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  findings = new NodeTreeProvider(currentRoot);
  scores = new NodeTreeProvider(currentRoot);
  const help = new NodeTreeProvider(currentRoot);
  help.setNodes(buildHelp());
  findingsView = vscode.window.createTreeView('trustablFindings', { treeDataProvider: findings });
  const scoresView = vscode.window.createTreeView('trustablScores', { treeDataProvider: scores });
  const helpView = vscode.window.createTreeView('trustablHelp', { treeDataProvider: help });
  setDetailRoot(currentRoot);

  ctx.subscriptions.push(
    diagnostics, output, status, findingsView, scoresView, helpView,
    vscode.commands.registerCommand('trustabl.scanWorkspace', () => scan(ctx, false, false)),
    vscode.commands.registerCommand('trustabl.refreshRules', () => scan(ctx, true, false)),
    vscode.commands.registerCommand('trustabl.showFinding', (f: Finding) => showFinding(f)),
    vscode.commands.registerCommand('trustabl.groupBy', () => pickGroupBy()),
    vscode.workspace.onDidSaveTextDocument((doc) => onSave(ctx, doc)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => maybeAutoScan(ctx)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('trustabl.groupBy') || e.affectsConfiguration('trustabl.minSeverity')) {
        rerender();
      }
    }),
  );

  output.appendLine('Trustabl: extension activated.');
  maybeAutoScan(ctx);
}

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  inFlight?.cancel();
}

function render(result: ScanResult, minSeverity: Severity, groupBy: GroupBy): void {
  publishDiagnostics(diagnostics, buildDiagnostics(result, currentRoot, minSeverity));
  findings.setNodes(buildFindings(result, minSeverity, groupBy));
  scores.setNodes(buildScores(result));
  const n = findingsCount(result, minSeverity);
  findingsView.badge = n > 0 ? { value: n, tooltip: `${n} Trustabl finding(s)` } : undefined;
  findingsView.description = n > 0 ? `${n}` : undefined;
}

// Re-render from the last scan (e.g. when grouping / min-severity changes).
function rerender(): void {
  if (!lastResult) return;
  const cfg = readConfig();
  render(lastResult, cfg.minSeverity, cfg.groupBy);
}

async function pickGroupBy(): Promise<void> {
  const items: Array<vscode.QuickPickItem & { value: string }> = [
    { label: 'Severity', value: 'severity' },
    { label: 'File', value: 'file' },
    { label: 'Scope', value: 'scope' },
    { label: 'Rule', value: 'rule' },
  ];
  const choice = await vscode.window.showQuickPick(items, { placeHolder: 'Group Trustabl findings by…' });
  if (choice) {
    await vscode.workspace.getConfiguration('trustabl')
      .update('groupBy', choice.value, vscode.ConfigurationTarget.Workspace);
  }
}

function maybeAutoScan(ctx: vscode.ExtensionContext): void {
  const cfg = readConfig();
  if (!cfg.scanOnOpen) return;
  if (!vscode.workspace.workspaceFolders?.length) {
    output.appendLine('Trustabl: no folder open at startup; will scan when a folder is opened.');
    return;
  }
  void scan(ctx, false, true);
}

function onSave(ctx: vscode.ExtensionContext, doc: vscode.TextDocument): void {
  const cfg = readConfig();
  if (!cfg.scanOnSave) return;
  if (!RELEVANT.test(doc.fileName)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scan(ctx, false, true), 750);
}

async function scan(ctx: vscode.ExtensionContext, freshRules: boolean, auto: boolean): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    output.appendLine('Trustabl: no workspace folder open; nothing to scan.');
    if (!auto) vscode.window.showInformationMessage('Trustabl: open a folder to scan a repo.');
    return;
  }
  const root = folder.uri.fsPath;
  currentRoot = root;
  findings.setRoot(root);
  scores.setRoot(root);
  setDetailRoot(root);
  const cfg = readConfig();

  inFlight?.cancel();
  let cancelled = false;
  const token: Canceller = { onCancel: (cb) => { inFlight = { cancel: () => { cancelled = true; cb(); } }; } };

  status.text = '$(sync~spin) Trustabl: scanning';

  let binary: string;
  try {
    binary = await resolveBinary(ctx, cfg.path);
  } catch (e) {
    status.text = '$(error) Trustabl';
    findingsView.badge = undefined;
    const msg = e instanceof BinaryUnavailableError ? e.message : String(e);
    output.appendLine(`Trustabl: binary error: ${msg}`);
    vscode.window.showErrorMessage(`Trustabl: ${msg}`, 'Install Instructions').then((pick) => {
      if (pick) vscode.env.openExternal(vscode.Uri.parse('https://github.com/trustabl/trustabl#install'));
    });
    return;
  }

  const cachedRules = !freshRules && rulesWarmed;
  output.appendLine(`Trustabl: scanning ${root} (rules: ${cachedRules ? 'cached' : 'fetch'}; binary: ${binary})`);
  const outcome = await runScan(binary, root, toScanOptions(cfg, cachedRules), token);
  if (cancelled) return;
  inFlight = undefined;

  if (!outcome.ok) {
    status.text = '$(error) Trustabl';
    findingsView.badge = undefined;
    output.appendLine(`Trustabl: scan ${outcome.kind}: ${outcome.error}`);
    if (outcome.kind === 'scan' && /no usable rules/i.test(outcome.error)) {
      vscode.window.showWarningMessage('Trustabl: no usable rules. Run "Trustabl: Refresh Rules and Scan" with a network connection.');
    } else if (!auto) {
      vscode.window.showErrorMessage(`Trustabl scan failed (${outcome.kind}): ${outcome.error}`);
    }
    return;
  }

  rulesWarmed = true;
  lastResult = outcome.result;
  render(outcome.result, cfg.minSeverity, cfg.groupBy);

  const n = findingsCount(outcome.result, cfg.minSeverity);
  status.text = n > 0 ? `$(warning) Trustabl: ${n}` : '$(check) Trustabl';
  output.appendLine(`Trustabl: done, ${outcome.result.findings.length} finding(s).`);
  if (outcome.result.coverage.files_skipped > 0) {
    output.appendLine(`Trustabl: note: ${outcome.result.coverage.files_skipped} file(s) skipped; findings may be incomplete.`);
  }
}

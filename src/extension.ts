import * as vscode from 'vscode';
import { readConfig, toScanOptions } from './config';
import { resolveBinary, BinaryUnavailableError } from './binary';
import { runScan } from './runner';
import { Canceller } from './process';
import { buildDiagnostics } from './diagnostics';
import { publishDiagnostics } from './diagnosticsView';
import { NodeTreeProvider } from './treeView';
import {
  buildFindings, buildScores, buildHelp, buildDependencies, buildVulnerabilities,
  findingsCount, dependenciesCount, vulnerabilitiesCount, TreeNode,
} from './treeModel';
import { DepVuln, Finding, GroupBy, ScanResult, Severity } from './types';
import { showFinding, showVuln, setRoot as setDetailRoot } from './detailView';

const RELEVANT = /\.(py|ts|tsx|mts|cts|csproj)$|\.claude[\\/]agents[\\/].*\.md$|(pyproject\.toml|requirements\.txt|Pipfile|poetry\.lock|package\.json|go\.mod|Cargo\.toml|composer\.json)$/;

// First-run --vuln-scan downloads the OSV database, which can exceed the normal
// scan timeout; give the vuln path at least this long.
const VULN_MIN_TIMEOUT_MS = 300_000;

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let findings: NodeTreeProvider;
let scores: NodeTreeProvider;
let deps: NodeTreeProvider;
let vulns: NodeTreeProvider;
let findingsView: vscode.TreeView<TreeNode>;
let depsView: vscode.TreeView<TreeNode>;
let vulnsView: vscode.TreeView<TreeNode>;
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
  deps = new NodeTreeProvider(currentRoot);
  vulns = new NodeTreeProvider(currentRoot);
  const help = new NodeTreeProvider(currentRoot);
  help.setNodes(buildHelp());
  findingsView = vscode.window.createTreeView('trustablFindings', { treeDataProvider: findings });
  const scoresView = vscode.window.createTreeView('trustablScores', { treeDataProvider: scores });
  depsView = vscode.window.createTreeView('trustablDependencies', { treeDataProvider: deps });
  vulnsView = vscode.window.createTreeView('trustablVulnerabilities', { treeDataProvider: vulns });
  const helpView = vscode.window.createTreeView('trustablHelp', { treeDataProvider: help });
  setDetailRoot(currentRoot);

  ctx.subscriptions.push(
    diagnostics, output, status, findingsView, scoresView, depsView, vulnsView, helpView,
    vscode.commands.registerCommand('trustabl.scanWorkspace', () => scan(ctx, false, false, false)),
    vscode.commands.registerCommand('trustabl.refreshRules', () => scan(ctx, true, false, false)),
    vscode.commands.registerCommand('trustabl.scanWithVulns', () => scan(ctx, false, false, true)),
    vscode.commands.registerCommand('trustabl.showFinding', (f: Finding) => showFinding(f)),
    vscode.commands.registerCommand('trustabl.showVuln', (v: DepVuln) => showVuln(v)),
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
  deps.setNodes(buildDependencies(result));
  vulns.setNodes(buildVulnerabilities(result));

  const n = findingsCount(result, minSeverity);
  findingsView.badge = n > 0 ? { value: n, tooltip: `${n} Trustabl finding(s)` } : undefined;
  findingsView.description = n > 0 ? `${n}` : undefined;

  const d = dependenciesCount(result);
  depsView.description = d > 0 ? `${d}` : undefined;

  const v = vulnerabilitiesCount(result);
  vulnsView.badge = v > 0 ? { value: v, tooltip: `${v} known vulnerability(ies)` } : undefined;
  vulnsView.description = v > 0 ? `${v}` : undefined;
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
  void scan(ctx, false, true, false);
}

function onSave(ctx: vscode.ExtensionContext, doc: vscode.TextDocument): void {
  const cfg = readConfig();
  if (!cfg.scanOnSave) return;
  if (!RELEVANT.test(doc.fileName)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scan(ctx, false, true, false), 750);
}

// vuln=true forces --vuln-scan for this run (the "Scan with Vulnerabilities"
// command); otherwise the configured trustabl.vulnScan setting decides.
async function scan(ctx: vscode.ExtensionContext, freshRules: boolean, auto: boolean, vuln: boolean): Promise<void> {
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
  deps.setRoot(root);
  vulns.setRoot(root);
  setDetailRoot(root);
  const cfg = readConfig();
  const wantVuln = vuln || cfg.vulnScan;

  inFlight?.cancel();
  let cancelled = false;
  const token: Canceller = { onCancel: (cb) => { inFlight = { cancel: () => { cancelled = true; cb(); } }; } };

  status.text = wantVuln ? '$(sync~spin) Trustabl: scanning (vulns)' : '$(sync~spin) Trustabl: scanning';

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
  const opts = toScanOptions(cfg, cachedRules, wantVuln);
  if (wantVuln) opts.timeoutMs = Math.max(opts.timeoutMs, VULN_MIN_TIMEOUT_MS);
  output.appendLine(`Trustabl: scanning ${root} (rules: ${cachedRules ? 'cached' : 'fetch'}; vulns: ${wantVuln ? 'on' : 'off'}; binary: ${binary})`);
  const outcome = await runScan(binary, root, opts, token);
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
  const v = vulnerabilitiesCount(outcome.result);
  status.text = n > 0 || v > 0 ? `$(warning) Trustabl: ${n}${v > 0 ? ` (${v} vuln)` : ''}` : '$(check) Trustabl';
  output.appendLine(`Trustabl: done, ${outcome.result.findings.length} finding(s)${wantVuln ? `, ${v} vulnerability(ies)` : ''}.`);
  if (outcome.result.coverage.files_skipped > 0) {
    output.appendLine(`Trustabl: note: ${outcome.result.coverage.files_skipped} file(s) skipped; findings may be incomplete.`);
  }
}

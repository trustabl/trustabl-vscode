import { Finding, GroupBy, ScanResult, Severity, SEVERITY_RANK } from './types';

export interface TreeNode {
  label: string;
  description?: string;
  // Location to reveal on click (relative to the workspace root), if any.
  file?: string;
  line?: number;
  // External URL to open on click, if any (Help links).
  url?: string;
  // Codicon id for the item, if any.
  icon?: string;
  // The underlying finding for finding leaf nodes; drives the detail panel.
  finding?: Finding;
  children?: TreeNode[];
}

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function findingNode(f: Finding): TreeNode {
  return {
    label: f.rule_id,
    description: f.title,
    file: f.file_path || undefined,
    line: f.line || undefined,
    finding: f,
  };
}

function shownFindings(result: ScanResult, minSeverity: Severity): Finding[] {
  const floor = SEVERITY_RANK[minSeverity];
  return result.findings
    .filter((f) => SEVERITY_RANK[f.severity] >= floor)
    .sort((a, b) =>
      (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
      a.rule_id.localeCompare(b.rule_id) ||
      a.file_path.localeCompare(b.file_path) ||
      (a.line - b.line));
}

function groupFindings(findings: Finding[], groupBy: GroupBy): TreeNode[] {
  if (groupBy === 'severity') {
    const out: TreeNode[] = [];
    for (const sev of ORDER) {
      const items = findings.filter((f) => f.severity === sev);
      if (items.length) out.push({ label: `${sev} (${items.length})`, children: items.map(findingNode) });
    }
    return out;
  }
  const keyOf = (f: Finding): string =>
    groupBy === 'file' ? (f.file_path || '(repository)') :
    groupBy === 'scope' ? (f.scope || 'meta') :
    f.rule_id;
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = keyOf(f);
    const arr = groups.get(k);
    if (arr) { arr.push(f); } else { groups.set(k, [f]); }
  }
  return [...groups.keys()].sort().map((k) => ({
    label: `${k} (${groups.get(k)!.length})`,
    children: groups.get(k)!.map(findingNode),
  }));
}

export function findingsCount(result: ScanResult, minSeverity: Severity): number {
  return shownFindings(result, minSeverity).length;
}

// Top-level nodes for the Findings view. Empty array -> the view's welcome shows.
export function buildFindings(result: ScanResult, minSeverity: Severity, groupBy: GroupBy = 'severity'): TreeNode[] {
  return groupFindings(shownFindings(result, minSeverity), groupBy);
}

// Top-level nodes for the Scores view.
export function buildScores(result: ScanResult): TreeNode[] {
  const nodes: TreeNode[] = [
    { label: `Overall readiness: ${result.overall_score.toFixed(2)}`, icon: 'dashboard' },
    ...result.surfaces.map((s) => ({
      label: `${s.kind}${s.name ? ' ' + s.name : ''}: ${s.score.toFixed(2)}`,
      description: `${s.finding_count} finding(s)`,
      file: s.file_path || undefined,
      icon: 'symbol-number',
    })),
  ];
  if (result.coverage.files_skipped > 0) {
    nodes.push({
      label: `${result.coverage.files_skipped} file(s) skipped`,
      description: 'findings may be incomplete',
      icon: 'warning',
    });
  }
  return nodes;
}

// Static links for the Help & Feedback view.
export function buildHelp(): TreeNode[] {
  return [
    { label: 'Documentation', icon: 'book', url: 'https://github.com/trustabl/trustabl#readme' },
    { label: 'Rule docs (rulebook)', icon: 'law', url: 'https://github.com/trustabl/trustabl-rulebook' },
    { label: 'Report a Bug', icon: 'bug', url: 'https://github.com/trustabl/trustabl-vscode/issues/new' },
    { label: 'Trustabl on GitHub', icon: 'github', url: 'https://github.com/trustabl/trustabl' },
  ];
}

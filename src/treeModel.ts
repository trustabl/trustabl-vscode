import { Finding, GroupBy, ScanResult, Severity, SEVERITY_RANK } from './types';

export interface TreeNode {
  label: string;
  description?: string;
  // Location to reveal on click, if any.
  file?: string;
  line?: number;
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

function groupFindings(findings: Finding[], groupBy: GroupBy): TreeNode[] {
  if (groupBy === 'severity') {
    const out: TreeNode[] = [];
    for (const sev of ORDER) {
      const items = findings.filter((f) => f.severity === sev);
      if (items.length) out.push({ label: `${sev} (${items.length})`, children: items.map(findingNode) });
    }
    return out;
  }
  const keyOf = (f: Finding): string => {
    if (groupBy === 'file') return f.file_path || '(repository)';
    if (groupBy === 'scope') return f.scope || 'meta';
    return f.rule_id; // 'rule'
  };
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

export function buildTree(result: ScanResult, minSeverity: Severity, groupBy: GroupBy = 'severity'): TreeNode[] {
  const floor = SEVERITY_RANK[minSeverity];
  const shown = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= floor);
  // Deterministic order within groups: severity desc, then rule, file, line.
  shown.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    a.rule_id.localeCompare(b.rule_id) ||
    a.file_path.localeCompare(b.file_path) ||
    (a.line - b.line));

  const scoreChildren: TreeNode[] = [
    { label: `Overall: ${result.overall_score.toFixed(2)}` },
    ...result.surfaces.map((s) => ({
      label: `${s.kind}${s.name ? ' ' + s.name : ''}: ${s.score.toFixed(2)}`,
      description: `${s.finding_count} finding(s)`,
      file: s.file_path || undefined,
    })),
  ];

  const roots: TreeNode[] = [
    { label: `Findings (${shown.length})`, children: groupFindings(shown, groupBy) },
    { label: 'Scores', children: scoreChildren },
  ];
  if (result.coverage.files_skipped > 0) {
    roots.push({
      label: `Incomplete: ${result.coverage.files_skipped} file(s) skipped`,
      description: 'findings may be incomplete',
    });
  }
  return roots;
}

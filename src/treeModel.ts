import { ScanResult, Severity, SEVERITY_RANK } from './types';

export interface TreeNode {
  label: string;
  description?: string;
  // Location to reveal on click, if any.
  file?: string;
  line?: number;
  children?: TreeNode[];
}

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function buildTree(result: ScanResult, minSeverity: Severity): TreeNode[] {
  const floor = SEVERITY_RANK[minSeverity];
  const shown = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= floor);

  const severityBuckets: TreeNode[] = [];
  for (const sev of ORDER) {
    const items = shown.filter((f) => f.severity === sev);
    if (items.length === 0) continue;
    severityBuckets.push({
      label: `${sev} (${items.length})`,
      children: items.map((f) => ({
        label: f.rule_id,
        description: f.title,
        file: f.file_path || undefined,
        line: f.line || undefined,
      })),
    });
  }

  const scoreChildren: TreeNode[] = [
    { label: `Overall: ${result.overall_score.toFixed(2)}` },
    ...result.surfaces.map((s) => ({
      label: `${s.kind}${s.name ? ' ' + s.name : ''}: ${s.score.toFixed(2)}`,
      description: `${s.finding_count} finding(s)`,
      file: s.file_path || undefined,
    })),
  ];

  const roots: TreeNode[] = [
    { label: 'Findings', children: severityBuckets },
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

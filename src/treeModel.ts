import { DepRef, DepVuln, Finding, GroupBy, ScanResult, Severity, SEVERITY_RANK } from './types';

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
  // Tooltip override (otherwise derived from finding/vuln when present).
  tooltip?: string;
  // The underlying finding for finding leaf nodes; drives the detail panel.
  finding?: Finding;
  // The underlying vulnerability for vuln leaf nodes; drives the detail panel.
  vuln?: DepVuln;
  children?: TreeNode[];
}

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function findingNode(f: Finding): TreeNode {
  return {
    label: f.rule_id,
    description: f.title,
    file: f.file_path || undefined,
    line: f.start_line || undefined,
    finding: f,
  };
}

// Rule ids of the synthesized vulnerability findings. Under --vuln-scan the
// engine emits each OSV match into findings[] *and* vulnerabilities[]; the
// finding's rule_id is the CVE alias (or the OSV id). We keep these out of the
// Findings view so a CVE is not listed twice (it lives in the Vulnerabilities
// view). No real detection rule carries a CVE/GHSA/PYSEC id, so this never
// removes a genuine rule finding.
function vulnFindingIds(result: ScanResult): Set<string> {
  const ids = new Set<string>();
  for (const v of result.vulnerabilities) {
    if (v.id) ids.add(v.id);
    for (const a of v.aliases ?? []) ids.add(a);
  }
  return ids;
}

function shownFindings(result: ScanResult, minSeverity: Severity): Finding[] {
  const floor = SEVERITY_RANK[minSeverity];
  const vulnIds = vulnFindingIds(result);
  return result.findings
    .filter((f) => SEVERITY_RANK[f.severity] >= floor && !vulnIds.has(f.rule_id))
    .sort((a, b) =>
      (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
      a.rule_id.localeCompare(b.rule_id) ||
      a.file_path.localeCompare(b.file_path) ||
      (a.start_line - b.start_line));
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
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const nodes: TreeNode[] = [
    { label: `Overall readiness: ${pct(result.overall_score)}`, icon: 'dashboard' },
    ...result.surfaces.map((s) => ({
      label: `${s.kind}${s.name ? ' ' + s.name : ''}: ${pct(s.score)}`,
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

// Stable identity for a declared dependency, used to join the BOM against the
// vulnerability matches (DepVuln.dep is the exact DepRef that matched).
function depKey(d: DepRef): string {
  return JSON.stringify([d.ecosystem, d.name, d.version ?? '', d.source]);
}

export function dependenciesCount(result: ScanResult): number {
  return result.dependencies.length;
}

// Top-level nodes for the Dependencies (BOM) view: declared dependencies
// grouped by ecosystem, then sorted by name. The BOM is in every scan, so this
// populates regardless of --vuln-scan. Dependencies the vuln layer flagged are
// marked with a warning icon and a count; their CVEs live in the
// Vulnerabilities view.
export function buildDependencies(result: ScanResult): TreeNode[] {
  if (!result.dependencies.length) return [];
  const vulnByDep = new Map<string, number>();
  for (const v of result.vulnerabilities) {
    const k = depKey(v.dep);
    vulnByDep.set(k, (vulnByDep.get(k) ?? 0) + 1);
  }
  const byEco = new Map<string, DepRef[]>();
  for (const d of result.dependencies) {
    const arr = byEco.get(d.ecosystem);
    if (arr) { arr.push(d); } else { byEco.set(d.ecosystem, [d]); }
  }
  return [...byEco.keys()].sort().map((eco) => {
    const items = byEco.get(eco)!.slice().sort((a, b) =>
      a.name.localeCompare(b.name) ||
      (a.version ?? '').localeCompare(b.version ?? '') ||
      a.source.localeCompare(b.source));
    return {
      label: `${eco} (${items.length})`,
      icon: 'package',
      children: items.map((d) => {
        const vcount = vulnByDep.get(depKey(d)) ?? 0;
        const parts: string[] = [];
        if (d.source) parts.push(d.source);
        if (vcount > 0) parts.push(`${vcount} vuln${vcount === 1 ? '' : 's'}`);
        return {
          label: `${d.name}${d.version ? '@' + d.version : ''}`,
          description: parts.join(' · ') || undefined,
          file: d.source || undefined,
          line: d.start_line || undefined,
          icon: vcount > 0 ? 'warning' : undefined,
          tooltip: vcount > 0 ? `${vcount} known vulnerability(ies) — see the Vulnerabilities view` : undefined,
        };
      }),
    };
  });
}

// Prefer the CVE alias when present (matches the synthesized finding's id).
function vulnLabel(v: DepVuln): string {
  return v.aliases && v.aliases.length > 0 ? v.aliases[0] : v.id;
}

export function vulnerabilitiesCount(result: ScanResult): number {
  return result.vulnerabilities.length;
}

// Top-level nodes for the Vulnerabilities view: OSV matches grouped by
// severity. Populated only when a scan ran with --vuln-scan; otherwise empty
// (the view's welcome explains how to enable it).
export function buildVulnerabilities(result: ScanResult): TreeNode[] {
  if (!result.vulnerabilities.length) return [];
  const out: TreeNode[] = [];
  for (const sev of ORDER) {
    const items = result.vulnerabilities.filter((v) => v.severity === sev);
    if (!items.length) continue;
    const sorted = items.slice().sort((a, b) =>
      a.dep.name.localeCompare(b.dep.name) ||
      vulnLabel(a).localeCompare(vulnLabel(b)));
    out.push({
      label: `${sev} (${items.length})`,
      children: sorted.map((v) => ({
        label: vulnLabel(v),
        description: `${v.dep.name}${v.dep.version ? ' ' + v.dep.version : ''}`,
        file: v.dep.source || undefined,
        line: v.dep.start_line || undefined,
        icon: 'shield',
        vuln: v,
      })),
    });
  }
  return out;
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

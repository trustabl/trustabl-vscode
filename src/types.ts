export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Scope = 'tool' | 'agent' | 'subagent' | 'repo' | '';
export type GroupBy = 'severity' | 'file' | 'scope' | 'rule';

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0, low: 1, medium: 2, high: 3, critical: 4,
};

export interface Finding {
  rule_id: string;
  category: string;
  scope: Scope;
  severity: Severity;
  tool_name: string;
  file_path: string;
  // 1-indexed inclusive line range of the entity the finding fired on. A
  // single-line entity sets end_line === start_line; both are 0 for repo-scope
  // findings with no source location. (Engine #56 replaced the former `line`.)
  start_line: number;
  end_line: number;
  title: string;
  explanation: string;
  suggested_fix: string;
  confidence: number;
}

export interface SurfaceReadiness {
  kind: 'tool' | 'agent' | 'subagent' | 'repo';
  name: string;
  file_path: string;
  score: number;
  finding_count: number;
  weighted_severity: number;
}

export interface Coverage {
  files_parsed: number;
  files_skipped: number;
  skipped_files?: string[];
}

// DepRef is one dependency declared in a repo manifest — the repo-wide
// bill of materials. Always present in scan output, independent of --vuln-scan.
export interface DepRef {
  name: string;
  // Declared spec verbatim — a pin ("1.2.3"), a range ("^1.0"), or empty when
  // the manifest names the dep with no constraint. NOT a resolved version.
  version?: string;
  // Package registry: pypi | npm | golang | nuget | composer | cargo.
  ecosystem: string;
  // Repo-relative path of the manifest the dep was read from.
  source: string;
  // 1-indexed line of the declaration in `source` (end_line === start_line).
  start_line: number;
  end_line: number;
}

// DepVuln is one known vulnerability matched against a declared dependency by
// the opt-in --vuln-scan layer (a DepRef checked against a pinned OSV
// snapshot). Present only when a scan ran with --vuln-scan.
export interface DepVuln {
  dep: DepRef;
  // Primary OSV identifier (GHSA-… / PYSEC-… / CVE-…).
  id: string;
  // Cross-references, e.g. the CVE id when the primary id is a GHSA.
  aliases?: string[];
  summary?: string;
  // Bucketed from the OSV record's CVSS score.
  severity: Severity;
  // First patched version when known.
  fixed_in?: string;
}

export interface ScanResult {
  scan_id: string;
  repo: string;
  findings: Finding[];
  surfaces: SurfaceReadiness[];
  // Repo-wide declared-dependency BOM — always present.
  dependencies: DepRef[];
  // OSV matches — populated only under --vuln-scan, else empty.
  vulnerabilities: DepVuln[];
  overall_score: number;
  coverage: Coverage;
  rules_version: string;
  rules_from_cache: boolean;
}

// Tolerant parse: we read only the fields above and ignore the rest, so a
// future engine that adds fields will not break the extension.
export function parseScanResult(stdout: string): ScanResult {
  const data = JSON.parse(stdout) as Partial<ScanResult> | null;
  if (data === null || typeof data !== 'object') {
    throw new Error('invalid ScanResult: expected a JSON object');
  }
  return {
    scan_id: data.scan_id ?? '',
    repo: data.repo ?? '',
    // The engine marshals an empty (nil) slice as JSON `null`, not `[]`, so a
    // clean scan emits `findings: null`. Treat null/absent as the empty list —
    // same for the dependency and vulnerability slices.
    findings: Array.isArray(data.findings) ? data.findings : [],
    surfaces: Array.isArray(data.surfaces) ? data.surfaces : [],
    dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    vulnerabilities: Array.isArray(data.vulnerabilities) ? data.vulnerabilities : [],
    overall_score: data.overall_score ?? 0,
    coverage: data.coverage ?? { files_parsed: 0, files_skipped: 0 },
    rules_version: data.rules_version ?? '',
    rules_from_cache: data.rules_from_cache ?? false,
  };
}

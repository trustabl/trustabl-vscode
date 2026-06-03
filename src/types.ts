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
  line: number;
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

export interface ScanResult {
  scan_id: string;
  repo: string;
  findings: Finding[];
  surfaces: SurfaceReadiness[];
  overall_score: number;
  coverage: Coverage;
  rules_version: string;
  rules_from_cache: boolean;
}

// Tolerant parse: we read only the fields above and ignore the rest, so a
// future engine that adds fields will not break the extension.
export function parseScanResult(stdout: string): ScanResult {
  const data = JSON.parse(stdout) as Partial<ScanResult>;
  if (!Array.isArray(data.findings)) {
    throw new Error('invalid ScanResult: missing findings array');
  }
  return {
    scan_id: data.scan_id ?? '',
    repo: data.repo ?? '',
    findings: data.findings,
    surfaces: Array.isArray(data.surfaces) ? data.surfaces : [],
    overall_score: data.overall_score ?? 0,
    coverage: data.coverage ?? { files_parsed: 0, files_skipped: 0 },
    rules_version: data.rules_version ?? '',
    rules_from_cache: data.rules_from_cache ?? false,
  };
}

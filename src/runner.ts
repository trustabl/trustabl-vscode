import { Canceller, runProcess } from './process';
import { parseScanResult, ScanResult } from './types';

export interface ScanOptions {
  cachedRules: boolean;
  timeoutMs: number;
  detectors?: string;
  strict?: boolean;
  rulesRepo?: string;
  rulesRef?: string;
}

export type ScanOutcome =
  | { ok: true; result: ScanResult }
  | { ok: false; kind: 'binary' | 'scan' | 'parse' | 'cancelled' | 'timeout'; error: string };

export function buildArgs(folder: string, opts: ScanOptions): string[] {
  const args = ['scan', folder, '--format', 'json', '--no-progress'];
  if (opts.cachedRules) args.push('--no-rules-update');
  if (opts.detectors) args.push('--detectors', opts.detectors);
  if (opts.strict) args.push('--strict');
  if (opts.rulesRepo) args.push('--rules-repo', opts.rulesRepo);
  if (opts.rulesRef) args.push('--rules-ref', opts.rulesRef);
  return args;
}

export async function runScan(
  binaryPath: string,
  folder: string,
  opts: ScanOptions,
  token?: Canceller,
  argvPrefix: string[] = [],
): Promise<ScanOutcome> {
  const args = [...argvPrefix, ...buildArgs(folder, opts)];
  const r = await runProcess(binaryPath, args, { cwd: folder, timeoutMs: opts.timeoutMs, token });

  switch (r.kind) {
    case 'cancelled': return { ok: false, kind: 'cancelled', error: 'scan cancelled' };
    case 'timeout': return { ok: false, kind: 'timeout', error: 'scan timed out' };
    case 'spawn-error': return { ok: false, kind: 'binary', error: r.error };
    case 'exit':
      // JSON is written before the findings-based exit 1, so 0 and 1 both carry a result.
      if (r.code === 0 || r.code === 1) {
        try { return { ok: true, result: parseScanResult(r.stdout) }; }
        catch (e) { return { ok: false, kind: 'parse', error: `${(e as Error).message}\n${r.stderr}` }; }
      }
      return { ok: false, kind: 'scan', error: r.stderr || `scan exited ${r.code}` };
  }
}

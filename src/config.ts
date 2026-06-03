import * as vscode from 'vscode';
import { Severity } from './types';
import { ScanOptions } from './runner';

export interface TrustablConfig {
  path: string;
  scanOnSave: boolean;
  detectors: string;
  strict: boolean;
  minSeverity: Severity;
  timeoutMs: number;
  rulesRepo: string;
  rulesRef: string;
}

export function readConfig(): TrustablConfig {
  const c = vscode.workspace.getConfiguration('trustabl');
  return {
    path: c.get<string>('path', ''),
    scanOnSave: c.get<boolean>('scanOnSave', true),
    detectors: c.get<string>('detectors', ''),
    strict: c.get<boolean>('strict', false),
    minSeverity: c.get<Severity>('minSeverity', 'info'),
    timeoutMs: c.get<number>('scanTimeoutSeconds', 120) * 1000,
    rulesRepo: c.get<string>('rulesRepo', ''),
    rulesRef: c.get<string>('rulesRef', ''),
  };
}

export function toScanOptions(c: TrustablConfig, cachedRules: boolean): ScanOptions {
  return {
    cachedRules,
    timeoutMs: c.timeoutMs,
    detectors: c.detectors || undefined,
    strict: c.strict,
    rulesRepo: c.rulesRepo || undefined,
    rulesRef: c.rulesRef || undefined,
  };
}

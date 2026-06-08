import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as tar from 'tar';
import extract = require('extract-zip');
import { assetNameFor, parseChecksums } from './assets';
import { sha256File } from './hash';
import { parseVersion, satisfiesPin } from './version';

// The single CLI version this extension's JSON parser is built against.
// 0.1.4 is the first release with the dependency BOM, --vuln-scan, and the
// start_line/end_line finding ranges the views and parser depend on.
export const PINNED_CLI_VERSION = '0.1.4';
const RELEASE_BASE = 'https://github.com/trustabl/trustabl/releases/download';

export class BinaryUnavailableError extends Error {}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new BinaryUnavailableError(`download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new BinaryUnavailableError(`download failed (${res.status}) for ${url}`);
  return res.text();
}

export interface DownloadSpec {
  assetUrl: string;
  checksumsUrl: string;
  assetName: string;
  isZip: boolean;
  destDir: string;
  binaryName: string; // "trustabl" or "trustabl.exe"
}

// Download the archive, verify its sha256 against checksums.txt, extract the
// binary into destDir, and return its path. Refuses to extract on mismatch.
export async function downloadVerifyExtract(spec: DownloadSpec): Promise<string> {
  fs.mkdirSync(spec.destDir, { recursive: true });
  const archivePath = path.join(spec.destDir, spec.assetName);
  fs.writeFileSync(archivePath, await fetchBuffer(spec.assetUrl));

  const checksums = parseChecksums(await fetchText(spec.checksumsUrl));
  const expected = checksums.get(spec.assetName);
  const actual = await sha256File(archivePath);
  if (!expected || expected !== actual) {
    fs.rmSync(archivePath, { force: true });
    throw new BinaryUnavailableError(
      `checksum mismatch for ${spec.assetName} (expected ${expected ?? 'none'}, got ${actual})`);
  }

  if (spec.isZip) {
    await extract(archivePath, { dir: spec.destDir });
  } else {
    await tar.x({ file: archivePath, cwd: spec.destDir });
  }
  const binPath = path.join(spec.destDir, spec.binaryName);
  if (!fs.existsSync(binPath)) {
    throw new BinaryUnavailableError(`binary ${spec.binaryName} not found in archive`);
  }
  if (process.platform !== 'win32') fs.chmodSync(binPath, 0o755);
  return binPath;
}

function versionOf(binPath: string): string | null {
  try {
    const out = cp.execFileSync(binPath, ['version'], { encoding: 'utf8', timeout: 5000 });
    return parseVersion(out);
  } catch { return null; }
}

function onPath(): string | null {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = cp.execFileSync(probe, ['trustabl'], { encoding: 'utf8', timeout: 5000 });
    const first = out.split(/\r?\n/).find((l) => l.trim().length > 0);
    return first ? first.trim() : null;
  } catch { return null; }
}

// Resolve order: configured path -> compatible binary on PATH -> cached
// download -> fetch the pinned release. Throws BinaryUnavailableError with an
// actionable message when nothing works (e.g. offline first run).
export async function resolveBinary(ctx: vscode.ExtensionContext, configuredPath: string): Promise<string> {
  const binaryName = process.platform === 'win32' ? 'trustabl.exe' : 'trustabl';

  if (configuredPath) {
    if (!fs.existsSync(configuredPath)) {
      throw new BinaryUnavailableError(`trustabl.path is set but not found: ${configuredPath}`);
    }
    return configuredPath;
  }

  const fromPath = onPath();
  if (fromPath) {
    const v = versionOf(fromPath);
    if (v && satisfiesPin(v, PINNED_CLI_VERSION)) return fromPath;
  }

  const cacheDir = path.join(ctx.globalStorageUri.fsPath, PINNED_CLI_VERSION);
  const cached = path.join(cacheDir, binaryName);
  if (fs.existsSync(cached)) return cached;

  const asset = assetNameFor(process.platform, process.arch, PINNED_CLI_VERSION);
  if (!asset) {
    throw new BinaryUnavailableError(
      `no prebuilt trustabl binary for ${process.platform}/${process.arch}; ` +
      `install it manually and set trustabl.path`);
  }
  const tag = `v${PINNED_CLI_VERSION}`;
  return downloadVerifyExtract({
    assetUrl: `${RELEASE_BASE}/${tag}/${asset.name}`,
    checksumsUrl: `${RELEASE_BASE}/${tag}/checksums.txt`,
    assetName: asset.name,
    isZip: asset.isZip,
    destDir: cacheDir,
    binaryName,
  });
}

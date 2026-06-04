import { spawn, type ChildProcess } from 'child_process';

export interface Canceller { onCancel(cb: () => void): void; }

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  token?: Canceller;
}

export type ProcResult =
  | { kind: 'exit'; code: number; stdout: string; stderr: string }
  | { kind: 'timeout'; stdout: string; stderr: string }
  | { kind: 'cancelled' }
  | { kind: 'spawn-error'; error: string };

export function runProcess(command: string, args: string[], opts: RunOptions): Promise<ProcResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    // detached on POSIX makes the child its own process-group leader so killTree
    // can signal the whole group — the trustabl binary may have spawned `git`
    // to fetch rules, which a bare child.kill() would leave running.
    const child = spawn(command, args, { cwd: opts.cwd, detached: process.platform !== 'win32' });

    const finish = (r: ProcResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    const timer = setTimeout(() => {
      killTree(child);
      finish({ kind: 'timeout', stdout, stderr });
    }, opts.timeoutMs);

    opts.token?.onCancel(() => {
      killTree(child);
      finish({ kind: 'cancelled' });
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => finish({ kind: 'spawn-error', error: e.message }));
    child.on('close', (code) => finish({ kind: 'exit', code: code ?? -1, stdout, stderr }));
  });
}

// killTree terminates the child AND any processes it spawned (e.g. the `git` the
// trustabl binary runs to fetch rules). A bare child.kill() only signals the
// direct child, leaving a wedged git running past a timeout/cancel.
function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    child.kill('SIGKILL');
    return;
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
    } catch {
      child.kill('SIGKILL');
    }
    return;
  }
  // POSIX: a negative pid signals the whole process group (the child leads it
  // because it was spawned detached). SIGTERM first, SIGKILL as a backstop.
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* group already gone */
  }
  const hard = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }, 2000);
  hard.unref();
}

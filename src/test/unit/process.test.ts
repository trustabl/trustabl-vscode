import * as assert from 'assert';
import { runProcess, Canceller } from '../../process';

const node = process.execPath;

describe('runProcess', () => {
  it('captures stdout and a non-zero exit code', async () => {
    const r = await runProcess(node,
      ['-e', 'process.stdout.write("hi"); process.exit(1)'],
      { cwd: process.cwd(), timeoutMs: 10000 });
    assert.strictEqual(r.kind, 'exit');
    if (r.kind === 'exit') {
      assert.strictEqual(r.code, 1);
      assert.strictEqual(r.stdout, 'hi');
    }
  });

  it('reports a timeout', async () => {
    const r = await runProcess(node,
      ['-e', 'setTimeout(() => {}, 5000)'],
      { cwd: process.cwd(), timeoutMs: 200 });
    assert.strictEqual(r.kind, 'timeout');
  });

  it('honors cancellation', async () => {
    let fire: () => void = () => {};
    const token: Canceller = { onCancel: (cb) => { fire = cb; } };
    const p = runProcess(node, ['-e', 'setTimeout(() => {}, 5000)'],
      { cwd: process.cwd(), timeoutMs: 10000, token });
    setTimeout(() => fire(), 100);
    const r = await p;
    assert.strictEqual(r.kind, 'cancelled');
  });

  it('reports a spawn error for a missing binary', async () => {
    const r = await runProcess('definitely-not-a-real-binary-xyz', [],
      { cwd: process.cwd(), timeoutMs: 5000 });
    assert.strictEqual(r.kind, 'spawn-error');
  });
});

import * as assert from 'assert';
import { parseVersion, satisfiesPin } from '../../version';

describe('parseVersion', () => {
  it('reads the version from `trustabl version` output', () => {
    assert.strictEqual(parseVersion('Trustabl 0.1.2\ncommit: abc\nbuilt:  x'), '0.1.2');
  });
  it('reads a dev build', () => {
    assert.strictEqual(parseVersion('Trustabl dev\ncommit: none'), 'dev');
  });
  it('returns null on junk', () => {
    assert.strictEqual(parseVersion('nope'), null);
  });
});

describe('satisfiesPin', () => {
  it('matches ignoring a leading v', () => {
    assert.ok(satisfiesPin('0.1.2', 'v0.1.2'));
    assert.ok(satisfiesPin('v0.1.2', '0.1.2'));
  });
  it('rejects a mismatch', () => {
    assert.ok(!satisfiesPin('0.1.1', '0.1.2'));
  });
});

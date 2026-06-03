import * as assert from 'assert';
import { assetNameFor, parseChecksums } from '../../assets';

describe('assetNameFor', () => {
  it('maps darwin/arm64 to a tar.gz', () => {
    assert.deepStrictEqual(assetNameFor('darwin', 'arm64', 'v0.1.2'),
      { name: 'trustabl_0.1.2_darwin_arm64.tar.gz', isZip: false });
  });
  it('maps win32/x64 to a zip and strips the v', () => {
    assert.deepStrictEqual(assetNameFor('win32', 'x64', '0.1.2'),
      { name: 'trustabl_0.1.2_windows_amd64.zip', isZip: true });
  });
  it('returns null for windows arm64 (no asset built)', () => {
    assert.strictEqual(assetNameFor('win32', 'arm64', '0.1.2'), null);
  });
  it('returns null for unknown platforms', () => {
    assert.strictEqual(assetNameFor('aix', 'ppc64', '0.1.2'), null);
  });
});

describe('parseChecksums', () => {
  it('maps filename to sha256', () => {
    const text = 'a'.repeat(64) + '  trustabl_0.1.2_linux_amd64.tar.gz\n' +
                 'b'.repeat(64) + '  trustabl_0.1.2_darwin_arm64.tar.gz\n';
    const map = parseChecksums(text);
    assert.strictEqual(map.get('trustabl_0.1.2_linux_amd64.tar.gz'), 'a'.repeat(64));
  });
});

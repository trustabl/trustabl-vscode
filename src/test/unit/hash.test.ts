import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sha256File } from '../../hash';

describe('sha256File', () => {
  it('hashes file contents', async () => {
    const f = path.join(os.tmpdir(), `trustabl-hash-${Date.now()}.txt`);
    fs.writeFileSync(f, 'hello');
    // sha256("hello")
    const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    assert.strictEqual(await sha256File(f), expected);
    fs.unlinkSync(f);
  });
});

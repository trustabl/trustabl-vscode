import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as tar from 'tar';
import { sha256File } from '../../hash';
import { downloadVerifyExtract } from '../../binary';

describe('downloadVerifyExtract', () => {
  it('downloads, verifies sha256, and extracts the binary', async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'trustabl-bin-'));
    // Build a fake archive containing a "trustabl" file.
    const binDir = path.join(work, 'payload');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, 'trustabl'), '#!/bin/sh\necho hi\n');
    const archive = path.join(work, 'trustabl_0.1.2_linux_amd64.tar.gz');
    await tar.c({ gzip: true, file: archive, cwd: binDir }, ['trustabl']);
    const sum = await sha256File(archive);

    const server = http.createServer((req, res) => {
      if (req.url!.endsWith('checksums.txt')) {
        res.end(`${sum}  trustabl_0.1.2_linux_amd64.tar.gz\n`);
      } else {
        res.end(fs.readFileSync(archive));
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;

    const dest = path.join(work, 'cache');
    const out = await downloadVerifyExtract({
      assetUrl: `${base}/trustabl_0.1.2_linux_amd64.tar.gz`,
      checksumsUrl: `${base}/checksums.txt`,
      assetName: 'trustabl_0.1.2_linux_amd64.tar.gz',
      isZip: false,
      destDir: dest,
      binaryName: 'trustabl',
    });
    assert.ok(fs.existsSync(out));
    server.close();
  });
});

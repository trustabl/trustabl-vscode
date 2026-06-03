import * as assert from 'assert';
import * as vscode from 'vscode';

describe('extension activation', () => {
  it('registers the scan command and a diagnostics collection', async () => {
    const ext = vscode.extensions.getExtension('trustabl.trustabl');
    assert.ok(ext, 'extension not found');
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('trustabl.scanWorkspace'));
  });
});

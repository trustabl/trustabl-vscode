import * as vscode from 'vscode';
import * as path from 'path';
import { TreeNode } from './treeModel';

// Generic provider that renders a flat-or-nested list of TreeNodes. Used for
// the Findings, Scores, and Help views (each is its own section/view).
export class NodeTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private roots: TreeNode[] = [];

  constructor(private workspaceRoot: string) {}

  setRoot(root: string): void {
    this.workspaceRoot = root;
  }

  setNodes(nodes: TreeNode[]): void {
    this.roots = nodes;
    this._onDidChange.fire();
  }

  getChildren(node?: TreeNode): TreeNode[] {
    return node ? node.children ?? [] : this.roots;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const collapsible = node.children && node.children.length > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(node.label, collapsible);
    item.description = node.description;
    if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);

    if (node.finding) {
      item.tooltip = node.finding.explanation;
      item.command = { command: 'trustabl.showFinding', title: 'Show finding', arguments: [node.finding] };
    } else if (node.url) {
      item.command = { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.parse(node.url)] };
    } else if (node.file) {
      const abs = path.resolve(this.workspaceRoot, node.file);
      const line = (node.line ?? 1) - 1;
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(abs), { selection: new vscode.Range(line, 0, line, 0) }],
      };
    }
    return item;
  }
}

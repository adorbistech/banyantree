/**
 * BanyanTree Graph Panel
 * Shows connected files and entity relationships for the current file.
 * Phase 1: simple list view. Phase 2: interactive graph visualisation.
 */
import * as vscode from 'vscode'
import type { RuntimeClient } from '../runtime-client.js'

export class GraphPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  constructor(private context: vscode.ExtensionContext, private client: RuntimeClient) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.html('Open a file to see its graph context.', [])
  }

  async loadForFile(relativePath: string): Promise<void> {
    if (!this.view) return
    const ctx = await this.client.getFileContext(relativePath)
    if (!ctx) return
    const filename = relativePath.split('/').pop() ?? relativePath
    this.view.webview.html = this.html(filename, ctx.relatedFiles, ctx.nodeCount)
  }

  private html(title: string, related: Array<{name:string;relativePath:string|null;weight:number}>, nodeCount?: number): string {
    const rows = related.map(r => `
      <div style="display:flex;padding:4px 0;border-bottom:1px solid var(--vscode-sideBar-border);font-size:11px;font-family:var(--vscode-editor-font-family)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.relativePath ?? r.name}</span>
        <span style="color:var(--vscode-descriptionForeground);font-size:10px">${r.weight.toFixed(2)}</span>
      </div>`).join('')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);padding:8px}</style>
</head><body>
<div style="font-size:11px;font-weight:600;margin-bottom:8px">${title}${nodeCount !== undefined ? `<span style="float:right;color:var(--vscode-descriptionForeground)">${nodeCount} nodes</span>` : ''}</div>
${rows || '<div style="color:var(--vscode-descriptionForeground);font-size:11px">No connections recorded yet.</div>'}
</body></html>`
  }
}

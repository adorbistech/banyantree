/**
 * BanyanTree Memory Panel
 *
 * The aha moment made visible.
 *
 * What the developer sees when they open a file:
 * - Corrections (human overrides, shown first, always)
 * - Open questions (unresolved TODOs and deferred decisions)
 * - Architectural decisions (structural memory, weighted)
 * - Session notes (recent, ephemeral)
 * - Related files (from graph traversal)
 * - Active drift alerts
 *
 * Design rules:
 * - Renders in < 150ms (performance-budget.md)
 * - Never shows if nothing worth saying (R10)
 * - Memory is shown to developer FIRST (R03)
 * - Human corrections always appear before AI-inferred content
 * - Calm, enterprise-grade aesthetics (INTERFACE_ARCHITECTURE.md)
 */

import * as vscode from 'vscode'
import type { RuntimeClient, FileContext } from '../runtime-client.js'

export class MemoryPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  private client: RuntimeClient
  private currentFile: string | null = null

  constructor(
    private readonly context: vscode.ExtensionContext,
    client: RuntimeClient
  ) {
    this.client = client
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }

    webviewView.webview.html = this.getLoadingHtml()

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'remember':
          await this.client.writeMemorySignal('remember', message.entityId, message.content)
          vscode.window.showInformationMessage('[BANYAN] Memory recorded.')
          break
        case 'forget':
          await this.client.writeMemorySignal('forget', null, '', message.memoryId)
          vscode.window.showInformationMessage('[BANYAN] Memory queued for deletion.')
          if (this.currentFile) this.loadForFile(this.currentFile)
          break
        case 'correct':
          const newContent = await vscode.window.showInputBox({
            prompt: 'Correct this memory — enter the replacement:',
            value: message.oldContent,
          })
          if (newContent) {
            await this.client.writeMemorySignal('correct', message.entityId, newContent, message.memoryId)
            vscode.window.showInformationMessage('[BANYAN] Correction recorded. Weight: 0.90. Never decays.')
            if (this.currentFile) this.loadForFile(this.currentFile)
          }
          break
        case 'acknowledge_flag':
          // Flag acknowledgement — write to events table
          await this.client.writeMemorySignal('forget', null, '', message.flagId)
          if (this.currentFile) this.loadForFile(this.currentFile)
          break
      }
    })
  }

  // ============================================================
  // LOAD FOR FILE
  // Called when a file is opened. The aha moment trigger.
  // ============================================================

  async loadForFile(relativePath: string): Promise<void> {
    if (!this.view) return

    this.currentFile = relativePath

    const ctx = await this.client.getFileContext(relativePath)

    if (!ctx || !ctx.hasContext) {
      this.view.webview.html = this.getEmptyHtml(relativePath)
      return
    }

    this.view.webview.html = this.getContextHtml(relativePath, ctx)
  }

  // ============================================================
  // HTML GENERATION
  // Uses BanyanTree design language from INTERFACE_ARCHITECTURE.md:
  // graphite, charcoal, muted green accents, IBM Plex Mono
  // Calm, enterprise-safe, low-noise
  // ============================================================

  private getLoadingHtml(): string {
    return this.wrap(`
      <div class="empty">
        <div class="empty-label">Loading cognition...</div>
      </div>
    `)
  }

  private getEmptyHtml(relativePath: string): string {
    const filename = relativePath.split('/').pop() ?? relativePath
    return this.wrap(`
      <div class="empty">
        <div class="empty-label">${filename}</div>
        <div class="empty-sub">No memory recorded yet.</div>
        <div class="empty-sub">First session on this file.</div>
      </div>
    `)
  }

  private getContextHtml(relativePath: string, ctx: FileContext): string {
    const filename = relativePath.split('/').pop() ?? relativePath
    const sections: string[] = []

    // ── File header ───────────────────────────────────────────
    sections.push(`
      <div class="file-header">
        <div class="file-name">${filename}</div>
        <div class="file-meta">weight: ${ctx.file?.weight.toFixed(2) ?? '?'} · ${ctx.nodeCount} nodes</div>
      </div>
    `)

    // ── Drift alerts (shown first — action required) ──────────
    if (ctx.flags.length > 0) {
      sections.push('<div class="section-title">Alerts</div>')
      for (const flag of ctx.flags) {
        sections.push(`
          <div class="card flag-${flag.severity}">
            <div class="card-title">${flag.title}</div>
            ${flag.detail ? `<div class="card-body">${flag.detail}</div>` : ''}
            <button class="btn-small" onclick="acknowledge('${flag.id}')">Acknowledge</button>
          </div>
        `)
      }
    }

    // ── Corrections (human overrides — always shown prominently) ─
    if (ctx.corrections.length > 0) {
      sections.push('<div class="section-title">Corrections</div>')
      for (const c of ctx.corrections) {
        sections.push(`
          <div class="card correction">
            <div class="card-body">${c.content}</div>
            <div class="card-meta">${this.timeAgo(c.createdAt)} · never decays</div>
          </div>
        `)
      }
    }

    // ── Open questions ────────────────────────────────────────
    if (ctx.openQuestions.length > 0) {
      sections.push('<div class="section-title">Open questions</div>')
      for (const q of ctx.openQuestions) {
        sections.push(`
          <div class="card question">
            <div class="card-body">${q.content}</div>
            <div class="card-actions">
              <button class="btn-small" onclick="forget('${q.id}')">Resolved</button>
            </div>
          </div>
        `)
      }
    }

    // ── Architectural memories ────────────────────────────────
    const structural = ctx.memories.filter(m => m.type === 'structural' && !m.isCorrection)
    if (structural.length > 0) {
      sections.push('<div class="section-title">Architectural decisions</div>')
      for (const m of structural.slice(0, 4)) {
        sections.push(`
          <div class="card memory">
            <div class="card-body">${m.content}</div>
            <div class="card-meta">${this.timeAgo(m.createdAt)} · weight: ${m.weight.toFixed(2)}</div>
            <div class="card-actions">
              <button class="btn-small" onclick="correct('${m.id}', ${JSON.stringify(m.content)})">Correct</button>
              <button class="btn-small" onclick="forget('${m.id}')">Forget</button>
            </div>
          </div>
        `)
      }
    }

    // ── Session notes ─────────────────────────────────────────
    const sessionNotes = ctx.memories.filter(
      m => m.type === 'session' && !m.isCorrection &&
           !ctx.openQuestions.find(q => q.id === m.id)
    )
    if (sessionNotes.length > 0) {
      sections.push('<div class="section-title">Session notes</div>')
      for (const m of sessionNotes.slice(0, 3)) {
        sections.push(`
          <div class="card session">
            <div class="card-body">${m.content}</div>
            <div class="card-meta">${this.timeAgo(m.createdAt)}</div>
          </div>
        `)
      }
    }

    // ── Related files ─────────────────────────────────────────
    if (ctx.relatedFiles.length > 0) {
      sections.push('<div class="section-title">Connected files</div>')
      for (const r of ctx.relatedFiles.slice(0, 5)) {
        sections.push(`
          <div class="related-file">
            <span class="rf-name">${r.relativePath?.split('/').pop() ?? r.name}</span>
            <span class="rf-weight">${r.weight.toFixed(2)}</span>
          </div>
        `)
      }
    }

    // ── Remember action ───────────────────────────────────────
    sections.push(`
      <div class="remember-bar">
        <button class="btn-remember" onclick="rememberPrompt()">+ Remember something about this file</button>
      </div>
    `)

    return this.wrap(sections.join('\n'))
  }

  private wrap(body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 8px;
  }
  .file-header { padding: 6px 0 10px; border-bottom: 1px solid var(--vscode-sideBar-border); margin-bottom: 8px; }
  .file-name { font-size: 13px; font-weight: 600; font-family: var(--vscode-editor-font-family); }
  .file-meta { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin: 10px 0 4px; }
  .card { border-radius: 4px; padding: 7px 9px; margin-bottom: 5px; border: 1px solid var(--vscode-sideBar-border); }
  .card.correction { border-left: 3px solid #3D9E6A; background: rgba(61,158,106,0.06); }
  .card.question { border-left: 3px solid #C8893A; background: rgba(200,137,58,0.06); }
  .card.memory { border-left: 3px solid #4A7FA8; background: rgba(74,127,168,0.06); }
  .card.session { background: var(--vscode-input-background); }
  .card.flag-critical { border-left: 3px solid #B84040; background: rgba(184,64,64,0.08); }
  .card.flag-warning { border-left: 3px solid #C8893A; background: rgba(200,137,58,0.06); }
  .card.flag-info { border-left: 3px solid #4A7FA8; background: rgba(74,127,168,0.06); }
  .card-title { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
  .card-body { font-size: 11px; line-height: 1.55; color: var(--vscode-foreground); }
  .card-meta { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .card-actions { display: flex; gap: 6px; margin-top: 5px; }
  .btn-small { font-size: 10px; padding: 2px 7px; border-radius: 3px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; }
  .btn-small:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .related-file { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 1px solid var(--vscode-sideBar-border); font-size: 11px; }
  .rf-name { flex: 1; font-family: var(--vscode-editor-font-family); color: var(--vscode-foreground); }
  .rf-weight { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .remember-bar { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--vscode-sideBar-border); }
  .btn-remember { width: 100%; font-size: 11px; padding: 5px; cursor: pointer; background: transparent; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-sideBar-border); border-radius: 3px; }
  .btn-remember:hover { background: var(--vscode-list-hoverBackground); }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 12px; gap: 4px; }
  .empty-label { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .empty-sub { font-size: 11px; color: var(--vscode-disabledForeground); }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  function forget(id) { vscode.postMessage({ command: 'forget', memoryId: id }); }
  function correct(id, old) { vscode.postMessage({ command: 'correct', memoryId: id, oldContent: old }); }
  function acknowledge(id) { vscode.postMessage({ command: 'acknowledge_flag', flagId: id }); }
  function rememberPrompt() {
    vscode.postMessage({ command: 'remember', content: '', entityId: null });
  }
</script>
</body>
</html>`
  }

  private timeAgo(timestamp: number): string {
    const ms = Date.now() - timestamp
    const minutes = Math.floor(ms / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return `${Math.floor(days / 30)}mo ago`
  }
}

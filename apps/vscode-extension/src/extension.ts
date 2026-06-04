/**
 * BanyanTree VS Code Extension
 *
 * Block 8. How cognition enters developer flow naturally.
 *
 * Design principle: invisible until it has something worth saying.
 * (Constitutional Rule R10)
 *
 * What this extension does:
 * 1. Watches which file the developer opens
 * 2. Queries BanyanTree runtime for that file's context
 * 3. Surfaces memory in the sidebar — before Claude opens
 * 4. Shows drift alerts inline
 * 5. Provides "Remember this" / "Correct this" commands
 *
 * What it never does:
 * - Inject context into Claude silently (R03: developer sees it first)
 * - Auto-execute any action
 * - Poll aggressively (idle CPU must be ~0)
 * - Show anything unless weight >= minWeightToShow config
 */

import * as vscode from 'vscode'
import { MemoryPanelProvider } from './providers/memory-panel.js'
import { GraphPanelProvider } from './providers/graph-panel.js'
import { RuntimeClient } from './runtime-client.js'
import { registerCommands } from './commands/index.js'

let runtimeClient: RuntimeClient | null = null

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('banyantree')

  if (!config.get<boolean>('enabled', true)) {
    return  // respect user disabling the extension
  }

  // ── Runtime client ──────────────────────────────────────────
  // Connects to the local BanyanTree daemon via SQLite (direct read)
  // No network calls — reads the local SQLite database directly
  runtimeClient = new RuntimeClient(context)

  // ── Sidebar panels ──────────────────────────────────────────
  const memoryPanel = new MemoryPanelProvider(context, runtimeClient)
  const graphPanel = new GraphPanelProvider(context, runtimeClient)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'banyantree.memoryPanel',
      memoryPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerWebviewViewProvider(
      'banyantree.graphPanel',
      graphPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  )

  // ── File open listener ──────────────────────────────────────
  // This is the aha moment trigger.
  // When a developer opens a file, we query cognition context
  // and surface it in the sidebar — before they type a word.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return
      if (!config.get<boolean>('showOnFileOpen', true)) return

      const filePath = editor.document.uri.fsPath
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

      if (!workspaceRoot) return
      if (!filePath.startsWith(workspaceRoot)) return

      const relativePath = filePath.replace(workspaceRoot + '/', '')

      // Fire and forget — sidebar updates asynchronously
      // Never blocks the editor opening
      memoryPanel.loadForFile(relativePath).catch(() => {
        // Non-fatal — cognition is ambient, never blocking
      })

      graphPanel.loadForFile(relativePath).catch(() => {})
    })
  )

  // ── Commands ────────────────────────────────────────────────
  registerCommands(context, runtimeClient)

  // ── Status bar ──────────────────────────────────────────────
  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  )
  statusItem.text = '$(circuit-board) BCA'
  statusItem.tooltip = 'BanyanTree cognition active'
  statusItem.command = 'banyantree.showContext'
  statusItem.show()
  context.subscriptions.push(statusItem)

  // Update status bar when runtime connects
  runtimeClient.onStatusChange((status) => {
    if (status === 'connected') {
      statusItem.text = '$(circuit-board) BCA'
      statusItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground')
    } else {
      statusItem.text = '$(circuit-board) BCA (offline)'
      statusItem.color = undefined
    }
  })

  // Initial connection attempt (non-blocking)
  runtimeClient.connect().catch(() => {
    // Runtime may not be running yet — silent fail
  })
}

export function deactivate(): void {
  runtimeClient?.disconnect()
}

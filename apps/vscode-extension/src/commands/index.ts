import * as vscode from 'vscode'
import type { RuntimeClient } from '../runtime-client.js'

export function registerCommands(context: vscode.ExtensionContext, client: RuntimeClient): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('banyantree.rememberThis', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const content = await vscode.window.showInputBox({ prompt: 'What should BanyanTree remember about this file?' })
      if (!content) return
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri)
      await client.writeMemorySignal('remember', null, content)
      vscode.window.showInformationMessage('[BANYAN] Memory recorded.')
    }),
    vscode.commands.registerCommand('banyantree.showContext', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri)
      const ctx = await client.getFileContext(relativePath)
      if (!ctx?.hasContext) {
        vscode.window.showInformationMessage('[BANYAN] No memory recorded for this file yet.')
        return
      }
      vscode.window.showInformationMessage(`[BANYAN] ${ctx.memories.length} memories | ${ctx.flags.length} flags | ${ctx.relatedFiles.length} related files`)
    }),
    vscode.commands.registerCommand('banyantree.openDoctor', () => {
      const terminal = vscode.window.createTerminal('BanyanTree Doctor')
      terminal.sendText('banyan doctor')
      terminal.show()
    })
  )
}

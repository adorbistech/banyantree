/**
 * banyan status — show runtime and graph status
 */
import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { print, printSection, printRaw } from '../output.js'

export function statusCommand(): Command {
  return new Command('status')
    .description('Show runtime and graph status')
    .action(async () => {
      const config = await loadConfig()
      print('Runtime status')
      printRaw('')
      printRaw(`  Active repository  ${config.activeRepo ?? 'none'}`)
      printRaw(`  Approved repos     ${config.approvedRepos.length}`)
      printRaw(`  Cloud models       ${config.cloudModels.enabled ? 'enabled' : 'disabled (local-first)'}`)
      printRaw(`  MCP port           ${config.mcpPort}`)
      printRaw('')
      print("Run 'banyan doctor' for full health check.")
    })
}

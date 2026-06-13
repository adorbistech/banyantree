import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { print, printRaw, printError } from '../output.js'
import { existsSync } from 'fs'

export function graphCommand(): Command {
  return new Command('graph')
    .description('Show graph statistics')
    .action(async () => {
      const config = await loadConfig()
      if (!existsSync(config.dbPath)) { printError('Database not found.'); process.exit(1) }
      const { default: Database } = await import('better-sqlite3')
      const db = new Database(config.dbPath, { readonly: true })
      const nodes = (db.prepare("SELECT COUNT(*) as n FROM entities WHERE status='active'").get() as any).n
      const edges = (db.prepare("SELECT COUNT(*) as n FROM relationships WHERE status='active'").get() as any).n
      const mems  = (db.prepare("SELECT COUNT(*) as n FROM memories WHERE status='active'").get() as any).n
      db.close()
      print('Graph statistics')
      printRaw('')
      printRaw(`  Nodes         ${nodes} of ${config.limits.maxNodesPerRepo} limit`)
      printRaw(`  Relationships ${edges}`)
      printRaw(`  Memories      ${mems}`)
      printRaw('')
      print("Run 'banyan doctor' for full health check.")
    })
}

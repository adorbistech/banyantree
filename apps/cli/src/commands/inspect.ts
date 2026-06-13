import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { print, printRaw, printError, printTable } from '../output.js'
import { existsSync } from 'fs'

export function inspectCommand(): Command {
  return new Command('inspect')
    .description('Browse all stored memory nodes')
    .option('--type <type>', 'Filter by node type (session|structural|reinforced|correction)')
    .option('--quarantined', 'Show quarantined nodes')
    .option('--json', 'Output as JSON')
    .action(async (opts: { type?: string; quarantined?: boolean; json?: boolean }) => {
      const config = await loadConfig()
      if (!existsSync(config.dbPath)) { printError('Database not found.'); process.exit(1) }
      const { default: Database } = await import('better-sqlite3')
      const db = new Database(config.dbPath, { readonly: true })
      const status = opts.quarantined ? 'quarantine' : 'active'
      const where = opts.type ? `AND type = '${opts.type}'` : ''
      const rows = db.prepare(`SELECT id, type, content, weight, created_at FROM memories WHERE status = ? ${where} ORDER BY weight DESC LIMIT 50`).all(status)
      db.close()
      if (opts.json) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return }
      print(`Memory nodes (${rows.length} shown)`)
      printTable(['ID', 'Type', 'Weight', 'Content'], rows.map((r: any) => [r.id.slice(0,8)+'...', r.type, r.weight.toFixed(2), r.content.slice(0,60)]))
    })
}

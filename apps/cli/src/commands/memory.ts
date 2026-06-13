import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { print, printTable, printError } from '../output.js'
import { existsSync } from 'fs'

export function memoryCommand(): Command {
  return new Command('memory')
    .description('List recent session memories')
    .option('--limit <n>', 'Number of memories to show', '20')
    .action(async (opts: { limit?: string }) => {
      const config = await loadConfig()
      if (!existsSync(config.dbPath)) { printError('Database not found.'); process.exit(1) }
      const { default: Database } = await import('better-sqlite3')
      const db = new Database(config.dbPath, { readonly: true })
      const rows = db.prepare("SELECT id, type, weight, content, created_at FROM memories WHERE status='active' ORDER BY created_at DESC LIMIT ?").all(parseInt(opts.limit ?? '20'))
      db.close()
      print(`Recent memories (${rows.length} shown)`)
      printTable(['ID', 'Type', 'Weight', 'Content'], (rows as any[]).map(r => [r.id.slice(0,8)+'...', r.type, r.weight.toFixed(2), r.content.slice(0,60)]))
    })
}

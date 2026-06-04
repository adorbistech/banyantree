import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { print, printRaw } from '../output.js'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export function logsCommand(): Command {
  return new Command('logs')
    .description('Show recent runtime logs')
    .option('--lines <n>', 'Number of lines to show', '50')
    .action(async (opts: { lines?: string }) => {
      const config = await loadConfig()
      print('Runtime logs')
      if (!existsSync(config.logPath)) { printRaw('  No logs found.'); return }
      const files = readdirSync(config.logPath).filter(f => f.endsWith('.log')).sort().reverse()
      if (!files.length) { printRaw('  No log files found.'); return }
      const latest = join(config.logPath, files[0]!)
      const lines = readFileSync(latest, 'utf8').split('\n').filter(Boolean)
      const n = parseInt(opts.lines ?? '50')
      lines.slice(-n).forEach(l => printRaw(`  ${l}`))
    })
}

/**
 * banyan export
 *
 * Exports the full cognition graph as portable JSON.
 * Constitutional rule R08: Developer owns everything. Export always works.
 * This command is non-negotiable — it can never be gated or disabled.
 *
 * Usage:
 *   banyan export                    # exports to ./banyan-export-<date>.json
 *   banyan export --out ./backup/    # exports to specified path
 *   banyan export --pretty           # pretty-printed JSON
 */

import { Command } from 'commander'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { loadConfig } from '../config.js'
import { print, printSuccess, printError, printStep } from '../output.js'

export function exportCommand(): Command {
  return new Command('export')
    .description('Export full graph and memory as portable JSON')
    .option('--out <path>', 'Output directory or file path')
    .option('--pretty', 'Pretty-print JSON output')
    .option('--graph-only', 'Export graph entities and relationships only')
    .option('--memory-only', 'Export memory nodes only')
    .action(async (opts: {
      out?: string
      pretty?: boolean
      graphOnly?: boolean
      memoryOnly?: boolean
    }) => {
      print('Exporting cognition data...')

      const config = await loadConfig()

      if (!existsSync(config.dbPath)) {
        printError('Database not found. Run banyan init first.')
        process.exit(1)
      }

      // Build export filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `banyan-export-${timestamp}.json`

      let outputPath: string
      if (opts.out) {
        const resolved = resolve(opts.out)
        // If it looks like a directory (no extension), use it as dir
        if (!resolved.endsWith('.json')) {
          mkdirSync(resolved, { recursive: true })
          outputPath = join(resolved, filename)
        } else {
          outputPath = resolved
        }
      } else {
        outputPath = join(process.cwd(), filename)
      }

      printStep('Reading graph data...')

      // Build export payload
      // Phase 1: reads directly from SQLite
      // Phase 2: will go through the graph engine API
      const exportData = buildExportPayload(config.dbPath, opts)

      printStep(`Writing to: ${outputPath}`)

      const json = opts.pretty
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData)

      writeFileSync(outputPath, json, 'utf8')

      const sizekb = Math.round(Buffer.byteLength(json, 'utf8') / 1024)

      printSuccess(`Export complete: ${outputPath}`)
      print(`  Entities:      ${(exportData.summary as any).entityCount}`)
      print(`  Relationships: ${(exportData.summary as any).relationshipCount}`)
      print(`  Memories:      ${(exportData.summary as any).memoryCount}`)
      print(`  Events:        ${(exportData.summary as any).eventCount}`)
      print(`  Size:          ${sizekb}KB`)
      print('')
      print('This export is portable. Import it on any BanyanTree instance.')
      print('You own this data. BanyanTree holds it in trust.')
    })
}

function buildExportPayload(
  dbPath: string,
  opts: { graphOnly?: boolean; memoryOnly?: boolean }
): Record<string, unknown> {
  // Lazy import to avoid loading SQLite when not needed
  const Database = require('better-sqlite3')
  const db = new Database(dbPath, { readonly: true })

  try {
    const entities     = opts.memoryOnly ? [] : db.prepare('SELECT * FROM entities WHERE status = ?').all('active')
    const relationships = opts.memoryOnly ? [] : db.prepare('SELECT * FROM relationships WHERE status = ?').all('active')
    const memories     = opts.graphOnly ? [] : db.prepare('SELECT * FROM memories WHERE status = ?').all('active')
    const events       = db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 1000').all()
    const flags        = db.prepare('SELECT * FROM agent_flags WHERE acknowledged = 0').all()
    const doctrine     = db.prepare('SELECT * FROM doctrine').all()
    const sessions     = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100').all()

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'banyan export',
        version: '0.1.0',
        format: 'banyantree-export-v1',
      },
      summary: {
        entityCount: entities.length,
        relationshipCount: relationships.length,
        memoryCount: memories.length,
        eventCount: events.length,
        flagCount: flags.length,
      },
      data: {
        entities,
        relationships,
        memories,
        sessions,
        flags,
        doctrine,
        events,
      },
    }
  } finally {
    db.close()
  }
}

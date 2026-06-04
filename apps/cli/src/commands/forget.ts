/**
 * banyan forget <id>
 *
 * Deletes a memory node. Developer owns everything.
 * Soft delete: quarantine 30 days, then purge.
 * Hard delete: immediate, permanent, no recovery.
 *
 * Constitutional rule R08: Developer owns everything.
 * Hard delete can NEVER be gated, disabled, or require justification.
 *
 * Usage:
 *   banyan forget <node-id>          # soft delete (recoverable 30 days)
 *   banyan forget <node-id> --hard   # immediate permanent deletion
 *   banyan forget --all              # full memory wipe
 */

import { Command } from 'commander'
import { loadConfig } from '../config.js'
import { existsSync } from 'fs'
import { print, printSuccess, printError, printStep } from '../output.js'

export function forgetCommand(): Command {
  return new Command('forget')
    .description('Delete a memory node (soft delete by default)')
    .argument('[id]', 'Memory node ID to delete')
    .option('--hard', 'Immediate permanent deletion — no recovery')
    .option('--all', 'Wipe all memory (requires --confirm)')
    .option('--confirm', 'Required confirmation flag for --all')
    .action(async (id: string | undefined, opts: {
      hard?: boolean
      all?: boolean
      confirm?: boolean
    }) => {
      const config = await loadConfig()

      if (!existsSync(config.dbPath)) {
        printError('Database not found. Run banyan init first.')
        process.exit(1)
      }

      // ── Full wipe ──────────────────────────────────────────
      if (opts.all) {
        if (!opts.confirm) {
          printError('Full memory wipe requires --confirm flag.')
          print("  banyan forget --all --confirm")
          print('')
          print('This will permanently delete all memory nodes.')
          print('The graph structure and events will be preserved.')
          process.exit(1)
        }

        printStep('Wiping all memory nodes...')
        const count = wipeAllMemory(config.dbPath, !!opts.hard)
        printSuccess(`Memory wipe complete. ${count} nodes removed.`)
        return
      }

      // ── Single node delete ─────────────────────────────────
      if (!id) {
        printError('Provide a node ID or use --all to wipe all memory.')
        print("  banyan forget <node-id>")
        print("  banyan inspect  # to find node IDs")
        process.exit(1)
      }

      print(`Deleting memory node: ${id}`)

      if (opts.hard) {
        printStep('Hard delete — permanent, no recovery.')
        const deleted = hardDeleteNode(config.dbPath, id)
        if (deleted) {
          printSuccess(`Node permanently deleted: ${id}`)
        } else {
          printError(`Node not found: ${id}`)
          process.exit(1)
        }
      } else {
        printStep('Soft delete — quarantine for 30 days.')
        const quarantined = softDeleteNode(config.dbPath, id)
        if (quarantined) {
          printSuccess(`Node quarantined: ${id}`)
          print('  Recoverable for 30 days via banyan inspect --quarantined')
          print('  Hard delete: banyan forget <id> --hard')
        } else {
          printError(`Node not found: ${id}`)
          process.exit(1)
        }
      }
    })
}

function softDeleteNode(dbPath: string, id: string): boolean {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)
  try {
    // Try memories first, then entities
    let result = db.prepare(
      "UPDATE memories SET status = 'deleted', updated_at = ? WHERE id = ?"
    ).run(Date.now(), id)

    if (result.changes === 0) {
      result = db.prepare(
        "UPDATE entities SET status = 'quarantine', updated_at = ? WHERE id = ?"
      ).run(Date.now(), id)
    }

    return result.changes > 0
  } finally {
    db.close()
  }
}

function hardDeleteNode(dbPath: string, id: string): boolean {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)
  try {
    let result = db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    if (result.changes === 0) {
      result = db.prepare('DELETE FROM entities WHERE id = ?').run(id)
    }
    return result.changes > 0
  } finally {
    db.close()
  }
}

function wipeAllMemory(dbPath: string, hard: boolean): number {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)
  try {
    if (hard) {
      const result = db.prepare('DELETE FROM memories').run()
      return result.changes
    } else {
      const result = db.prepare(
        "UPDATE memories SET status = 'deleted', updated_at = ?"
      ).run(Date.now())
      return result.changes
    }
  } finally {
    db.close()
  }
}

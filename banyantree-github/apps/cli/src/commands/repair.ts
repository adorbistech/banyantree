/**
 * banyan repair  — repairs corrupted graph data
 * banyan validate — validates graph integrity without making changes
 *
 * From PLATFORM_RUNTIME_AND_CLI.md: banyan safe-mode disables indexing
 * while preserving graph access, export access, and repair access.
 *
 * These commands must always work — even in safe mode.
 * Data integrity is non-negotiable for a cognition persistence system.
 */

import { Command } from 'commander'
import { existsSync } from 'fs'
import { loadConfig } from '../config.js'
import { print, printSection, printRaw, printError, printSuccess, printStep } from '../output.js'

// ============================================================
// VALIDATE
// ============================================================

export function validateCommand(): Command {
  return new Command('validate')
    .description('Validate graph integrity without making changes')
    .option('--json', 'Output results as JSON')
    .action(async (opts: { json?: boolean }) => {
      print('Validating cognition graph...')

      const config = await loadConfig()

      if (!existsSync(config.dbPath)) {
        printError('Database not found. Nothing to validate.')
        process.exit(1)
      }

      const issues = runValidation(config.dbPath)

      if (opts.json) {
        process.stdout.write(JSON.stringify({
          valid: issues.length === 0,
          issueCount: issues.length,
          issues,
        }, null, 2) + '\n')
        return
      }

      printSection('Validation Report')

      if (issues.length === 0) {
        printSuccess('Graph integrity valid. No issues found.')
        return
      }

      printRaw(`  Issues found: ${issues.length}`)
      printRaw('')
      for (const issue of issues) {
        printRaw(`  [${issue.severity.toUpperCase()}] ${issue.table}: ${issue.description}`)
        if (issue.count !== undefined) {
          printRaw(`         Affected rows: ${issue.count}`)
        }
      }
      printRaw('')
      print("Run 'banyan repair' to fix automatically-repairable issues.")
    })
}

// ============================================================
// REPAIR
// ============================================================

export function repairCommand(): Command {
  return new Command('repair')
    .description('Repair graph integrity issues')
    .option('--dry-run', 'Show what would be repaired without making changes')
    .action(async (opts: { dryRun?: boolean }) => {
      print('Running graph repair...')

      const config = await loadConfig()

      if (!existsSync(config.dbPath)) {
        printError('Database not found. Nothing to repair.')
        process.exit(1)
      }

      if (opts.dryRun) {
        print('Dry run — no changes will be made.')
      }

      const issues = runValidation(config.dbPath)

      if (issues.length === 0) {
        printSuccess('Graph is healthy. No repairs needed.')
        return
      }

      print(`Found ${issues.length} issues. Repairing...`)
      printRaw('')

      const results = runRepairs(config.dbPath, issues, !!opts.dryRun)

      for (const result of results) {
        const status = result.repaired ? '[REPAIRED]' : '[MANUAL REQUIRED]'
        printRaw(`  ${status} ${result.description}`)
        if (result.note) {
          printRaw(`         Note: ${result.note}`)
        }
      }

      printRaw('')
      const repairedCount = results.filter(r => r.repaired).length
      const manualCount = results.filter(r => !r.repaired).length

      if (repairedCount > 0) {
        printSuccess(`${repairedCount} issues repaired automatically.`)
      }
      if (manualCount > 0) {
        print(`${manualCount} issues require manual review.`)
        print("Run 'banyan inspect' to review and 'banyan forget' to remove problematic nodes.")
      }
    })
}

// ============================================================
// SAFE MODE
// ============================================================

export function safeModeCommand(): Command {
  return new Command('safe-mode')
    .description('Enter safe mode — disables indexing and AI connectors, preserves graph access')
    .option('--exit', 'Exit safe mode and resume normal operation')
    .action(async (opts: { exit?: boolean }) => {
      const config = await loadConfig()

      if (opts.exit) {
        // Clear safe mode flag
        const { saveConfig } = await import('../config.js')
        const updated = { ...config } as any
        delete updated.safeMode
        saveConfig(updated)
        printSuccess('Safe mode exited. Restart the runtime to resume normal operation.')
        return
      }

      print('Entering safe mode...')
      printRaw('')
      printRaw('  Safe mode disables:')
      printRaw('    - File watching and indexing')
      printRaw('    - AI connectors and MCP server')
      printRaw('    - Agent pipelines')
      printRaw('')
      printRaw('  Safe mode preserves:')
      printRaw('    - Graph read access (banyan inspect, banyan graph)')
      printRaw('    - Export access (banyan export)')
      printRaw('    - Repair access (banyan repair, banyan validate)')
      printRaw('')

      // Write safe mode flag to config
      const { saveConfig } = await import('../config.js')
      saveConfig({ ...config, safeMode: true } as any)

      printSuccess('Safe mode active.')
      print('Restart the runtime for safe mode to take effect.')
      print("Exit safe mode with: banyan safe-mode --exit")
    })
}

// ============================================================
// VALIDATION ENGINE
// ============================================================

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  table: string
  description: string
  count?: number
  autoRepairable: boolean
}

function runValidation(dbPath: string): ValidationIssue[] {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath, { readonly: true })
  const issues: ValidationIssue[] = []

  try {
    // Check for orphan relationships (edges to deleted nodes)
    const orphanEdges = db.prepare(`
      SELECT COUNT(*) as n FROM relationships r
      WHERE r.status = 'active'
        AND (
          NOT EXISTS (SELECT 1 FROM entities WHERE id = r.from_id AND status = 'active')
          OR NOT EXISTS (SELECT 1 FROM entities WHERE id = r.to_id AND status = 'active')
        )
    `).get() as { n: number }

    if (orphanEdges.n > 0) {
      issues.push({
        severity: 'error',
        table: 'relationships',
        description: 'Orphan relationships — edges pointing to deleted nodes',
        count: orphanEdges.n,
        autoRepairable: true,
      })
    }

    // Check for nodes exceeding weight bounds
    const badWeights = db.prepare(`
      SELECT COUNT(*) as n FROM entities
      WHERE weight < 0.0 OR weight > 1.0
    `).get() as { n: number }

    if (badWeights.n > 0) {
      issues.push({
        severity: 'error',
        table: 'entities',
        description: 'Nodes with invalid weight values (outside 0.0–1.0)',
        count: badWeights.n,
        autoRepairable: true,
      })
    }

    // Check for memories pointing to deleted entities
    const orphanMemories = db.prepare(`
      SELECT COUNT(*) as n FROM memories m
      WHERE m.status = 'active'
        AND m.entity_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM entities WHERE id = m.entity_id AND status = 'active')
    `).get() as { n: number }

    if (orphanMemories.n > 0) {
      issues.push({
        severity: 'warning',
        table: 'memories',
        description: 'Memories linked to deleted entities',
        count: orphanMemories.n,
        autoRepairable: true,
      })
    }

    // Check for nodes beyond the hard limit
    const nodeCount = db.prepare(`
      SELECT COUNT(*) as n FROM entities WHERE status = 'active'
    `).get() as { n: number }

    if (nodeCount.n > 500) {
      issues.push({
        severity: 'warning',
        table: 'entities',
        description: `Node count (${nodeCount.n}) exceeds Phase 1 limit of 500`,
        autoRepairable: false,
      })
    }

    // Check for duplicate active relationships
    const dupRels = db.prepare(`
      SELECT from_id, to_id, type, COUNT(*) as n
      FROM relationships
      WHERE status = 'active'
      GROUP BY from_id, to_id, type
      HAVING n > 1
    `).all()

    if (dupRels.length > 0) {
      issues.push({
        severity: 'warning',
        table: 'relationships',
        description: 'Duplicate active relationships between the same node pair',
        count: dupRels.length,
        autoRepairable: true,
      })
    }

    return issues
  } finally {
    db.close()
  }
}

// ============================================================
// REPAIR ENGINE
// ============================================================

interface RepairResult {
  description: string
  repaired: boolean
  note?: string
}

function runRepairs(
  dbPath: string,
  issues: ValidationIssue[],
  dryRun: boolean
): RepairResult[] {
  const Database = require('better-sqlite3')
  const db = dryRun ? new Database(dbPath, { readonly: true }) : new Database(dbPath)
  const results: RepairResult[] = []

  try {
    for (const issue of issues) {
      if (!issue.autoRepairable) {
        results.push({
          description: issue.description,
          repaired: false,
          note: 'Requires manual review — run banyan inspect to investigate.',
        })
        continue
      }

      if (dryRun) {
        results.push({
          description: issue.description,
          repaired: false,
          note: 'Dry run — would repair automatically.',
        })
        continue
      }

      try {
        if (issue.description.includes('Orphan relationships')) {
          db.prepare(`
            UPDATE relationships SET status = 'archived', updated_at = ?
            WHERE status = 'active'
              AND (
                NOT EXISTS (SELECT 1 FROM entities WHERE id = from_id AND status = 'active')
                OR NOT EXISTS (SELECT 1 FROM entities WHERE id = to_id AND status = 'active')
              )
          `).run(Date.now())
          results.push({ description: issue.description, repaired: true })
        }

        else if (issue.description.includes('invalid weight')) {
          db.prepare(`
            UPDATE entities SET weight = MAX(0.0, MIN(1.0, weight)), updated_at = ?
            WHERE weight < 0.0 OR weight > 1.0
          `).run(Date.now())
          results.push({ description: issue.description, repaired: true })
        }

        else if (issue.description.includes('Memories linked to deleted')) {
          db.prepare(`
            UPDATE memories SET entity_id = NULL, updated_at = ?
            WHERE status = 'active'
              AND entity_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM entities WHERE id = entity_id AND status = 'active')
          `).run(Date.now())
          results.push({ description: issue.description, repaired: true })
        }

        else if (issue.description.includes('Duplicate active relationships')) {
          // Keep the most recent, archive the rest
          db.prepare(`
            UPDATE relationships SET status = 'archived', updated_at = ?
            WHERE status = 'active'
              AND id NOT IN (
                SELECT MAX(id) FROM relationships
                WHERE status = 'active'
                GROUP BY from_id, to_id, type
              )
          `).run(Date.now())
          results.push({ description: issue.description, repaired: true })
        }

        else {
          results.push({ description: issue.description, repaired: false, note: 'No automatic repair available.' })
        }
      } catch (err) {
        results.push({
          description: issue.description,
          repaired: false,
          note: `Repair failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    return results
  } finally {
    db.close()
  }
}

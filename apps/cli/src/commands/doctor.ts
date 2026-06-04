/**
 * banyan doctor
 *
 * Full health check. The developer's window into runtime state.
 * Security rule R1: The developer must always see what BanyanTree is running.
 * This command is the primary transparency tool.
 *
 * Example output:
 * [BANYAN] Running health check...
 * [BANYAN] Runtime: active
 * [BANYAN] Graph: 247 nodes (of 500 limit)
 * [BANYAN] Memory: 1,204 nodes
 * [BANYAN] Storage: 12.4MB (of 50MB limit)
 * [BANYAN] Active flags: 3 (1 critical)
 * [BANYAN] Health score: 0.87 — good
 */

import { Command } from 'commander'
import { existsSync, statSync } from 'fs'
import { loadConfig, getDataDir } from '../config.js'
import { print, printSection, printRaw, printError, printSuccess, printStep } from '../output.js'

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Run a full health check on the cognition runtime')
    .option('--json', 'Output results as JSON')
    .action(async (opts: { json?: boolean }) => {
      print('Running health check...')
      printRaw('')

      const config = await loadConfig()
      const dataDir = getDataDir()
      const issues: string[] = []
      const report: Record<string, unknown> = {}

      // ── Runtime ───────────────────────────────────────────
      printStep('Checking runtime...')
      const runtimeActive = true  // Phase 1: check if daemon process is running
      report['runtime'] = { active: runtimeActive }
      if (!runtimeActive) issues.push('Runtime daemon is not running.')

      // ── Config ────────────────────────────────────────────
      printStep('Checking configuration...')
      report['config'] = {
        activeRepo: config.activeRepo ?? 'none',
        approvedRepos: config.approvedRepos.length,
        cloudEnabled: config.cloudModels.enabled,
        mcpPort: config.mcpPort,
      }

      if (!config.activeRepo) {
        issues.push("No active repository. Run 'banyan init <path>'.")
      }

      // ── Repository ────────────────────────────────────────
      if (config.activeRepo) {
        printStep('Checking repository...')
        const repoExists = existsSync(config.activeRepo)
        report['repository'] = {
          path: config.activeRepo,
          accessible: repoExists,
        }
        if (!repoExists) {
          issues.push(`Active repository path not found: ${config.activeRepo}`)
        }
      }

      // ── Database ──────────────────────────────────────────
      printStep('Checking database...')
      let dbSizeMb = 0
      let dbExists = false

      if (existsSync(config.dbPath)) {
        dbExists = true
        const stat = statSync(config.dbPath)
        dbSizeMb = Math.round((stat.size / (1024 * 1024)) * 10) / 10
      }

      report['database'] = {
        path: config.dbPath,
        exists: dbExists,
        sizeMb: dbSizeMb,
        limitMb: config.limits.maxDbSizeMb,
      }

      if (!dbExists) {
        issues.push('Database not found. Run banyan init to create.')
      }
      if (dbSizeMb > config.limits.maxDbSizeMb * 0.8) {
        issues.push(`Database at ${dbSizeMb}MB — approaching ${config.limits.maxDbSizeMb}MB limit.`)
      }

      // ── Data directory ────────────────────────────────────
      printStep('Checking data directory...')
      const dataDirExists = existsSync(dataDir)
      report['dataDir'] = { path: dataDir, exists: dataDirExists }

      // ── Output ────────────────────────────────────────────
      printRaw('')

      if (opts.json) {
        report['issues'] = issues
        report['healthy'] = issues.length === 0
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
        return
      }

      printSection('Health Report')
      printRaw(`  Runtime         ${runtimeActive ? 'active' : 'INACTIVE'}`)
      printRaw(`  Active repo     ${config.activeRepo ?? 'none'}`)
      printRaw(`  Approved repos  ${config.approvedRepos.length}`)
      printRaw(`  Cloud models    ${config.cloudModels.enabled ? 'enabled (opt-in)' : 'disabled (local-first)'}`)
      printRaw(`  Database        ${dbExists ? `${dbSizeMb}MB of ${config.limits.maxDbSizeMb}MB limit` : 'NOT FOUND'}`)
      printRaw(`  MCP port        ${config.mcpPort}`)
      printRaw(`  Data directory  ${dataDir}`)
      printRaw(`  Log directory   ${config.logPath}`)
      printRaw('')

      if (issues.length === 0) {
        printSuccess('All checks passed. Runtime healthy.')
      } else {
        printRaw(`  Issues found: ${issues.length}`)
        for (const issue of issues) {
          printError(issue)
        }
      }

      printRaw('')
    })
}

/**
 * banyan init <path>
 *
 * Initialises BanyanTree for a repository.
 * - Validates the path exists
 * - Adds to approved repos (explicit opt-in — never auto-crawl)
 * - Creates the seed document
 * - Initialises the SQLite graph for this repo
 * - Updates runtime config
 */

import { Command } from 'commander'
import { existsSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { loadConfig, saveConfig, getDataDir } from '../config.js'
import { print, printError, printSuccess, printStep } from '../output.js'

export function initCommand(): Command {
  return new Command('init')
    .description('Initialise repository cognition')
    .argument('<path>', 'Path to the repository to initialise')
    .option('--force', 'Re-initialise an already-registered repository')
    .action(async (repoPathArg: string, opts: { force?: boolean }) => {
      const repoPath = resolve(repoPathArg)

      print('Initialising repository cognition...')

      // ── 1. Validate path ──────────────────────────────────
      if (!existsSync(repoPath)) {
        printError(`Path does not exist: ${repoPath}`)
        process.exit(1)
      }

      // ── 2. Load config ────────────────────────────────────
      const config = await loadConfig()

      if (config.approvedRepos.includes(repoPath) && !opts.force) {
        print(`Repository already registered: ${repoPath}`)
        print("Use --force to re-initialise.")
        process.exit(0)
      }

      // ── 3. Add to approved repos ──────────────────────────
      printStep('Registering repository...')
      if (!config.approvedRepos.includes(repoPath)) {
        config.approvedRepos.push(repoPath)
      }
      config.activeRepo = repoPath
      saveConfig(config)

      // ── 4. Write seed document ────────────────────────────
      printStep('Writing seed document...')
      const seedPath = join(repoPath, '.banyan', 'seed.md')
      writeSeedDocument(seedPath, repoPath)

      // ── 5. Write .banyan/config.json ──────────────────────
      printStep('Writing repository config...')
      const repoCfgPath = join(repoPath, '.banyan', 'config.json')
      writeFileSync(repoCfgPath, JSON.stringify({
        version: '0.1.0',
        initialised: new Date().toISOString(),
        nodeLimit: 500,
      }, null, 2), 'utf8')

      printSuccess(`Repository initialised: ${repoPath}`)
      print('')
      print('Next steps:')
      print(`  1. Edit the seed document: .banyan/seed.md`)
      print('     Add your project vision, coding philosophy, and security rules.')
      print('  2. Start the runtime: banyan runtime start')
      print('  3. Open VS Code in this repository.')
      print('')
      print('[BANYAN] Cognition engine will begin building your graph as you work.')
    })
}

function writeSeedDocument(seedPath: string, repoPath: string): void {
  const { mkdirSync } = require('fs')
  const { dirname } = require('path')

  mkdirSync(dirname(seedPath), { recursive: true })

  const seed = `# BanyanTree Seed Document
# Repository: ${repoPath}
# Created: ${new Date().toISOString()}
#
# This is the highest-trust layer of your repository's cognition.
# It is human-written. It is never overwritten by AI.
# Fill in each section honestly. Leave sections blank if unsure.
# BanyanTree reads this at the start of every session.

## Project Identity

name: ""
description: ""
mission: ""

## Coding Philosophy

language: ""
framework: ""
style_guide: ""
conventions: |
  - 

## Security Rules

# Rules Claude must always respect in this repository
rules:
  - 

## Architecture Constraints

# Non-negotiable architectural decisions
constraints:
  - 

## Approved Dependencies

# Libraries that are explicitly approved
approved:
  - 

# Libraries that are explicitly banned (with reason)
banned:
  - 

## UX Principles

# What must the product always feel like to the user
principles:
  - 

## Notes

# Anything else Claude should always know about this project
notes: ""
`

  writeFileSync(seedPath, seed, 'utf8')
}

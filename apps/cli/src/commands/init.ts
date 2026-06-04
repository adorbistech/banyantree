/**
 * banyan init <path>
 *
 * Initialises BanyanTree for a repository.
 */

import { Command } from 'commander'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { loadConfig, saveConfig } from '../config.js'
import { print, printError, printSuccess, printStep } from '../output.js'

export function initCommand(): Command {
  return new Command('init')
    .description('Initialise repository cognition')
    .argument('<path>', 'Path to the repository to initialise')
    .option('--force', 'Re-initialise an already-registered repository')
    .action(async (repoPathArg: string, opts: { force?: boolean }) => {
      const repoPath = resolve(repoPathArg)

      print('Initialising repository cognition...')

      if (!existsSync(repoPath)) {
        printError(`Path does not exist: ${repoPath}`)
        process.exit(1)
      }

      const config = await loadConfig()

      if (config.approvedRepos.includes(repoPath) && !opts.force) {
        print(`Repository already registered: ${repoPath}`)
        print('Use --force to re-initialise.')
        process.exit(0)
      }

      printStep('Registering repository...')
      if (!config.approvedRepos.includes(repoPath)) {
        config.approvedRepos.push(repoPath)
      }
      config.activeRepo = repoPath
      saveConfig(config)

      printStep('Writing seed document...')
      const banyanDir = join(repoPath, '.banyan')
      const seedPath = join(banyanDir, 'seed.md')

      if (!existsSync(banyanDir)) {
        mkdirSync(banyanDir, { recursive: true })
      }

      writeSeedDocument(seedPath, repoPath)

      printStep('Writing repository config...')
      const repoCfgPath = join(banyanDir, 'config.json')
      writeFileSync(repoCfgPath, JSON.stringify({
        version: '0.1.0',
        initialised: new Date().toISOString(),
        nodeLimit: 500,
      }, null, 2), 'utf8')

      printSuccess(`Repository initialised: ${repoPath}`)
      print('')
      print('Next steps:')
      print('  1. Edit the seed document: .banyan/seed.md')
      print('     Add your project vision, coding philosophy, and security rules.')
      print('  2. Open VS Code in this repository.')
      print('  3. banyan doctor  (verify everything is healthy)')
      print('')
    })
}

function writeSeedDocument(seedPath: string, repoPath: string): void {
  const seed = `# BanyanTree Seed Document
# Repository: ${repoPath}
# Created: ${new Date().toISOString()}
#
# This is the highest-trust layer of your repository cognition.
# It is human-written. It is never overwritten by AI.
# Fill in each section honestly. Leave sections blank if unsure.
# BanyanTree reads this at the start of every Claude session.

## Project Identity

name: ""
description: ""
mission: ""

## Coding Philosophy

language: ""
framework: ""
conventions: |
  - 

## Security Rules

rules:
  - 

## Architecture Constraints

constraints:
  - 

## Approved Dependencies

approved:
  - 

banned:
  - 

## Notes

notes: ""
`

  writeFileSync(seedPath, seed, 'utf8')
}

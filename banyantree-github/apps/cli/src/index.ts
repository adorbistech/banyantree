#!/usr/bin/env node
/**
 * banyan — BanyanTree CLI
 *
 * Output style: [BANYAN] prefix. No emojis. No AI personality.
 * Infrastructure-grade, operational, deterministic.
 *
 * Commands:
 *   banyan init <path>     — initialise repository cognition
 *   banyan status          — show runtime and graph status
 *   banyan inspect         — browse all stored memory nodes
 *   banyan graph           — show graph statistics
 *   banyan memory          — list recent session memories
 *   banyan doctor          — full health check
 *   banyan export          — export graph as JSON
 *   banyan forget <id>     — delete a memory node
 *   banyan replay <id>     — replay a past session's reasoning
 *   banyan logs            — show recent runtime logs
 */

import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { statusCommand } from './commands/status.js'
import { inspectCommand } from './commands/inspect.js'
import { graphCommand } from './commands/graph.js'
import { memoryCommand } from './commands/memory.js'
import { doctorCommand } from './commands/doctor.js'
import { exportCommand } from './commands/export.js'
import { forgetCommand } from './commands/forget.js'
import { replayCommand } from './commands/replay.js'
import { logsCommand } from './commands/logs.js'
import { repairCommand, validateCommand, safeModeCommand } from './commands/repair.js'

const VERSION = '0.1.0'

const program = new Command()

program
  .name('banyan')
  .description('BanyanTree — Persistent Repository Cognition Runtime')
  .version(VERSION, '-v, --version')
  .addHelpText('before', `
[BANYAN] BanyanTree v${VERSION}
[BANYAN] Persistent Repository Cognition Runtime
[BANYAN] Local-first. Developer-owned. Inspectable.
`)

// Repository commands
program.addCommand(initCommand())
program.addCommand(statusCommand())
program.addCommand(inspectCommand())
program.addCommand(graphCommand())

// Memory commands
program.addCommand(memoryCommand())
program.addCommand(forgetCommand())
program.addCommand(replayCommand())

// Runtime commands
program.addCommand(doctorCommand())
program.addCommand(logsCommand())

// Runtime maintenance
program.addCommand(repairCommand())
program.addCommand(validateCommand())
program.addCommand(safeModeCommand())

// Export
program.addCommand(exportCommand())

program.parse(process.argv)

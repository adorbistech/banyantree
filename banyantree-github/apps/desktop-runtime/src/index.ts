/**
 * BanyanTree Local Runtime Daemon
 *
 * The cognition engine. Runs locally. No hidden cloud dependency.
 * Responsibilities: session observation, file watching, event bus,
 * memory lifecycle management, graph maintenance.
 *
 * Constitutional rule R05: No autonomous execution of any kind.
 * This daemon observes and records. It never modifies user code.
 */

import { EventBus } from './event-bus.js'
import { FileWatcher } from './file-watcher.js'
import { SessionObserver } from './session-observer.js'
import { RuntimeLogger } from './logger.js'
import { loadConfig, type RuntimeConfig } from './config.js'
import { platform } from 'os'
import { join } from 'path'

const VERSION = '0.1.0'
const log = new RuntimeLogger('runtime')

// ============================================================
// RUNTIME STATE
// ============================================================

interface RuntimeState {
  startedAt: number
  repoPath: string | null
  sessionId: string | null
  healthy: boolean
}

const state: RuntimeState = {
  startedAt: Date.now(),
  repoPath: null,
  sessionId: null,
  healthy: true,
}

// ============================================================
// MAIN ENTRY
// ============================================================

async function main(): Promise<void> {
  log.info(`BanyanTree Runtime v${VERSION}`)
  log.info(`Platform: ${platform()}`)
  log.info(`Node: ${process.version}`)

  const config = await loadConfig()

  if (!config.activeRepo) {
    log.info('No active repository configured.')
    log.info("Run 'banyan init <path>' to initialise a repository.")
    log.info('Runtime standing by.')
    await standby()
    return
  }

  state.repoPath = config.activeRepo
  log.info(`Active repository: ${config.activeRepo}`)

  await startCognitionEngine(config)
}

// ============================================================
// COGNITION ENGINE STARTUP
// ============================================================

async function startCognitionEngine(config: RuntimeConfig): Promise<void> {
  log.info('Starting cognition engine...')

  // Event bus — internal message passing between components
  const bus = new EventBus()

  // File watcher — observes repository for changes
  const watcher = new FileWatcher(config.activeRepo!, bus)

  // Session observer — tracks AI sessions and extracts memory signals
  const observer = new SessionObserver(config, bus)

  // Wire shutdown handlers
  process.on('SIGINT', () => shutdown(watcher, observer, bus))
  process.on('SIGTERM', () => shutdown(watcher, observer, bus))

  // Start components in order
  await bus.start()
  log.info('Event bus started.')

  await watcher.start()
  log.info('File watcher started.')

  await observer.start()
  log.info('Session observer started.')

  log.info('Cognition engine active.')
  log.info(`Runtime healthy. Memory nodes: loading...`)

  // Heartbeat — confirms runtime is alive, logged every 5 minutes
  const heartbeat = setInterval(() => {
    log.debug('Heartbeat — runtime healthy.')
  }, 5 * 60 * 1000)

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', resolve)
    process.on('SIGTERM', resolve)
  })

  clearInterval(heartbeat)
}

// ============================================================
// STANDBY MODE
// No active repository. Runtime is alive but idle.
// ============================================================

async function standby(): Promise<void> {
  log.info('Standby mode. Waiting for repository initialisation.')
  await new Promise<void>((resolve) => {
    process.on('SIGINT', resolve)
    process.on('SIGTERM', resolve)
  })
}

// ============================================================
// SHUTDOWN
// ============================================================

async function shutdown(
  watcher: FileWatcher,
  observer: SessionObserver,
  bus: EventBus,
): Promise<void> {
  log.info('Shutdown signal received.')
  log.info('Flushing pending events...')

  try {
    await observer.stop()
    await watcher.stop()
    await bus.stop()
    log.info('Runtime stopped cleanly.')
  } catch (err) {
    log.error('Error during shutdown:', err)
  }

  process.exit(0)
}

// ============================================================
// BOOT
// ============================================================

main().catch((err) => {
  log.error('Fatal runtime error:', err)
  process.exit(1)
})

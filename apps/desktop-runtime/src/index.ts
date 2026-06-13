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
import { Indexer } from '../../../services/indexer/src/indexer.js'
import { RuntimeLogger } from './logger.js'
import { loadConfig, type RuntimeConfig } from './config.js'
import { platform } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

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

  // Start event bus first — all components depend on it
  await bus.start()
  log.info('Event bus started.')

  // ── SQLite database (must be ready before observer starts) ──
  const db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  log.info(`Database opened: ${config.dbPath}`)

  // ── Resolve repoId from repositories table ────────────────
  let repoRow = db.prepare(
    'SELECT id FROM repositories WHERE path = ?'
  ).get(config.activeRepo!) as { id: string } | undefined

  if (!repoRow) {
    const newId = randomUUID()
    const repoName = config.activeRepo!.split(/[\\/]/).pop() ?? 'unknown'
    db.prepare(
      'INSERT INTO repositories (id, name, path, created_at, last_active, node_count, status) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(newId, repoName, config.activeRepo!, Date.now(), Date.now(), 'active')
    repoRow = { id: newId }
    log.info(`Registered new repository: ${repoName} (${newId})`)
  }

  const repoId = repoRow.id

  // Update last_active timestamp
  db.prepare('UPDATE repositories SET last_active = ? WHERE id = ?').run(Date.now(), repoId)

  // ── Indexer — file event → parser → graph → SQLite ────────
  const indexer = new Indexer(
    { repoRoot: config.activeRepo!, repoId, dbPath: config.dbPath },
    bus,
    db
  )
  indexer.start()
  log.info('[BANYAN:RUNTIME] Indexer started.')

  // ── Session persistence — write session lifecycle to DB ────
  bus.on('session:started', (event) => {
    try {
      db.prepare(
        'INSERT INTO sessions (id, repo_id, started_at, files_touched, node_count, status) VALUES (?, ?, ?, ?, 0, ?)'
      ).run(
        event.payload['sessionId'] as string,
        repoId,
        event.payload['startedAt'] as number,
        '[]',
        'active'
      )
    } catch (err) {
      log.error('Failed to persist session start:', err)
    }
  })

  bus.on('session:ended', (event) => {
    try {
      const files = event.payload['filesObserved'] as string[] | undefined
      db.prepare(
        'UPDATE sessions SET ended_at = ?, files_touched = ?, status = ? WHERE id = ?'
      ).run(
        event.payload['endedAt'] as number,
        JSON.stringify(files ?? []),
        'completed',
        event.payload['sessionId'] as string
      )
    } catch (err) {
      log.error('Failed to persist session end:', err)
    }
  })

  // ── Event logging — persist key bus events to events table ──
  const logBusEvent = (type: string, actor: string, entityId?: string, payload?: Record<string, unknown>) => {
    try {
      db.prepare(
        'INSERT INTO events (id, repo_id, type, actor, entity_id, memory_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), repoId, type, actor, entityId ?? null, null, payload ? JSON.stringify(payload) : null, Date.now())
    } catch (err) {
      log.error(`Failed to log event ${type}:`, err)
    }
  }

  bus.on('session:started', (event) => {
    logBusEvent('session_started', 'system', null, { sessionId: event.payload['sessionId'] })
  })

  bus.on('session:ended', (event) => {
    logBusEvent('session_ended', 'system', null, {
      sessionId: event.payload['sessionId'],
      durationMs: event.payload['durationMs'],
      filesObserved: event.payload['filesObserved'],
    })
  })

  bus.on('node:create', (event) => {
    logBusEvent('node_created', 'indexer', null, {
      filePath: event.payload['filePath'],
      entityCount: event.payload['entityCount'],
    })
  })

  bus.on('node:quarantine', (event) => {
    logBusEvent('node_quarantined', 'indexer', null, {
      relativePath: event.payload['relativePath'],
      entityCount: event.payload['entityCount'],
    })
  })

  // ── Startup event — proves writes work ─────────────────────
  const startupEventId = randomUUID()
  db.prepare(
    'INSERT INTO events (id, repo_id, type, actor, entity_id, memory_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    startupEventId,
    repoId,
    'runtime_started',
    'system',
    null,
    null,
    JSON.stringify({ version: VERSION, platform: platform(), node: process.version }),
    Date.now()
  )
  log.info(`Startup event written: ${startupEventId}`)

  // ── Start file watcher and session observer ────────────────
  // Started AFTER DB and bus listeners are wired so the initial
  // session:started event is captured in the sessions table.
  await watcher.start()
  log.info('File watcher started.')

  await observer.start()
  log.info('Session observer started.')

  // Wire shutdown handlers
  process.on('SIGINT', () => shutdown(watcher, observer, bus, db))
  process.on('SIGTERM', () => shutdown(watcher, observer, bus, db))

  log.info('Cognition engine active.')
  log.info(`Runtime healthy. Repo: ${repoId}`)

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
  db?: Database.Database,
): Promise<void> {
  log.info('Shutdown signal received.')
  log.info('Flushing pending events...')

  try {
    await observer.stop()
    await watcher.stop()
    await bus.stop()
    if (db) {
      db.close()
      log.info('Database closed.')
    }
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

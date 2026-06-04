/**
 * BanyanTree Session Observer
 *
 * Observes developer working sessions and extracts memory signals.
 * A "session" = one continuous working period.
 *
 * Phase 1: observes file activity patterns to detect session boundaries.
 * Phase 2: will observe Claude/Cursor sessions via MCP event stream.
 *
 * Constitutional rule R03: Memory shown to developer first, Claude second.
 * This observer collects raw signals. Memory creation is a separate step
 * that requires developer visibility before anything is stored.
 */

import { RuntimeLogger } from './logger.js'
import { type EventBus } from './event-bus.js'
import { type RuntimeConfig } from './config.js'
import { v4 as uuid } from 'uuid'

// Session boundary detection
// If no file activity for SESSION_IDLE_MS, session is considered ended
const SESSION_IDLE_MS = 30 * 60 * 1000  // 30 minutes

interface ActiveSession {
  id: string
  startedAt: number
  lastActivity: number
  filesObserved: Set<string>
}

export class SessionObserver {
  private config: RuntimeConfig
  private bus: EventBus
  private log: RuntimeLogger
  private currentSession: ActiveSession | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private running = false

  constructor(config: RuntimeConfig, bus: EventBus) {
    this.config = config
    this.bus = bus
    this.log = new RuntimeLogger('sessionobs')
  }

  async start(): Promise<void> {
    this.running = true

    // Listen to file events as session activity signals
    this.bus.on('file:changed', (event) => {
      this.recordActivity(event.payload['relativePath'] as string)
    })

    this.bus.on('file:created', (event) => {
      this.recordActivity(event.payload['relativePath'] as string)
    })

    // Start initial session
    this.startSession()

    this.log.debug('Session observer active.')
  }

  async stop(): Promise<void> {
    this.running = false

    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }

    if (this.currentSession) {
      this.endSession('shutdown')
    }

    this.log.debug('Session observer stopped.')
  }

  // --------------------------------------------------------
  // SESSION LIFECYCLE
  // --------------------------------------------------------

  private startSession(): void {
    const session: ActiveSession = {
      id: uuid(),
      startedAt: Date.now(),
      lastActivity: Date.now(),
      filesObserved: new Set(),
    }

    this.currentSession = session

    this.bus.emit('session:started', {
      sessionId: session.id,
      startedAt: session.startedAt,
    }, 'sessionobs')

    this.log.info(`Session started: ${session.id}`)
    this.resetIdleTimer()
  }

  private endSession(reason: string): void {
    if (!this.currentSession) return

    const session = this.currentSession
    const duration = Date.now() - session.startedAt

    this.bus.emit('session:ended', {
      sessionId: session.id,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      durationMs: duration,
      filesObserved: Array.from(session.filesObserved),
      reason,
    }, 'sessionobs')

    this.log.info(
      `Session ended: ${session.id} ` +
      `(${Math.round(duration / 60000)}m, ${session.filesObserved.size} files)`
    )

    this.currentSession = null
  }

  private recordActivity(filePath: string): void {
    if (!this.running) return

    // Start a new session if none is active
    if (!this.currentSession) {
      this.startSession()
    }

    this.currentSession!.lastActivity = Date.now()
    this.currentSession!.filesObserved.add(filePath)

    this.bus.emit('session:activity', {
      sessionId: this.currentSession!.id,
      filePath,
      timestamp: Date.now(),
    }, 'sessionobs')

    this.resetIdleTimer()
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }

    this.idleTimer = setTimeout(() => {
      if (this.currentSession) {
        this.log.debug('Session idle timeout reached.')
        this.endSession('idle')
      }
    }, SESSION_IDLE_MS)
  }
}

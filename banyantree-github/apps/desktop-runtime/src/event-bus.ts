/**
 * BanyanTree Event Bus
 *
 * Internal pub/sub for runtime components.
 * All cognition events flow through here.
 * No external networking. No hidden calls.
 *
 * Event types mirror the SQLite EventType in core/storage/types.ts
 */

import { EventEmitter } from 'events'
import { RuntimeLogger } from './logger.js'

export type BusEventType =
  | 'file:changed'
  | 'file:created'
  | 'file:deleted'
  | 'session:started'
  | 'session:ended'
  | 'session:activity'
  | 'memory:create'
  | 'memory:reinforce'
  | 'memory:correct'
  | 'memory:decay'
  | 'node:create'
  | 'node:update'
  | 'node:quarantine'
  | 'node:delete'
  | 'flag:create'
  | 'flag:acknowledge'
  | 'graph:health-check'
  | 'runtime:shutdown'

export interface BusEvent {
  type: BusEventType
  payload: Record<string, unknown>
  timestamp: number
  source: string   // which component emitted this
}

export class EventBus {
  private emitter: EventEmitter
  private log: RuntimeLogger
  private queue: BusEvent[] = []
  private running = false

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(50)
    this.log = new RuntimeLogger('eventbus')
  }

  async start(): Promise<void> {
    this.running = true
    this.log.debug('Event bus started.')
  }

  async stop(): Promise<void> {
    this.running = false
    // Flush remaining queue
    if (this.queue.length > 0) {
      this.log.debug(`Flushing ${this.queue.length} pending events.`)
      this.queue = []
    }
    this.emitter.removeAllListeners()
    this.log.debug('Event bus stopped.')
  }

  // --------------------------------------------------------
  // EMIT
  // --------------------------------------------------------

  emit(type: BusEventType, payload: Record<string, unknown>, source: string): void {
    const event: BusEvent = {
      type,
      payload,
      timestamp: Date.now(),
      source,
    }

    this.log.debug(`Event: ${type} from ${source}`)
    this.emitter.emit(type, event)
    this.emitter.emit('*', event)   // wildcard listener for debugging
  }

  // --------------------------------------------------------
  // SUBSCRIBE
  // --------------------------------------------------------

  on(type: BusEventType | '*', handler: (event: BusEvent) => void): void {
    this.emitter.on(type, handler)
  }

  off(type: BusEventType | '*', handler: (event: BusEvent) => void): void {
    this.emitter.off(type, handler)
  }

  once(type: BusEventType, handler: (event: BusEvent) => void): void {
    this.emitter.once(type, handler)
  }
}

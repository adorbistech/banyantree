/**
 * BanyanTree Indexer
 *
 * The first complete data pipeline:
 * File watcher event → Parser → Graph Engine → SQLite
 *
 * This is where Block 3 (runtime) meets Block 4 (parser)
 * meets Block 5 (graph engine).
 *
 * The indexer is NOT intelligent. It is a pipeline.
 * Intelligence lives in the graph weights and memory engine.
 *
 * Node creation policy is enforced by the graph engine.
 * The indexer's job is to feed the pipeline efficiently.
 */

import { parseFile } from '../../services/parser/src/index.js'
import { GraphEngine, type IngestContext } from '../../core/graph/src/index.js'
import { RuntimeLogger } from '../../apps/desktop-runtime/src/logger.js'
import type { EventBus, BusEvent } from '../../apps/desktop-runtime/src/event-bus.js'
import Database from 'better-sqlite3'

export interface IndexerConfig {
  repoRoot: string
  repoId: string
  dbPath: string
}

export class Indexer {
  private config: IndexerConfig
  private bus: EventBus
  private graph: GraphEngine
  private db: Database.Database
  private log: RuntimeLogger
  private currentSessionId: string | null = null
  private processing = new Set<string>()   // prevent concurrent parse of same file

  constructor(config: IndexerConfig, bus: EventBus, db: Database.Database) {
    this.config = config
    this.bus = bus
    this.db = db
    this.graph = new GraphEngine(db, config.repoId)
    this.log = new RuntimeLogger('indexer')
  }

  // ============================================================
  // START
  // Subscribe to file events from the runtime event bus
  // ============================================================

  start(): void {
    // File changed — parse and update graph
    this.bus.on('file:changed', (event) => {
      this.handleFileEvent(event, 'session_reference')
    })

    // File created — parse and add to graph
    this.bus.on('file:created', (event) => {
      this.handleFileEvent(event, 'session_reference')
    })

    // File deleted — remove from graph (soft)
    this.bus.on('file:deleted', (event) => {
      this.handleFileDeletion(event)
    })

    // Session started — track session ID for node eligibility
    this.bus.on('session:started', (event) => {
      this.currentSessionId = event.payload['sessionId'] as string
      this.log.debug(`Session tracking: ${this.currentSessionId}`)
    })

    // Session ended — clear session ID
    this.bus.on('session:ended', () => {
      this.currentSessionId = null
    })

    this.log.info('Indexer started.')
  }

  // ============================================================
  // FILE EVENT HANDLER
  // ============================================================

  private async handleFileEvent(
    event: BusEvent,
    trigger: IngestContext['triggeredBy']
  ): Promise<void> {
    const absolutePath = event.payload['absolutePath'] as string

    // Prevent concurrent processing of the same file
    if (this.processing.has(absolutePath)) return
    this.processing.add(absolutePath)

    try {
      const startMs = Date.now()

      // Parse
      const result = await parseFile(absolutePath, this.config.repoRoot)

      if (!result.success) {
        if (result.error.reason !== 'Path excluded by secrets policy') {
          this.log.debug(`Parse skip: ${result.error.reason}`)
        }
        return
      }

      // Ingest into graph
      const context: IngestContext = {
        sessionId: this.currentSessionId,
        triggeredBy: trigger,
      }

      const ingestResult = this.graph.ingest(result.file, context)

      const elapsedMs = Date.now() - startMs

      if (ingestResult.accepted) {
        this.log.debug(
          `Indexed: ${result.file.relativePath} ` +
          `(+${ingestResult.entitiesWritten} entities, ` +
          `+${ingestResult.relationshipsWritten} rels, ` +
          `${elapsedMs}ms)`
        )

        if (ingestResult.limitReached) {
          this.log.warn(
            'Graph node limit approaching 500. ' +
            "Run 'banyan doctor' to review pruning candidates."
          )
        }

        // Emit graph update event for the MCP server and VS Code extension
        this.bus.emit('node:create', {
          filePath: result.file.relativePath,
          entityCount: ingestResult.entitiesWritten,
          sessionId: this.currentSessionId,
        }, 'indexer')

      } else {
        this.log.debug(`Policy skip: ${result.file.relativePath} — ${ingestResult.reason}`)
      }

    } catch (err) {
      this.log.error(`Indexer error for ${absolutePath}:`, err)
    } finally {
      this.processing.delete(absolutePath)
    }
  }

  // ============================================================
  // FILE DELETION
  // Mark entities from this file as quarantined
  // ============================================================

  private handleFileDeletion(event: BusEvent): void {
    const relativePath = event.payload['relativePath'] as string

    try {
      // Soft-quarantine entities from deleted file
      const result = this.db.prepare(`
        UPDATE entities
        SET status = 'quarantine', updated_at = ?
        WHERE repo_id = ? AND path LIKE ? AND status = 'active'
      `).run(Date.now(), this.config.repoId, `%${relativePath}%`)

      if (result.changes > 0) {
        this.log.debug(
          `File deleted: quarantined ${result.changes} entities for ${relativePath}`
        )

        this.bus.emit('node:quarantine', {
          relativePath,
          entityCount: result.changes,
        }, 'indexer')
      }
    } catch (err) {
      this.log.error(`Deletion handler error for ${relativePath}:`, err)
    }
  }

  // ============================================================
  // FORCED INGEST
  // Used by banyan init to bootstrap the graph from key files
  // Only indexes files that are cognitively important to start
  // (does NOT index the entire repo — that is graph explosion)
  // ============================================================

  async ingestBootstrap(filePaths: string[]): Promise<{
    total: number
    indexed: number
    skipped: number
    errors: number
  }> {
    this.log.info(`Bootstrap indexing ${filePaths.length} files...`)

    let indexed = 0
    let skipped = 0
    let errors = 0

    for (const filePath of filePaths) {
      try {
        const result = await parseFile(filePath, this.config.repoRoot)

        if (!result.success) {
          skipped++
          continue
        }

        const ingestResult = this.graph.ingest(result.file, {
          sessionId: null,
          triggeredBy: 'forced',
        })

        if (ingestResult.accepted) {
          indexed++
        } else {
          skipped++
        }

        if (ingestResult.limitReached) {
          this.log.warn('Graph limit reached during bootstrap. Stopping.')
          break
        }

      } catch {
        errors++
      }
    }

    this.log.info(
      `Bootstrap complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors.`
    )

    return { total: filePaths.length, indexed, skipped, errors }
  }

  // ============================================================
  // CONTEXT ASSEMBLY
  // Delegates to graph engine — used by MCP server
  // ============================================================

  assembleFileContext(relativePath: string) {
    return this.graph.assembleFileContext(relativePath)
  }

  getGraphHealth() {
    return this.graph.checkIntegrity()
  }
}

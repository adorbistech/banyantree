/**
 * BanyanTree Memory Engine — Public API
 *
 * Block 6 complete. This is what transforms the graph from
 * "static structure" into "evolving cognition."
 *
 * The memory engine sits between the graph (Block 5) and the
 * MCP server (Block 7). It is what Claude actually reads.
 *
 * Full lifecycle:
 *   create → reinforce → correct → decay → delete
 *
 * Design principle from ChatGPT:
 * "Memory must attach to stable graph entities — NOT raw text blobs."
 *
 * That distinction is everything. A memory attached to entity ID
 * `file:src-auth-AuthService.ts:a3f9b2c1d4e5` is retrievable,
 * traversable, decayable, and correctable. A raw text blob is not.
 */

import Database from 'better-sqlite3'
import { MemoryEngine } from './engine.js'
import { extractFromSession, createExplicitMemory, extractOpenQuestions } from './extractor.js'
import type { MemoryNode, MemoryContext, CreateMemoryRequest } from './types.js'

export type { MemoryNode, MemoryContext, CreateMemoryRequest } from './types.js'
export { WEIGHTS, EXPIRY_MS, DECAY } from './types.js'

// ============================================================
// MEMORY COORDINATOR
// Combines the engine + extractor into the complete Block 6 API
// ============================================================

export class MemoryCoordinator {
  private engine: MemoryEngine
  private repoId: string

  constructor(db: Database.Database, repoId: string) {
    this.engine = new MemoryEngine(db, repoId)
    this.repoId = repoId
  }

  // ── Core lifecycle ────────────────────────────────────────

  create(req: CreateMemoryRequest): MemoryNode {
    return this.engine.create(req)
  }

  reinforce(id: string): MemoryNode | null {
    return this.engine.reinforce(id)
  }

  correct(supercededId: string, newContent: string, sessionId?: string | null): MemoryNode {
    return this.engine.correct(supercededId, newContent, sessionId ?? null)
  }

  decayAll(): { processed: number; archived: number } {
    return this.engine.decayAll()
  }

  softDelete(id: string): boolean {
    return this.engine.softDelete(id)
  }

  hardDelete(id: string): boolean {
    return this.engine.hardDelete(id)
  }

  hardDeleteAll(): number {
    return this.engine.hardDeleteAll()
  }

  // ── Context assembly ──────────────────────────────────────

  /** Get all memory relevant to a specific graph entity */
  getEntityContext(entityId: string): MemoryContext {
    return this.engine.assembleContext(entityId)
  }

  /** Get top memories across the entire repo — for MCP session start */
  getRepoContext(limit = 15): MemoryNode[] {
    return this.engine.assembleRepoContext(limit)
  }

  /** Get memories from a specific session */
  getSessionMemories(sessionId: string): MemoryNode[] {
    return this.engine.getSessionMemories(sessionId)
  }

  /** Search memory content */
  search(query: string, limit = 10): MemoryNode[] {
    return this.engine.search(query, limit)
  }

  getById(id: string): MemoryNode | null {
    return this.engine.getById(id)
  }

  /** Stats for banyan doctor */
  getStats() {
    return this.engine.getStats()
  }

  // ── Session signal processing ─────────────────────────────

  /**
   * processSessionEnd — called when a session ends.
   * Extracts memory signals and stores them.
   * These are candidates — developer sees them in sidebar
   * before they become structural memories.
   */
  processSessionEnd(
    sessionId: string,
    filesObserved: string[],
    durationMs: number,
    repoRoot: string
  ): MemoryNode[] {
    const signals = extractFromSession({
      repoId: this.repoId,
      sessionId,
      filesObserved,
      durationMs,
      repoRoot,
    })

    const created: MemoryNode[] = []
    for (const signal of signals) {
      if (signal.confidence >= 0.6) {
        const node = this.engine.create(signal)
        created.push(node)
      }
    }

    return created
  }

  /**
   * rememberExplicitly — developer pressed "Remember this" in VS Code
   * or ran `banyan memory add "..."` in CLI.
   * This is the highest-trust memory creation path.
   */
  rememberExplicitly(
    entityId: string | null,
    content: string,
    sessionId: string | null = null
  ): MemoryNode {
    const req = createExplicitMemory(this.repoId, entityId, content, sessionId)
    return this.engine.create(req)
  }

  /**
   * scanForOpenQuestions — called by memory agent after file changes.
   * Extracts TODO/FIXME/open question markers and stores as session memories.
   */
  scanForOpenQuestions(
    relativePath: string,
    fileContent: string,
    sessionId: string | null
  ): MemoryNode[] {
    const signals = extractOpenQuestions(this.repoId, relativePath, fileContent, sessionId)
    return signals.map(s => this.engine.create(s))
  }

  // ── Full file context (used by MCP and VS Code sidebar) ───

  /**
   * assembleFileContext — the aha moment payload.
   * Called when developer opens a file.
   * Returns everything BanyanTree knows about this file's history.
   *
   * R03: This is shown to the developer FIRST.
   *      Claude receives it SECOND via MCP.
   */
  assembleFileContext(entityId: string): {
    memories: MemoryNode[]
    corrections: MemoryNode[]
    openQuestions: MemoryNode[]
    hasContext: boolean
    contextSummary: string
  } {
    const ctx = this.engine.assembleContext(entityId)

    const hasContext = ctx.memories.length > 0

    // Build a human-readable summary for the VS Code sidebar
    const lines: string[] = []

    if (ctx.corrections.length > 0) {
      lines.push(`${ctx.corrections.length} correction(s) applied.`)
    }

    if (ctx.openQuestions.length > 0) {
      lines.push(`${ctx.openQuestions.length} open question(s) unresolved.`)
    }

    const structural = ctx.memories.filter(m => m.type === 'structural' && !m.isCorrection)
    if (structural.length > 0) {
      lines.push(`${structural.length} architectural decision(s) recorded.`)
    }

    const contextSummary = hasContext
      ? lines.join(' ')
      : 'No memory recorded for this file yet.'

    return {
      memories: ctx.memories,
      corrections: ctx.corrections,
      openQuestions: ctx.openQuestions,
      hasContext,
      contextSummary,
    }
  }
}

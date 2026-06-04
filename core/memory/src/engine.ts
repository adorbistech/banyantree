/**
 * BanyanTree Memory Engine
 *
 * The five operations that transform a static graph
 * into an evolving cognition system.
 *
 * Constitutional rules enforced here:
 * R04: Human correction is unconditionally final — corrections
 *      get weight 0.90 and the corrected memory is superseded.
 * R08: Developer owns everything — hard delete always available.
 * R13: No hidden mutations — every operation is logged to events table.
 *
 * Memory attaches to graph entity IDs (stable, deterministic).
 * This is what separates BanyanTree from raw vector stores.
 */

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import {
  WEIGHTS,
  EXPIRY_MS,
  DECAY,
  type MemoryNode,
  type CreateMemoryRequest,
  type MemoryContext,
  type MemoryType,
} from './types.js'

export class MemoryEngine {
  private db: Database.Database
  private repoId: string

  constructor(db: Database.Database, repoId: string) {
    this.db = db
    this.repoId = repoId
  }

  // ============================================================
  // CREATE
  // Store a new observation, decision, or question
  // ============================================================

  create(req: CreateMemoryRequest): MemoryNode {
    const id = uuid()
    const now = Date.now()

    // Determine weight and expiry based on type
    const weight = req.initialWeight ?? this.defaultWeight(req.type, req.isCorrection)
    const expiresAt = this.defaultExpiry(req.type, req.isCorrection, now)

    const node: MemoryNode = {
      id,
      repoId: this.repoId,
      entityId: req.entityId,
      type: req.type,
      content: req.content,
      weight,
      reinforcement: 0,
      isCorrection: req.isCorrection ?? false,
      correctsId: req.correctsId ?? null,
      sessionId: req.sessionId,
      createdAt: now,
      updatedAt: now,
      lastAccessed: null,
      expiresAt,
      status: 'active',
    }

    this.db.prepare(`
      INSERT INTO memories
        (id, repo_id, entity_id, type, content, weight, reinforcement,
         is_correction, corrects_id, session_id, created_at, updated_at,
         last_accessed, expires_at, status)
      VALUES
        (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, 'active')
    `).run(
      id, this.repoId, req.entityId, req.type, req.content,
      weight, req.isCorrection ? 1 : 0,
      req.correctsId ?? null, req.sessionId,
      now, now, expiresAt
    )

    // If this is a correction, supersede the old memory
    if (req.isCorrection && req.correctsId) {
      this.supersede(req.correctsId, id)
    }

    // Log creation event
    this.logEvent('memory_created', { memoryId: id, type: req.type, entityId: req.entityId })

    return node
  }

  // ============================================================
  // REINFORCE
  // Human explicitly marks memory as important
  // R04: Human correction is unconditionally final
  // Each reinforcement permanently boosts weight
  // ============================================================

  reinforce(id: string): MemoryNode | null {
    const memory = this.getById(id)
    if (!memory || memory.status !== 'active') return null

    const newWeight = Math.min(WEIGHTS.MAX, memory.weight + WEIGHTS.REINFORCEMENT_BOOST)
    const now = Date.now()

    this.db.prepare(`
      UPDATE memories
      SET weight = ?,
          reinforcement = reinforcement + 1,
          updated_at = ?,
          expires_at = NULL
      WHERE id = ?
    `).run(newWeight, now, id)

    // Reinforced memories never expire — clear expiry
    this.logEvent('memory_reinforced', {
      memoryId: id,
      newWeight,
      reinforcementCount: memory.reinforcement + 1,
    })

    return this.getById(id)
  }

  // ============================================================
  // CORRECT
  // Human says "that was wrong, remember this instead"
  // The most powerful operation — human cognition wins, always
  // R04: Human correction unconditionally final
  // ============================================================

  correct(
    supercededId: string,
    newContent: string,
    sessionId: string | null = null
  ): MemoryNode {
    const old = this.getById(supercededId)

    // Create the correction memory
    const correction = this.create({
      repoId: this.repoId,
      entityId: old?.entityId ?? null,
      type: old?.type ?? 'correction',
      content: newContent,
      sessionId,
      isCorrection: true,
      correctsId: supercededId,
      initialWeight: WEIGHTS.CORRECTION,
    })

    this.logEvent('memory_corrected', {
      oldId: supercededId,
      newId: correction.id,
      entityId: old?.entityId,
    })

    return correction
  }

  // ============================================================
  // DECAY
  // Called by the memory agent on a schedule
  // Corrections never decay. Human-reinforced memories decay slower.
  // ============================================================

  decay(id: string): { decayed: boolean; newWeight: number; archived: boolean } {
    const memory = this.getById(id)
    if (!memory || memory.status !== 'active') {
      return { decayed: false, newWeight: 0, archived: false }
    }

    // Corrections never decay
    if (memory.isCorrection) {
      return { decayed: false, newWeight: memory.weight, archived: false }
    }

    const decayAmount = memory.type === 'session'
      ? DECAY.SESSION_DAILY
      : DECAY.STRUCTURAL_WEEKLY

    // Reinforced memories decay at half rate
    const effectiveDecay = memory.reinforcement > 0
      ? decayAmount * 0.5
      : decayAmount

    const newWeight = Math.max(WEIGHTS.MIN, memory.weight - effectiveDecay)
    const now = Date.now()

    // Archive if weight drops below threshold
    const shouldArchive = newWeight < DECAY.MIN_BEFORE_ARCHIVE

    this.db.prepare(`
      UPDATE memories
      SET weight = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newWeight, shouldArchive ? 'archived' : 'active', now, id)

    if (shouldArchive) {
      this.logEvent('memory_decayed', { memoryId: id, newWeight, archived: true })
    }

    return { decayed: true, newWeight, archived: shouldArchive }
  }

  // ============================================================
  // DECAY BATCH
  // Run by the memory agent — decays all eligible memories
  // ============================================================

  decayAll(): { processed: number; archived: number } {
    const active = this.db.prepare(`
      SELECT id, weight, type, is_correction, reinforcement
      FROM memories
      WHERE repo_id = ? AND status = 'active' AND is_correction = 0
    `).all(this.repoId) as Array<{
      id: string
      weight: number
      type: string
      is_correction: number
      reinforcement: number
    }>

    let archived = 0

    for (const m of active) {
      const result = this.decay(m.id)
      if (result.archived) archived++
    }

    return { processed: active.length, archived }
  }

  // ============================================================
  // DELETE
  // Developer owns everything — deletion always available
  // R08: Hard delete is permanent and unconditional
  // ============================================================

  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE memories SET status = 'deleted', updated_at = ?
      WHERE id = ? AND repo_id = ?
    `).run(Date.now(), id, this.repoId)

    if (result.changes > 0) {
      this.logEvent('memory_decayed', { memoryId: id, reason: 'soft_delete' })
    }

    return result.changes > 0
  }

  hardDelete(id: string): boolean {
    // No event log for hard delete — it's permanent and total
    const result = this.db.prepare(
      'DELETE FROM memories WHERE id = ? AND repo_id = ?'
    ).run(id, this.repoId)
    return result.changes > 0
  }

  hardDeleteAll(): number {
    const result = this.db.prepare(
      'DELETE FROM memories WHERE repo_id = ?'
    ).run(this.repoId)
    return result.changes
  }

  // ============================================================
  // SUPERSEDE (internal)
  // Mark an old memory as superseded by a correction
  // ============================================================

  private supersede(oldId: string, newId: string): void {
    this.db.prepare(`
      UPDATE memories
      SET status = 'archived',
          weight = 0.05,
          updated_at = ?
      WHERE id = ?
    `).run(Date.now(), oldId)
  }

  // ============================================================
  // CONTEXT ASSEMBLY
  // Returns all memory relevant to a graph entity.
  // Called by the MCP server and VS Code extension.
  // Memory is shown to the DEVELOPER first (R03).
  // ============================================================

  assembleContext(entityId: string): MemoryContext {
    const all = this.db.prepare(`
      SELECT * FROM memories
      WHERE entity_id = ? AND status = 'active'
      ORDER BY
        is_correction DESC,
        weight DESC,
        updated_at DESC
      LIMIT 20
    `).all(entityId) as MemoryNode[]

    this.touchAll(all.map(m => m.id))

    const corrections = all.filter(m => m.isCorrection)
    const openQuestions = all.filter(m =>
      m.type === 'session' &&
      !m.isCorrection &&
      m.content.toLowerCase().includes('?') ||
      m.content.toLowerCase().includes('unresolved') ||
      m.content.toLowerCase().includes('todo') ||
      m.content.toLowerCase().includes('open question')
    )
    const totalWeight = all.reduce((sum, m) => sum + m.weight, 0)

    return { entityId, memories: all, corrections, openQuestions, totalWeight }
  }

  // ============================================================
  // REPO CONTEXT
  // Top memories across the entire repository
  // Used by MCP for general session context
  // ============================================================

  assembleRepoContext(limit = 15): MemoryNode[] {
    const memories = this.db.prepare(`
      SELECT * FROM memories
      WHERE repo_id = ? AND status = 'active'
      ORDER BY
        is_correction DESC,
        weight DESC,
        updated_at DESC
      LIMIT ?
    `).all(this.repoId, limit) as MemoryNode[]

    this.touchAll(memories.map(m => m.id))
    return memories
  }

  // ============================================================
  // SESSION CONTEXT
  // All memories from a specific session
  // ============================================================

  getSessionMemories(sessionId: string): MemoryNode[] {
    return this.db.prepare(`
      SELECT * FROM memories
      WHERE session_id = ? AND status = 'active'
      ORDER BY weight DESC
    `).all(sessionId) as MemoryNode[]
  }

  // ============================================================
  // SEARCH
  // Simple text search — no embeddings, no vectors
  // Phase 1: substring match on content
  // Phase 2: semantic search via embeddings
  // ============================================================

  search(query: string, limit = 10): MemoryNode[] {
    const pattern = `%${query.toLowerCase()}%`
    return this.db.prepare(`
      SELECT * FROM memories
      WHERE repo_id = ? AND status = 'active'
        AND LOWER(content) LIKE ?
      ORDER BY weight DESC, updated_at DESC
      LIMIT ?
    `).all(this.repoId, pattern, limit) as MemoryNode[]
  }

  // ============================================================
  // STATS
  // For banyan doctor and the control panel
  // ============================================================

  getStats(): {
    total: number
    active: number
    corrections: number
    sessionNotes: number
    structural: number
    archived: number
    averageWeight: number
  } {
    const all = this.db.prepare(`
      SELECT status, type, is_correction, weight
      FROM memories WHERE repo_id = ?
    `).all(this.repoId) as Array<{
      status: string; type: string;
      is_correction: number; weight: number
    }>

    const active = all.filter(m => m.status === 'active')

    return {
      total: all.length,
      active: active.length,
      corrections: active.filter(m => m.is_correction === 1).length,
      sessionNotes: active.filter(m => m.type === 'session').length,
      structural: active.filter(m => m.type === 'structural').length,
      archived: all.filter(m => m.status === 'archived').length,
      averageWeight: active.length > 0
        ? active.reduce((s, m) => s + m.weight, 0) / active.length
        : 0,
    }
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  getById(id: string): MemoryNode | null {
    return (this.db.prepare(
      'SELECT * FROM memories WHERE id = ?'
    ).get(id) as MemoryNode) ?? null
  }

  private touchAll(ids: string[]): void {
    if (ids.length === 0) return
    const now = Date.now()
    for (const id of ids) {
      this.db.prepare(
        'UPDATE memories SET last_accessed = ? WHERE id = ?'
      ).run(now, id)
    }
  }

  private defaultWeight(type: MemoryType, isCorrection?: boolean): number {
    if (isCorrection) return WEIGHTS.CORRECTION
    if (type === 'structural') return WEIGHTS.STRUCTURAL
    return WEIGHTS.SESSION
  }

  private defaultExpiry(
    type: MemoryType,
    isCorrection: boolean | undefined,
    now: number
  ): number | null {
    if (isCorrection) return null     // corrections never expire
    if (type === 'structural') return now + EXPIRY_MS.STRUCTURAL
    return now + EXPIRY_MS.SESSION
  }

  private logEvent(
    type: string,
    payload: Record<string, unknown>
  ): void {
    try {
      this.db.prepare(`
        INSERT INTO events (id, repo_id, type, actor, memory_id, payload, created_at)
        VALUES (?, ?, ?, 'system', ?, ?, ?)
      `).run(
        uuid(),
        this.repoId,
        type,
        payload['memoryId'] as string ?? null,
        JSON.stringify(payload),
        Date.now()
      )
    } catch {
      // Event logging is best-effort — never block the main operation
    }
  }
}

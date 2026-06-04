import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GRAPH_LIMITS } from './types.js'

// ============================================================
// DATABASE ADAPTER
// BanyanTree's single source of truth.
// All reads and writes go through this class.
// Never access SQLite directly outside this file.
// ============================================================

export class BanyanDB {
  private db: Database.Database
  private repoId: string

  constructor(dbPath: string, repoId: string) {
    this.repoId = repoId
    this.db = new Database(dbPath, {
      // Verbose logging in development only
      verbose: process.env.BANYAN_DEBUG === '1'
        ? (msg) => console.log('[DB]', msg)
        : undefined,
    })

    // Apply performance pragmas
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')

    this.applySchema()
  }

  // --------------------------------------------------------
  // SCHEMA
  // --------------------------------------------------------

  private applySchema(): void {
    const schemaPath = join(import.meta.dirname, 'schema.sql')
    const schema = readFileSync(schemaPath, 'utf8')
    this.db.exec(schema)
  }

  // --------------------------------------------------------
  // ENTITY OPERATIONS
  // --------------------------------------------------------

  getEntity(id: string) {
    return this.db.prepare(
      'SELECT * FROM entities WHERE id = ? AND status = ?'
    ).get(id, 'active')
  }

  getEntitiesByType(type: string) {
    return this.db.prepare(
      'SELECT * FROM entities WHERE repo_id = ? AND type = ? AND status = ? ORDER BY weight DESC'
    ).all(this.repoId, type, 'active')
  }

  getEntitiesByPath(path: string) {
    return this.db.prepare(
      'SELECT * FROM entities WHERE repo_id = ? AND path = ? AND status = ?'
    ).all(this.repoId, path, 'active')
  }

  getTopEntities(limit = 20) {
    return this.db.prepare(
      'SELECT * FROM entities WHERE repo_id = ? AND status = ? ORDER BY weight DESC LIMIT ?'
    ).all(this.repoId, 'active', limit)
  }

  createEntity(entity: Omit<import('./types.js').Entity, 'id'> & { id: string }): boolean {
    // Enforce hard node limit
    const count = this.db.prepare(
      'SELECT COUNT(*) as n FROM entities WHERE repo_id = ? AND status = ?'
    ).get(this.repoId, 'active') as { n: number }

    if (count.n >= GRAPH_LIMITS.MAX_NODES_PER_REPO) {
      throw new Error(
        `Graph limit reached: ${GRAPH_LIMITS.MAX_NODES_PER_REPO} nodes maximum per repository. ` +
        `Run 'banyan doctor' to review pruning candidates.`
      )
    }

    const result = this.db.prepare(`
      INSERT INTO entities
        (id, repo_id, type, name, path, content, weight, confidence,
         trust_level, source, created_at, updated_at, last_accessed, expires_at, status)
      VALUES
        (@id, @repo_id, @type, @name, @path, @content, @weight, @confidence,
         @trust_level, @source, @created_at, @updated_at, @last_accessed, @expires_at, @status)
    `).run(entity)

    // Update repo node count
    this.db.prepare(
      'UPDATE repositories SET node_count = node_count + 1 WHERE id = ?'
    ).run(this.repoId)

    return result.changes > 0
  }

  updateEntityWeight(id: string, weight: number): boolean {
    const result = this.db.prepare(
      'UPDATE entities SET weight = ?, updated_at = ? WHERE id = ?'
    ).run(weight, Date.now(), id)
    return result.changes > 0
  }

  touchEntity(id: string): void {
    this.db.prepare(
      'UPDATE entities SET last_accessed = ? WHERE id = ?'
    ).run(Date.now(), id)
  }

  quarantineEntity(id: string): boolean {
    const result = this.db.prepare(
      'UPDATE entities SET status = ?, updated_at = ? WHERE id = ?'
    ).run('quarantine', Date.now(), id)
    return result.changes > 0
  }

  deleteEntityHard(id: string): boolean {
    // Hard delete — removes from DB entirely. Caller must log the event.
    const result = this.db.prepare(
      'DELETE FROM entities WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  // --------------------------------------------------------
  // RELATIONSHIP OPERATIONS
  // --------------------------------------------------------

  getRelationships(entityId: string) {
    return this.db.prepare(`
      SELECT r.*, e.name as to_name, e.type as to_type, e.path as to_path
      FROM relationships r
      JOIN entities e ON r.to_id = e.id
      WHERE r.from_id = ? AND r.status = ?
      ORDER BY r.weight DESC
    `).all(entityId, 'active')
  }

  getBacklinks(entityId: string) {
    return this.db.prepare(`
      SELECT r.*, e.name as from_name, e.type as from_type
      FROM relationships r
      JOIN entities e ON r.from_id = e.id
      WHERE r.to_id = ? AND r.status = ?
      ORDER BY r.weight DESC
    `).all(entityId, 'active')
  }

  createRelationship(rel: Omit<import('./types.js').Relationship, 'id'> & { id: string }): boolean {
    // Enforce edge limit per node
    const count = this.db.prepare(
      'SELECT COUNT(*) as n FROM relationships WHERE from_id = ? AND status = ?'
    ).get(rel.from_id, 'active') as { n: number }

    if (count.n >= GRAPH_LIMITS.MAX_EDGES_PER_NODE) {
      console.warn(`[BanyanDB] Edge limit reached for node ${rel.from_id}. Skipping.`)
      return false
    }

    const result = this.db.prepare(`
      INSERT OR IGNORE INTO relationships
        (id, repo_id, from_id, to_id, type, weight, confidence, metadata, created_at, updated_at, status)
      VALUES
        (@id, @repo_id, @from_id, @to_id, @type, @weight, @confidence, @metadata, @created_at, @updated_at, @status)
    `).run(rel)
    return result.changes > 0
  }

  // --------------------------------------------------------
  // MEMORY OPERATIONS
  // --------------------------------------------------------

  getMemoriesForEntity(entityId: string) {
    return this.db.prepare(
      'SELECT * FROM memories WHERE entity_id = ? AND status = ? ORDER BY weight DESC'
    ).all(entityId, 'active')
  }

  getRecentMemories(limit = 20) {
    return this.db.prepare(
      'SELECT * FROM memories WHERE repo_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(this.repoId, 'active', limit)
  }

  getCorrectionMemories() {
    return this.db.prepare(
      'SELECT * FROM memories WHERE repo_id = ? AND is_correction = 1 AND status = ?'
    ).all(this.repoId, 'active')
  }

  createMemory(memory: Omit<import('./types.js').Memory, 'id'> & { id: string }): boolean {
    const result = this.db.prepare(`
      INSERT INTO memories
        (id, repo_id, entity_id, type, content, weight, reinforcement,
         is_correction, corrects_id, session_id, created_at, updated_at,
         last_accessed, expires_at, status)
      VALUES
        (@id, @repo_id, @entity_id, @type, @content, @weight, @reinforcement,
         @is_correction, @corrects_id, @session_id, @created_at, @updated_at,
         @last_accessed, @expires_at, @status)
    `).run(memory)
    return result.changes > 0
  }

  reinforceMemory(id: string): boolean {
    // Human reinforcement — weight boosted permanently
    const result = this.db.prepare(`
      UPDATE memories
      SET reinforcement = reinforcement + 1,
          weight = MIN(1.0, weight + 0.1),
          updated_at = ?
      WHERE id = ?
    `).run(Date.now(), id)
    return result.changes > 0
  }

  decayMemory(id: string, decayAmount: number): boolean {
    const result = this.db.prepare(`
      UPDATE memories
      SET weight = MAX(0.0, weight - ?),
          updated_at = ?
      WHERE id = ? AND is_correction = 0
    `).run(decayAmount, Date.now(), id)
    return result.changes > 0
  }

  deleteMemoryHard(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return result.changes > 0
  }

  // --------------------------------------------------------
  // SESSION OPERATIONS
  // --------------------------------------------------------

  startSession(session: Omit<import('./types.js').Session, 'id'> & { id: string }): boolean {
    const result = this.db.prepare(`
      INSERT INTO sessions (id, repo_id, started_at, files_touched, node_count, status)
      VALUES (@id, @repo_id, @started_at, @files_touched, @node_count, @status)
    `).run(session)
    return result.changes > 0
  }

  endSession(id: string, summary?: string): boolean {
    const result = this.db.prepare(`
      UPDATE sessions SET ended_at = ?, summary = ?, status = ? WHERE id = ?
    `).run(Date.now(), summary ?? null, 'completed', id)
    return result.changes > 0
  }

  getRecentSessions(limit = 10) {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE repo_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(this.repoId, limit)
  }

  // --------------------------------------------------------
  // AGENT FLAGS
  // --------------------------------------------------------

  createFlag(flag: Omit<import('./types.js').AgentFlag, 'id'> & { id: string }): boolean {
    const result = this.db.prepare(`
      INSERT INTO agent_flags
        (id, repo_id, agent, severity, type, title, detail, entity_ids,
         acknowledged, created_at, expires_at)
      VALUES
        (@id, @repo_id, @agent, @severity, @type, @title, @detail, @entity_ids,
         0, @created_at, @expires_at)
    `).run(flag)
    return result.changes > 0
  }

  getActiveFlags() {
    return this.db.prepare(`
      SELECT * FROM agent_flags
      WHERE repo_id = ? AND acknowledged = 0
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
    `).all(this.repoId, Date.now())
  }

  acknowledgeFlag(id: string, resolution?: string): boolean {
    const result = this.db.prepare(`
      UPDATE agent_flags
      SET acknowledged = 1, acknowledged_at = ?, resolution = ?
      WHERE id = ?
    `).run(Date.now(), resolution ?? null, id)
    return result.changes > 0
  }

  // --------------------------------------------------------
  // EVENTS (append-only)
  // --------------------------------------------------------

  logEvent(event: Omit<import('./types.js').Event, 'id'> & { id: string }): void {
    this.db.prepare(`
      INSERT INTO events (id, repo_id, type, actor, entity_id, memory_id, payload, created_at)
      VALUES (@id, @repo_id, @type, @actor, @entity_id, @memory_id, @payload, @created_at)
    `).run(event)
  }

  getRecentEvents(limit = 50) {
    return this.db.prepare(
      'SELECT * FROM events WHERE repo_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(this.repoId, limit)
  }

  // --------------------------------------------------------
  // DOCTRINE
  // --------------------------------------------------------

  getDoctrine(key: string) {
    return this.db.prepare(
      'SELECT * FROM doctrine WHERE key = ? AND repo_id = ?'
    ).get(key, this.repoId)
  }

  setDoctrine(key: string, value: string): void {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO doctrine (key, repo_id, value, trust_level, created_at, updated_at)
      VALUES (?, ?, ?, 'human', ?, ?)
      ON CONFLICT(key, repo_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, this.repoId, value, now, now)
  }

  // --------------------------------------------------------
  // GRAPH HEALTH
  // --------------------------------------------------------

  getNodeCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as n FROM entities WHERE repo_id = ? AND status = ?'
    ).get(this.repoId, 'active') as { n: number }
    return row.n
  }

  getEdgeCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as n FROM relationships WHERE repo_id = ? AND status = ?'
    ).get(this.repoId, 'active') as { n: number }
    return row.n
  }

  getMemoryCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as n FROM memories WHERE repo_id = ? AND status = ?'
    ).get(this.repoId, 'active') as { n: number }
    return row.n
  }

  // --------------------------------------------------------
  // TRANSACTION HELPER
  // --------------------------------------------------------

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // --------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------

  close(): void {
    this.db.close()
  }
}

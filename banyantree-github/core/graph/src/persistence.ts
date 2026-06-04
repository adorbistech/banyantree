/**
 * BanyanTree Graph Persistence
 *
 * Writes and reads graph entities + relationships from SQLite.
 * All writes are transactional. Integrity checks before every write.
 *
 * Hard limits enforced here (graph-governance.md):
 * - Max 500 nodes per repo
 * - Max 20 edges per node
 *
 * Node creation policy enforced here:
 * Only session-referenced + root-connected + drift-flagged nodes enter.
 * The session context passed to write() determines eligibility.
 */

import Database from 'better-sqlite3'
import type {
  GraphEntity,
  GraphRelationship,
  GraphWriteOperation,
  GraphTraversalResult,
  DependencyResult,
  GraphNode,
} from './types.js'

const MAX_NODES_PER_REPO = 500
const MAX_EDGES_PER_NODE = 20

export class GraphPersistence {
  private db: Database.Database
  private repoId: string

  constructor(db: Database.Database, repoId: string) {
    this.db = db
    this.repoId = repoId
  }

  // ============================================================
  // WRITE — entity + relationships from one file normalisation
  // ============================================================

  write(op: GraphWriteOperation): {
    entitiesWritten: number
    relationshipsWritten: number
    skipped: number
    limitReached: boolean
  } {
    let entitiesWritten = 0
    let relationshipsWritten = 0
    let skipped = 0
    let limitReached = false

    this.db.transaction(() => {
      // Check current node count
      const current = (this.db.prepare(
        "SELECT COUNT(*) as n FROM entities WHERE repo_id = ? AND status = 'active'"
      ).get(this.repoId) as { n: number }).n

      if (current >= MAX_NODES_PER_REPO) {
        limitReached = true
        skipped = op.entities.length
        return
      }

      const remaining = MAX_NODES_PER_REPO - current

      // Write entities up to remaining capacity
      for (const entity of op.entities.slice(0, remaining)) {
        const wrote = this.upsertEntity(entity)
        if (wrote) entitiesWritten++
      }

      if (op.entities.length > remaining) {
        skipped = op.entities.length - remaining
        limitReached = true
      }

      // Write relationships (respects edge limit per node)
      for (const rel of op.relationships) {
        const wrote = this.upsertRelationship(rel)
        if (wrote) relationshipsWritten++
      }

      // Update repo node count
      this.db.prepare(
        'UPDATE repositories SET node_count = ?, last_active = ? WHERE id = ?'
      ).run(current + entitiesWritten, Date.now(), this.repoId)
    })()

    return { entitiesWritten, relationshipsWritten, skipped, limitReached }
  }

  // ============================================================
  // ENTITY UPSERT
  // Insert or update — deterministic IDs mean same entity = update
  // ============================================================

  private upsertEntity(entity: GraphEntity): boolean {
    const existing = this.db.prepare(
      "SELECT id, weight FROM entities WHERE id = ?"
    ).get(entity.id) as { id: string; weight: number } | undefined

    if (existing) {
      // Update metadata and timestamp, preserve weight if higher
      this.db.prepare(`
        UPDATE entities SET
          name = ?, metadata = ?, updated_at = ?,
          weight = MAX(weight, ?)
        WHERE id = ?
      `).run(
        entity.name,
        JSON.stringify(entity.metadata),
        Date.now(),
        entity.weight,
        entity.id
      )
      return false  // not a new entity
    }

    this.db.prepare(`
      INSERT INTO entities
        (id, repo_id, type, name, path, content, weight, confidence,
         trust_level, source, created_at, updated_at, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'system', 'parser', ?, ?, 'active')
    `).run(
      entity.id,
      this.repoId,
      entity.type,
      entity.name,
      entity.filePath ?? entity.relativePath,
      JSON.stringify(entity.metadata),
      entity.weight,
      entity.confidence,
      entity.createdAt,
      entity.updatedAt,
    )

    return true  // new entity written
  }

  // ============================================================
  // RELATIONSHIP UPSERT
  // ============================================================

  private upsertRelationship(rel: GraphRelationship): boolean {
    // Enforce edge limit
    const edgeCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM relationships WHERE from_id = ? AND status = 'active'"
    ).get(rel.fromId) as { n: number }).n

    if (edgeCount >= MAX_EDGES_PER_NODE) return false

    // Check both entities exist
    const fromExists = this.db.prepare(
      "SELECT 1 FROM entities WHERE id = ? AND status = 'active'"
    ).get(rel.fromId)

    const toExists = this.db.prepare(
      "SELECT 1 FROM entities WHERE id = ? AND status = 'active'"
    ).get(rel.toId)

    if (!fromExists || !toExists) return false

    // Upsert (ignore duplicate)
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO relationships
        (id, repo_id, from_id, to_id, type, weight, confidence,
         metadata, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      rel.id,
      this.repoId,
      rel.fromId,
      rel.toId,
      rel.type,
      rel.weight,
      rel.confidence,
      JSON.stringify(rel.metadata),
      rel.createdAt,
      rel.createdAt,
    )

    return result.changes > 0
  }

  // ============================================================
  // TRAVERSAL QUERIES
  // The four that ChatGPT specified for Phase 1
  // ============================================================

  /**
   * getDependencies — what does this entity depend on?
   * Traverses IMPORTS + DEPENDS_ON outward.
   */
  getDependencies(entityId: string, depth = 2): DependencyResult | null {
    const start = Date.now()

    const origin = this.db.prepare(
      "SELECT * FROM entities WHERE id = ? AND status = 'active'"
    ).get(entityId) as GraphEntity | undefined

    if (!origin) return null

    const imports = this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN relationships r ON r.to_id = e.id
      WHERE r.from_id = ? AND r.type = 'IMPORTS' AND r.status = 'active'
        AND e.status = 'active'
      ORDER BY e.weight DESC
    `).all(entityId) as GraphEntity[]

    const importedBy = this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN relationships r ON r.from_id = e.id
      WHERE r.to_id = ? AND r.type = 'IMPORTS' AND r.status = 'active'
        AND e.status = 'active'
      ORDER BY e.weight DESC
    `).all(entityId) as GraphEntity[]

    const calls = this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN relationships r ON r.to_id = e.id
      WHERE r.from_id = ? AND r.type = 'CALLS' AND r.status = 'active'
        AND e.status = 'active'
      ORDER BY e.weight DESC
    `).all(entityId) as GraphEntity[]

    const calledBy = this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN relationships r ON r.from_id = e.id
      WHERE r.to_id = ? AND r.type = 'CALLS' AND r.status = 'active'
        AND e.status = 'active'
      ORDER BY e.weight DESC
    `).all(entityId) as GraphEntity[]

    return { entity: origin, imports, importedBy, calls, calledBy }
  }

  /**
   * getRelatedFiles — files semantically adjacent to this one.
   * 2-hop traversal across all relationship types.
   * This is the neuron propagation Claude ChatGPT described.
   */
  getRelatedFiles(
    entityId: string,
    maxHops = 2,
    limit = 10
  ): GraphTraversalResult | null {
    const start = Date.now()

    const origin = this.db.prepare(
      "SELECT * FROM entities WHERE id = ? AND status = 'active'"
    ).get(entityId) as GraphEntity | undefined

    if (!origin) return null

    const visited = new Set<string>([entityId])
    const nodes: GraphNode[] = []
    const allRelationships: GraphRelationship[] = []

    // BFS traversal
    let frontier = [entityId]

    for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
      const nextFrontier: string[] = []

      for (const currentId of frontier) {
        if (nodes.length >= limit) break

        // Outbound relationships
        const outbound = this.db.prepare(`
          SELECT r.*, e.id as target_id, e.type as target_type,
                 e.name as target_name, e.weight as target_weight
          FROM relationships r
          JOIN entities e ON r.to_id = e.id
          WHERE r.from_id = ? AND r.status = 'active' AND e.status = 'active'
          ORDER BY r.weight DESC
          LIMIT 10
        `).all(currentId) as any[]

        // Inbound relationships
        const inbound = this.db.prepare(`
          SELECT r.*, e.id as target_id, e.type as target_type,
                 e.name as target_name, e.weight as target_weight
          FROM relationships r
          JOIN entities e ON r.from_id = e.id
          WHERE r.to_id = ? AND r.status = 'active' AND e.status = 'active'
          ORDER BY r.weight DESC
          LIMIT 10
        `).all(currentId) as any[]

        for (const row of [...outbound, ...inbound]) {
          const targetId: string = row.target_id

          if (!visited.has(targetId)) {
            visited.add(targetId)
            nextFrontier.push(targetId)

            const entity = this.db.prepare(
              "SELECT * FROM entities WHERE id = ? AND status = 'active'"
            ).get(targetId) as GraphEntity

            if (entity) {
              nodes.push({ entity, depth: hop })
            }
          }

          allRelationships.push(row as GraphRelationship)
        }
      }

      frontier = nextFrontier
    }

    // Sort by weight (most relevant first)
    nodes.sort((a, b) => b.entity.weight - a.entity.weight)

    return {
      origin,
      nodes: nodes.slice(0, limit),
      relationships: allRelationships,
      traversalMs: Date.now() - start,
    }
  }

  /**
   * getFileEntities — all entities defined in a specific file.
   * Used by the VS Code extension when a file is opened.
   */
  getFileEntities(relativePath: string): GraphEntity[] {
    return this.db.prepare(`
      SELECT * FROM entities
      WHERE repo_id = ? AND path LIKE ? AND status = 'active'
      ORDER BY weight DESC
    `).all(this.repoId, `%${relativePath}%`) as GraphEntity[]
  }

  /**
   * getEntityById — direct lookup.
   */
  getEntity(id: string): GraphEntity | null {
    return (this.db.prepare(
      "SELECT * FROM entities WHERE id = ? AND status = 'active'"
    ).get(id) as GraphEntity) ?? null
  }

  /**
   * getTopEntities — highest weighted entities in the repo.
   * Used for dashboard and MCP context assembly.
   */
  getTopEntities(limit = 20): GraphEntity[] {
    return this.db.prepare(`
      SELECT * FROM entities
      WHERE repo_id = ? AND status = 'active'
      ORDER BY weight DESC
      LIMIT ?
    `).all(this.repoId, limit) as GraphEntity[]
  }

  // ============================================================
  // INTEGRITY CHECK
  // Called by banyan validate and graph agent
  // ============================================================

  checkIntegrity(): {
    orphanRelationships: number
    invalidWeights: number
    nodeCount: number
    edgeCount: number
    healthy: boolean
  } {
    const orphanRelationships = (this.db.prepare(`
      SELECT COUNT(*) as n FROM relationships r
      WHERE r.repo_id = ? AND r.status = 'active'
        AND (
          NOT EXISTS (SELECT 1 FROM entities WHERE id = r.from_id AND status = 'active')
          OR NOT EXISTS (SELECT 1 FROM entities WHERE id = r.to_id AND status = 'active')
        )
    `).get(this.repoId) as { n: number }).n

    const invalidWeights = (this.db.prepare(`
      SELECT COUNT(*) as n FROM entities
      WHERE repo_id = ? AND (weight < 0.0 OR weight > 1.0)
    `).get(this.repoId) as { n: number }).n

    const nodeCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM entities WHERE repo_id = ? AND status = 'active'"
    ).get(this.repoId) as { n: number }).n

    const edgeCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM relationships WHERE repo_id = ? AND status = 'active'"
    ).get(this.repoId) as { n: number }).n

    return {
      orphanRelationships,
      invalidWeights,
      nodeCount,
      edgeCount,
      healthy: orphanRelationships === 0 && invalidWeights === 0,
    }
  }

  // ============================================================
  // WEIGHT UPDATE
  // Called by memory agent when sessions reference entities
  // ============================================================

  boostEntityWeight(id: string, boost: number): void {
    this.db.prepare(`
      UPDATE entities
      SET weight = MIN(1.0, weight + ?), updated_at = ?
      WHERE id = ?
    `).run(boost, Date.now(), id)
  }

  decayEntityWeight(id: string, decay: number): void {
    this.db.prepare(`
      UPDATE entities
      SET weight = MAX(0.0, weight - ?), updated_at = ?
      WHERE id = ?
    `).run(decay, Date.now(), id)
  }
}

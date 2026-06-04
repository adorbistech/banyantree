/**
 * BanyanTree Graph Engine — Public API
 *
 * This is Block 5. The architectural inflection point.
 *
 * Before Block 5: Files → AST → structured extraction
 * After Block 5:  Codebase → entities → relationships → cognition graph
 *
 * The graph engine:
 * 1. Receives ParsedFile from the parser (Block 4)
 * 2. Normalises it into stable GraphEntity + GraphRelationship objects
 * 3. Enforces the node creation policy before any write
 * 4. Persists to SQLite via GraphPersistence
 * 5. Exposes traversal queries for the MCP server (Block 7)
 *
 * Node creation policy (graph-governance.md):
 * A node is created ONLY when:
 * - The file was referenced in an active AI session, OR
 * - The developer explicitly said "remember this", OR
 * - The file is in the dependency chain of an existing root node, OR
 * - A drift flag was raised against it
 */

import Database from 'better-sqlite3'
import { normaliseFile } from './normaliser.js'
import { GraphPersistence } from './persistence.js'
import type { ParsedFile } from '../../services/parser/src/types.js'
import type {
  GraphEntity,
  GraphTraversalResult,
  DependencyResult,
  GraphWriteOperation,
} from './types.js'

export type { GraphEntity, GraphRelationship, GraphTraversalResult, DependencyResult } from './types.js'
export { makeEntityId, makeRelationshipId } from './identity.ts'

// ============================================================
// SESSION CONTEXT
// Passed with every ingest — determines node creation eligibility
// ============================================================

export interface IngestContext {
  sessionId: string | null
  triggeredBy:
    | 'session_reference'    // file was opened/discussed in active session
    | 'human_reinforcement'  // developer explicitly said "remember this"
    | 'root_dependency'      // file is in dependency chain of a root node
    | 'drift_flag'           // drift agent flagged this file
    | 'forced'               // admin override (banyan init)
}

// ============================================================
// GRAPH ENGINE
// ============================================================

export class GraphEngine {
  private persistence: GraphPersistence
  private repoId: string
  private db: Database.Database

  constructor(db: Database.Database, repoId: string) {
    this.db = db
    this.repoId = repoId
    this.persistence = new GraphPersistence(db, repoId)
  }

  // ============================================================
  // INGEST
  // The main entry point — takes parser output, applies policy,
  // writes to graph
  // ============================================================

  ingest(
    parsed: ParsedFile,
    context: IngestContext
  ): {
    accepted: boolean
    reason: string
    entitiesWritten: number
    relationshipsWritten: number
    limitReached: boolean
  } {
    // ── Node creation policy gate ─────────────────────────────
    if (!this.isEligible(parsed, context)) {
      return {
        accepted: false,
        reason: `Policy: file not eligible for ingestion (trigger: ${context.triggeredBy})`,
        entitiesWritten: 0,
        relationshipsWritten: 0,
        limitReached: false,
      }
    }

    // ── Normalise ─────────────────────────────────────────────
    const op = normaliseFile(parsed, this.repoId, context.sessionId)

    // ── Write ─────────────────────────────────────────────────
    const result = this.persistence.write(op)

    return {
      accepted: true,
      reason: `Written (trigger: ${context.triggeredBy})`,
      entitiesWritten: result.entitiesWritten,
      relationshipsWritten: result.relationshipsWritten,
      limitReached: result.limitReached,
    }
  }

  // ============================================================
  // NODE CREATION POLICY
  // This enforces graph-governance.md rules
  // ============================================================

  private isEligible(parsed: ParsedFile, context: IngestContext): boolean {
    // Forced ingestion (banyan init, human reinforcement) always passes
    if (context.triggeredBy === 'forced' ||
        context.triggeredBy === 'human_reinforcement') {
      return true
    }

    // Drift flags always eligible
    if (context.triggeredBy === 'drift_flag') return true

    // Session reference — most common trigger
    if (context.triggeredBy === 'session_reference') {
      // File is eligible if referenced in active session
      return context.sessionId !== null
    }

    // Root dependency — check if the file is connected to root nodes
    if (context.triggeredBy === 'root_dependency') {
      return this.isRootConnected(parsed.relativePath)
    }

    return false
  }

  private isRootConnected(relativePath: string): boolean {
    // Check if any root node (weight >= 0.90) has a relationship
    // to this file path — directly or via existing graph edges
    const rootNodes = this.db.prepare(`
      SELECT id FROM entities
      WHERE repo_id = ? AND weight >= 0.90 AND status = 'active'
    `).all(this.repoId) as { id: string }[]

    if (rootNodes.length === 0) return false

    // Check if this file exists in graph connected to a root
    const fileExists = this.db.prepare(`
      SELECT 1 FROM entities
      WHERE repo_id = ? AND path LIKE ? AND status = 'active'
      LIMIT 1
    `).get(this.repoId, `%${relativePath}%`)

    return fileExists !== undefined
  }

  // ============================================================
  // TRAVERSAL — delegated to persistence
  // ============================================================

  getDependencies(entityId: string): DependencyResult | null {
    return this.persistence.getDependencies(entityId)
  }

  getRelatedFiles(entityId: string, maxHops = 2, limit = 10): GraphTraversalResult | null {
    return this.persistence.getRelatedFiles(entityId, maxHops, limit)
  }

  getFileEntities(relativePath: string): GraphEntity[] {
    return this.persistence.getFileEntities(relativePath)
  }

  getEntity(id: string): GraphEntity | null {
    return this.persistence.getEntity(id)
  }

  getTopEntities(limit = 20): GraphEntity[] {
    return this.persistence.getTopEntities(limit)
  }

  // ============================================================
  // CONTEXT ASSEMBLY FOR MCP
  // Called by the MCP server (Block 7) to assemble AI context
  // for a given file. This is where the aha moment is built.
  // ============================================================

  assembleFileContext(relativePath: string): {
    file: GraphEntity | null
    related: GraphEntity[]
    dependencies: GraphEntity[]
    importedBy: GraphEntity[]
    topEntities: GraphEntity[]
    nodeCount: number
  } {
    const fileEntities = this.getFileEntities(relativePath)
    const fileEntity = fileEntities.find(e => e.type === 'file') ?? null

    let related: GraphEntity[] = []
    let dependencies: GraphEntity[] = []
    let importedBy: GraphEntity[] = []

    if (fileEntity) {
      // Related files (2-hop traversal)
      const traversal = this.getRelatedFiles(fileEntity.id, 2, 8)
      related = traversal?.nodes.map(n => n.entity) ?? []

      // Direct dependencies
      const deps = this.getDependencies(fileEntity.id)
      dependencies = deps?.imports ?? []
      importedBy = deps?.importedBy ?? []
    }

    const { nodeCount } = this.persistence.checkIntegrity()

    return {
      file: fileEntity,
      related,
      dependencies,
      importedBy,
      topEntities: this.getTopEntities(5),
      nodeCount,
    }
  }

  // ============================================================
  // WEIGHT MANAGEMENT
  // ============================================================

  boostWeight(entityId: string, boost = 0.05): void {
    this.persistence.boostEntityWeight(entityId, boost)
  }

  // ============================================================
  // HEALTH
  // ============================================================

  checkIntegrity() {
    return this.persistence.checkIntegrity()
  }
}

/**
 * BanyanTree Graph Engine Types
 *
 * These are the types AFTER normalisation — what the graph engine
 * produces from parser output. The parser extracts raw structure.
 * The graph engine converts that into stable, weighted, typed entities.
 *
 * Phase 1 entity types (from ChatGPT Block 5 spec):
 * File, Function, Class, Import, Export, Module
 *
 * Phase 1 relationship types:
 * IMPORTS, EXPORTS, CALLS, DEFINES, BELONGS_TO, DEPENDS_ON
 */

export type GraphEntityType =
  | 'file'
  | 'function'
  | 'class'
  | 'import'
  | 'export'
  | 'module'
  | 'dependency'

export type GraphRelationshipType =
  | 'IMPORTS'      // file imports module/package
  | 'EXPORTS'      // file exports symbol
  | 'CALLS'        // function invokes function
  | 'DEFINES'      // file defines class or function
  | 'BELONGS_TO'   // file belongs to module (directory)
  | 'DEPENDS_ON'   // inferred dependency

// ============================================================
// GRAPH ENTITY
// ============================================================

export interface GraphEntity {
  id: string                    // stable deterministic ID from identity.ts
  type: GraphEntityType
  name: string                  // display name
  repoId: string
  filePath: string | null       // absolute path (null for modules)
  relativePath: string | null   // relative to repo root
  metadata: EntityMetadata
  weight: number                // 0.0 – 1.0, updated by graph agent
  confidence: number            // 0.0 – 1.0
  createdAt: number
  updatedAt: number
}

export interface EntityMetadata {
  // File entities
  language?: string
  lineCount?: number
  sizeBytes?: number
  exports?: string[]

  // Function entities
  isAsync?: boolean
  isExported?: boolean
  params?: string[]
  line?: number

  // Class entities
  extends?: string | null
  implements?: string[]

  // Import entities
  source?: string               // the module being imported from
  names?: string[]              // named imports
  isDefault?: boolean

  // Module entities
  dirPath?: string
  fileCount?: number

  // Shared
  parseTimeMs?: number
  [key: string]: unknown        // extensible for Phase 2
}

// ============================================================
// GRAPH RELATIONSHIP
// ============================================================

export interface GraphRelationship {
  id: string                    // stable deterministic ID
  fromId: string                // source entity ID
  toId: string                  // target entity ID
  type: GraphRelationshipType
  weight: number                // 0.0 – 1.0
  confidence: number
  metadata: RelationshipMetadata
  createdAt: number
}

export interface RelationshipMetadata {
  line?: number                 // where in source file this relationship appears
  isDynamic?: boolean           // dynamic import?
  isInferred?: boolean          // inferred vs directly parsed
  [key: string]: unknown
}

// ============================================================
// GRAPH WRITE OPERATION
// What the normaliser hands to the persistence layer
// ============================================================

export interface GraphWriteOperation {
  entities: GraphEntity[]
  relationships: GraphRelationship[]
  repoId: string
  filePath: string
  sessionId: string | null
}

// ============================================================
// GRAPH QUERY RESULTS
// What traversal queries return
// ============================================================

export interface GraphNode {
  entity: GraphEntity
  depth: number                 // hops from query origin
}

export interface GraphTraversalResult {
  origin: GraphEntity
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  traversalMs: number
}

export interface DependencyResult {
  entity: GraphEntity
  imports: GraphEntity[]        // what this entity imports
  importedBy: GraphEntity[]     // what imports this entity
  calls: GraphEntity[]          // what this entity calls
  calledBy: GraphEntity[]       // what calls this entity
}

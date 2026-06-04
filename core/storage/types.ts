// BanyanTree — Core type definitions
// These mirror the SQLite schema exactly.
// Never add a type here without adding the corresponding table to schema.sql.

// ============================================================
// ENTITY TYPES
// ============================================================

export type EntityType =
  | 'repository'
  | 'file'
  | 'function'
  | 'class'
  | 'workflow'
  | 'decision'
  | 'reasoning'
  | 'dependency'
  | 'session'
  | 'memory'
  | 'event'
  | 'architecture_rule'

// ============================================================
// RELATIONSHIP TYPES
// ============================================================

export type RelationshipType =
  | 'IMPORTS'
  | 'CALLS'
  | 'DEPENDS_ON'
  | 'MODIFIES'
  | 'RELATES_TO'
  | 'REASONED_ABOUT'
  | 'SUPERSEDES'
  | 'REINFORCES'
  | 'CONTRADICTS'
  | 'CREATED_BY'
  | 'CONNECTED_TO'

// ============================================================
// MEMORY TYPES
// ============================================================

export type MemoryType =
  | 'session'        // short-term, expires 14 days
  | 'structural'     // long-term architectural reasoning
  | 'reinforced'     // human-confirmed, highest trust
  | 'correction'     // human override — never decays, always wins

// ============================================================
// AGENT TYPES
// ============================================================

export type AgentType =
  | 'memory-agent'   // session observation + memory lifecycle
  | 'graph-agent'    // graph integrity + pruning queue
  | 'drift-agent'    // doctrine comparison + flag writing

export type FlagSeverity = 'info' | 'warning' | 'critical'

export type FlagType =
  | 'drift'          // code deviates from doctrine
  | 'stale'          // node unreferenced 60+ days
  | 'conflict'       // two nodes contradict each other
  | 'limit'          // approaching hard graph limits
  | 'entropy'        // graph health degrading

// ============================================================
// EVENT TYPES
// ============================================================

export type EventType =
  | 'node_created'
  | 'node_updated'
  | 'node_deleted'
  | 'node_quarantined'
  | 'memory_created'
  | 'memory_corrected'
  | 'memory_reinforced'
  | 'memory_decayed'
  | 'relationship_created'
  | 'relationship_removed'
  | 'drift_flagged'
  | 'drift_acknowledged'
  | 'session_started'
  | 'session_ended'
  | 'graph_pruned'
  | 'memory_archived'

export type Actor =
  | 'human'
  | 'memory-agent'
  | 'graph-agent'
  | 'drift-agent'
  | 'system'

// ============================================================
// DATABASE ROW TYPES
// ============================================================

export interface Repository {
  id: string
  name: string
  path: string
  created_at: number
  last_active: number | null
  node_count: number
  status: 'active' | 'archived' | 'paused'
}

export interface Entity {
  id: string
  repo_id: string
  type: EntityType
  name: string
  path: string | null
  content: string | null       // serialised JSON
  weight: number               // 0.0 – 1.0
  confidence: number           // 0.0 – 1.0
  trust_level: 'ai' | 'human' | 'system'
  source: string | null
  created_at: number
  updated_at: number
  last_accessed: number | null
  expires_at: number | null
  status: 'active' | 'quarantine' | 'archived' | 'deleted'
}

export interface Relationship {
  id: string
  repo_id: string
  from_id: string
  to_id: string
  type: RelationshipType
  weight: number
  confidence: number
  metadata: string | null      // JSON
  created_at: number
  updated_at: number
  status: 'active' | 'superseded' | 'archived'
}

export interface Memory {
  id: string
  repo_id: string
  entity_id: string | null
  type: MemoryType
  content: string
  weight: number
  reinforcement: number
  is_correction: 0 | 1
  corrects_id: string | null
  session_id: string | null
  created_at: number
  updated_at: number
  last_accessed: number | null
  expires_at: number | null
  status: 'active' | 'decayed' | 'archived' | 'deleted'
}

export interface Session {
  id: string
  repo_id: string
  started_at: number
  ended_at: number | null
  files_touched: string | null  // JSON array
  summary: string | null
  node_count: number
  status: 'active' | 'completed' | 'archived'
}

export interface ReasoningTrace {
  id: string
  repo_id: string
  session_id: string | null
  entity_ids: string | null     // JSON array
  memory_ids: string | null     // JSON array
  query: string
  context: string | null
  response: string | null
  model: string | null
  confidence: number | null
  created_at: number
}

export interface Event {
  id: string
  repo_id: string | null
  type: EventType
  actor: Actor
  entity_id: string | null
  memory_id: string | null
  payload: string | null        // JSON
  created_at: number
}

export interface AgentFlag {
  id: string
  repo_id: string
  agent: AgentType
  severity: FlagSeverity
  type: FlagType
  title: string
  detail: string | null
  entity_ids: string | null     // JSON array
  acknowledged: 0 | 1
  acknowledged_at: number | null
  resolution: string | null
  created_at: number
  expires_at: number | null
}

export interface Doctrine {
  key: string
  repo_id: string
  value: string
  trust_level: 'human'
  created_at: number
  updated_at: number
}

export interface GraphHealth {
  id: string
  repo_id: string
  node_count: number
  edge_count: number
  memory_count: number
  stale_nodes: number
  orphan_nodes: number
  pending_prune: number
  db_size_bytes: number | null
  health_score: number | null
  notes: string | null
  created_at: number
}

// ============================================================
// PHASE 1 HARD LIMITS
// ============================================================

export const GRAPH_LIMITS = {
  MAX_NODES_PER_REPO: 500,
  MAX_EDGES_PER_NODE: 20,
  MAX_SESSION_NOTES: 200,
  MAX_ACTIVE_BRANCHES: 15,
  MAX_DB_SIZE_BYTES: 50 * 1024 * 1024,  // 50MB
  CONSOLIDATION_TRIGGER: 75,             // sessions
} as const

// ============================================================
// MEMORY WEIGHT CONSTANTS
// ============================================================

export const MEMORY_WEIGHTS = {
  ROOT: 0.97,
  CORRECTION: 0.90,
  BRANCH: 0.78,
  STRUCTURAL: 0.60,
  FEATURE: 0.50,
  SESSION: 0.30,
  FLAG: 0.50,
} as const

// ============================================================
// MEMORY EXPIRY (milliseconds)
// ============================================================

export const MEMORY_EXPIRY = {
  SESSION_NOTE_MS: 14 * 24 * 60 * 60 * 1000,        // 14 days
  FLAG_NODE_MS:    7  * 24 * 60 * 60 * 1000,         //  7 days
  FEATURE_NODE_MS: 30 * 24 * 60 * 60 * 1000,         // 30 days
  BRANCH_NODE_MS:  180 * 24 * 60 * 60 * 1000,        // 6 months
} as const

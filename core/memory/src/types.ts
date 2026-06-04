/**
 * BanyanTree Memory Engine Types
 *
 * Memory is NOT a vector store. It is NOT raw text blobs.
 * Memory attaches to stable graph entities (identity.ts IDs).
 * That is what separates BanyanTree from "LLM + vector DB."
 *
 * Five operations (ChatGPT Block 6 spec):
 * Create → Reinforce → Correct → Decay → Delete
 *
 * Three memory types:
 * session     — what happened in this working period (ephemeral)
 * structural  — architectural decisions, design intent (long-lived)
 * correction  — human override, never decays, always wins
 */

export type MemoryType =
  | 'session'       // short-lived, expires 14 days unless reinforced
  | 'structural'    // long-lived architectural reasoning
  | 'correction'    // human override — weight 0.90, never decays

export type MemoryStatus =
  | 'active'
  | 'decayed'
  | 'archived'
  | 'deleted'

// ============================================================
// MEMORY NODE
// ============================================================

export interface MemoryNode {
  id: string
  repoId: string
  entityId: string | null     // stable graph entity ID this memory attaches to
  type: MemoryType
  content: string             // human-readable memory text
  weight: number              // 0.0 – 1.0
  reinforcement: number       // count of human reinforcements
  isCorrection: boolean       // true = human override
  correctsId: string | null   // ID of memory this supersedes
  sessionId: string | null
  createdAt: number
  updatedAt: number
  lastAccessed: number | null
  expiresAt: number | null
  status: MemoryStatus
}

// ============================================================
// MEMORY CREATION REQUEST
// ============================================================

export interface CreateMemoryRequest {
  repoId: string
  entityId: string | null     // which graph entity this attaches to
  type: MemoryType
  content: string
  sessionId: string | null
  isCorrection?: boolean
  correctsId?: string         // if correcting, which memory is superseded
  initialWeight?: number      // override default weight
}

// ============================================================
// WEIGHT CONSTANTS (memory-lifecycle.md)
// ============================================================

export const WEIGHTS = {
  CORRECTION: 0.90,           // human override — never decays
  STRUCTURAL: 0.65,           // architectural reasoning
  SESSION: 0.35,              // ephemeral session note
  REINFORCEMENT_BOOST: 0.10,  // each human reinforcement adds this
  MAX: 1.0,
  MIN: 0.0,
} as const

// ============================================================
// EXPIRY CONSTANTS (memory-lifecycle.md)
// ============================================================

export const EXPIRY_MS = {
  SESSION:    14 * 24 * 60 * 60 * 1000,   // 14 days
  STRUCTURAL: 180 * 24 * 60 * 60 * 1000,  // 6 months (if unreferenced)
  CORRECTION: null,                         // never expires
} as const

// ============================================================
// DECAY CONSTANTS
// Applied by the memory agent on a schedule
// ============================================================

export const DECAY = {
  SESSION_DAILY: 0.02,        // session memories lose 2% weight per day
  STRUCTURAL_WEEKLY: 0.005,   // structural memories lose 0.5% per week
  CORRECTION: 0,              // corrections never decay
  MIN_BEFORE_ARCHIVE: 0.15,   // archive when weight drops below this
} as const

// ============================================================
// CONTEXT ASSEMBLY
// What the MCP server receives for a given file context
// ============================================================

export interface MemoryContext {
  entityId: string
  memories: MemoryNode[]
  corrections: MemoryNode[]   // separated for priority display
  openQuestions: MemoryNode[] // session memories marked as unresolved
  totalWeight: number         // sum of active memory weights
}

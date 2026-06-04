/**
 * BanyanTree Entity Identity System
 *
 * ChatGPT's most important Block 5 insight:
 * "You need a stable identity strategy NOW."
 *
 * Random UUIDs break everything downstream:
 * - Memory engine cannot attach to stable references
 * - MCP tools cannot traverse reliably
 * - Sync engine cannot merge without deterministic IDs
 *
 * Identity format:
 *   {type}:{repoId}:{relativePath}:{qualifier}
 *
 * Examples:
 *   file:repo-abc:src/auth/AuthService.ts
 *   function:repo-abc:src/auth/AuthService.ts:validateToken
 *   class:repo-abc:src/auth/AuthService.ts:AuthManager
 *   import:repo-abc:src/auth/AuthService.ts:jsonwebtoken
 *   module:repo-abc:src/auth
 *
 * Properties:
 * - Deterministic: same input always produces same ID
 * - Stable: survives file renames only if path is the same
 * - Readable: human-inspectable in banyan inspect output
 * - Collision-resistant: type prefix prevents cross-type collisions
 */

import { createHash } from 'crypto'

export type EntityKind =
  | 'file'
  | 'function'
  | 'class'
  | 'import'
  | 'export'
  | 'module'
  | 'dependency'

// ============================================================
// STABLE ID GENERATION
// ============================================================

/**
 * Generate a stable, deterministic entity ID.
 * The ID is a short hash of the canonical path — human-readable prefix
 * plus a 12-character hash suffix for uniqueness.
 */
export function makeEntityId(
  kind: EntityKind,
  repoId: string,
  relativePath: string,
  qualifier?: string   // function name, class name, import source, etc.
): string {
  const canonical = qualifier
    ? `${kind}:${repoId}:${relativePath}:${qualifier}`
    : `${kind}:${repoId}:${relativePath}`

  // Short hash for compactness — 12 hex chars = 48 bits, sufficient for local use
  const hash = createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 12)

  // Human-readable prefix — strips leading dots and slashes, truncates
  const pathLabel = relativePath
    .replace(/^[./\\]+/, '')
    .replace(/[/\\]/g, '-')
    .slice(0, 40)

  const qualLabel = qualifier
    ? `-${qualifier.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}`
    : ''

  return `${kind}:${pathLabel}${qualLabel}:${hash}`
}

/**
 * Generate a stable ID for a module (directory-level entity).
 * Module ID is based on the directory path, not a file.
 */
export function makeModuleId(repoId: string, dirPath: string): string {
  return makeEntityId('module', repoId, dirPath)
}

/**
 * Parse an entity ID back into its components.
 * Returns null if the ID format is unrecognised.
 */
export function parseEntityId(id: string): {
  kind: EntityKind
  pathLabel: string
  hash: string
} | null {
  const parts = id.split(':')
  if (parts.length < 3) return null

  const kind = parts[0] as EntityKind
  const hash = parts[parts.length - 1] ?? ''
  const pathLabel = parts.slice(1, -1).join(':')

  return { kind, pathLabel, hash }
}

/**
 * Verify an entity ID looks valid (non-empty, correct format).
 */
export function isValidEntityId(id: string): boolean {
  if (!id || id.length < 10) return false
  const parsed = parseEntityId(id)
  if (!parsed) return false
  const validKinds: EntityKind[] = ['file', 'function', 'class', 'import', 'export', 'module', 'dependency']
  return validKinds.includes(parsed.kind)
}

// ============================================================
// RELATIONSHIP IDENTITY
// Relationships also get deterministic IDs
// ============================================================

export function makeRelationshipId(
  fromId: string,
  toId: string,
  type: string
): string {
  const canonical = `${fromId}→${type}→${toId}`
  const hash = createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 16)
  return `rel:${type.toLowerCase()}:${hash}`
}

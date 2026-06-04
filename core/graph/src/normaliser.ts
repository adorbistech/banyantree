/**
 * BanyanTree Entity Normaliser
 *
 * The bridge between Block 4 (Parser) and Block 5 (Graph Engine).
 *
 * ChatGPT: "The graph engine should NEVER parse code itself.
 * Parser owns parsing. Graph engine owns normalisation,
 * identity, relationship creation, traversal structures."
 *
 * This file takes ParsedFile (raw AST extraction) and produces
 * GraphEntity + GraphRelationship objects with stable IDs.
 *
 * Node creation policy (graph-governance.md):
 * Only session-referenced files, dependency-critical files,
 * architecturally connected files, or reinforced files become nodes.
 * The normaliser produces candidates — the graph engine decides
 * which ones to actually write based on the policy.
 */

import type { ParsedFile } from '../../services/parser/src/types.js'
import type {
  GraphEntity,
  GraphRelationship,
  GraphWriteOperation,
} from './types.js'
import {
  makeEntityId,
  makeModuleId,
  makeRelationshipId,
} from './identity.js'
import { dirname } from 'path'

// ============================================================
// MAIN NORMALISER
// Converts one ParsedFile into a complete GraphWriteOperation
// ============================================================

export function normaliseFile(
  parsed: ParsedFile,
  repoId: string,
  sessionId: string | null = null
): GraphWriteOperation {
  const now = Date.now()
  const entities: GraphEntity[] = []
  const relationships: GraphRelationship[] = []

  const filePath = parsed.path
  const relativePath = parsed.relativePath

  // ── 1. File entity ────────────────────────────────────────
  const fileId = makeEntityId('file', repoId, relativePath)

  const fileEntity: GraphEntity = {
    id: fileId,
    type: 'file',
    name: relativePath.split('/').pop() ?? relativePath,
    repoId,
    filePath,
    relativePath,
    metadata: {
      language: parsed.language,
      lineCount: parsed.lineCount,
      sizeBytes: parsed.sizeBytes,
      parseTimeMs: parsed.parseTimeMs,
      exports: parsed.exports.map(e => e.name),
    },
    weight: 0.5,           // default — updated by memory and graph agent over time
    confidence: 0.9,       // high confidence from direct AST parse
    createdAt: now,
    updatedAt: now,
  }

  entities.push(fileEntity)

  // ── 2. Module entity (directory) ──────────────────────────
  const dirPath = dirname(relativePath)
  if (dirPath && dirPath !== '.') {
    const moduleId = makeModuleId(repoId, dirPath)

    const moduleEntity: GraphEntity = {
      id: moduleId,
      type: 'module',
      name: dirPath.split('/').pop() ?? dirPath,
      repoId,
      filePath: null,
      relativePath: dirPath,
      metadata: { dirPath },
      weight: 0.5,
      confidence: 0.9,
      createdAt: now,
      updatedAt: now,
    }

    entities.push(moduleEntity)

    // File BELONGS_TO module
    relationships.push({
      id: makeRelationshipId(fileId, moduleId, 'BELONGS_TO'),
      fromId: fileId,
      toId: moduleId,
      type: 'BELONGS_TO',
      weight: 1.0,           // structural — always high weight
      confidence: 1.0,
      metadata: {},
      createdAt: now,
    })
  }

  // ── 3. Function entities ──────────────────────────────────
  for (const fn of parsed.functions) {
    const fnId = makeEntityId('function', repoId, relativePath, fn.name)

    entities.push({
      id: fnId,
      type: 'function',
      name: fn.name,
      repoId,
      filePath,
      relativePath,
      metadata: {
        isAsync: fn.isAsync,
        isExported: fn.isExported,
        params: fn.params,
        line: fn.line,
      },
      weight: fn.isExported ? 0.65 : 0.45,   // exported functions weighted higher
      confidence: 0.85,
      createdAt: now,
      updatedAt: now,
    })

    // File DEFINES function
    relationships.push({
      id: makeRelationshipId(fileId, fnId, 'DEFINES'),
      fromId: fileId,
      toId: fnId,
      type: 'DEFINES',
      weight: 1.0,
      confidence: 1.0,
      metadata: { line: fn.line },
      createdAt: now,
    })
  }

  // ── 4. Class entities ─────────────────────────────────────
  for (const cls of parsed.classes) {
    const clsId = makeEntityId('class', repoId, relativePath, cls.name)

    entities.push({
      id: clsId,
      type: 'class',
      name: cls.name,
      repoId,
      filePath,
      relativePath,
      metadata: {
        isExported: cls.isExported,
        extends: cls.extends,
        implements: cls.implements,
        line: cls.line,
      },
      weight: cls.isExported ? 0.70 : 0.50,
      confidence: 0.90,
      createdAt: now,
      updatedAt: now,
    })

    // File DEFINES class
    relationships.push({
      id: makeRelationshipId(fileId, clsId, 'DEFINES'),
      fromId: fileId,
      toId: clsId,
      type: 'DEFINES',
      weight: 1.0,
      confidence: 1.0,
      metadata: { line: cls.line },
      createdAt: now,
    })
  }

  // ── 5. Import entities + IMPORTS relationships ────────────
  for (const imp of parsed.imports) {
    if (!imp.source) continue

    const importId = makeEntityId('import', repoId, relativePath, imp.source)

    entities.push({
      id: importId,
      type: 'import',
      name: imp.source,
      repoId,
      filePath,
      relativePath,
      metadata: {
        source: imp.source,
        names: imp.names,
        isDefault: imp.isDefault,
        isDynamic: imp.isDynamic,
        line: imp.line,
      },
      weight: 0.50,
      confidence: 0.90,
      createdAt: now,
      updatedAt: now,
    })

    // File IMPORTS the import entity
    relationships.push({
      id: makeRelationshipId(fileId, importId, 'IMPORTS'),
      fromId: fileId,
      toId: importId,
      type: 'IMPORTS',
      weight: 0.80,
      confidence: 0.90,
      metadata: {
        line: imp.line,
        isDynamic: imp.isDynamic,
      },
      createdAt: now,
    })

    // Also create a DEPENDS_ON to external packages
    if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) {
      const depId = makeEntityId('dependency', repoId, '', imp.source)

      entities.push({
        id: depId,
        type: 'dependency',
        name: imp.source,
        repoId,
        filePath: null,
        relativePath: null,
        metadata: { source: imp.source },
        weight: 0.40,
        confidence: 0.85,
        createdAt: now,
        updatedAt: now,
      })

      relationships.push({
        id: makeRelationshipId(fileId, depId, 'DEPENDS_ON'),
        fromId: fileId,
        toId: depId,
        type: 'DEPENDS_ON',
        weight: 0.70,
        confidence: 0.85,
        metadata: { isInferred: false },
        createdAt: now,
      })
    }
  }

  // ── 6. Export entities ────────────────────────────────────
  for (const exp of parsed.exports) {
    const expId = makeEntityId('export', repoId, relativePath, exp.name)

    entities.push({
      id: expId,
      type: 'export',
      name: exp.name,
      repoId,
      filePath,
      relativePath,
      metadata: {
        kind: exp.kind,
        line: exp.line,
      },
      weight: 0.65,          // exports are important — other files depend on them
      confidence: 0.90,
      createdAt: now,
      updatedAt: now,
    })

    // File EXPORTS symbol
    relationships.push({
      id: makeRelationshipId(fileId, expId, 'EXPORTS'),
      fromId: fileId,
      toId: expId,
      type: 'EXPORTS',
      weight: 0.90,
      confidence: 1.0,
      metadata: { line: exp.line },
      createdAt: now,
    })
  }

  // Deduplicate entities by ID (parser may produce duplicates for complex files)
  const seen = new Set<string>()
  const deduped = entities.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  const seenRel = new Set<string>()
  const dedupedRel = relationships.filter(r => {
    if (seenRel.has(r.id)) return false
    seenRel.add(r.id)
    return true
  })

  return {
    entities: deduped,
    relationships: dedupedRel,
    repoId,
    filePath,
    sessionId,
  }
}

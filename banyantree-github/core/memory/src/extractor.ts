/**
 * BanyanTree Memory Extractor
 *
 * Extracts memory signals from session activity.
 * NOT an AI agent. A rule-based signal detector.
 *
 * Phase 1: detects structural signals from what files were
 * touched together, how long was spent, session patterns.
 *
 * Phase 2: LLM-assisted summarisation of session content
 * (consolidation agent). That complexity is deferred.
 *
 * What this produces:
 * - File co-occurrence memories (files worked on together)
 * - Session duration signals (time = attention weight)
 * - Open question markers (TODO/FIXME/unresolved comments)
 *
 * Memory is shown to DEVELOPER first (R03).
 * Nothing is stored until the developer acknowledges or
 * the session ends and the memory agent runs.
 */

import { makeEntityId } from '../../graph/src/identity.js'
import type { CreateMemoryRequest } from './types.js'

export interface SessionSignal {
  repoId: string
  sessionId: string
  filesObserved: string[]     // relative paths
  durationMs: number
  repoRoot: string
}

export interface ExtractedMemory extends CreateMemoryRequest {
  confidence: number          // 0.0 – 1.0 how confident we are this is signal
  source: 'co_occurrence' | 'duration' | 'open_question' | 'explicit'
}

// ============================================================
// SESSION SIGNAL EXTRACTOR
// ============================================================

export function extractFromSession(signal: SessionSignal): ExtractedMemory[] {
  const memories: ExtractedMemory[] = []
  const { repoId, sessionId, filesObserved, durationMs } = signal

  if (filesObserved.length === 0) return memories

  // ── Co-occurrence memory ──────────────────────────────────
  // Files worked on in the same session are semantically related
  // This is the foundation of graph relationship building
  if (filesObserved.length > 1) {
    const primaryFile = filesObserved[0]!
    const related = filesObserved.slice(1, 4)  // max 3 related

    if (related.length > 0) {
      const entityId = makeEntityId('file', repoId, primaryFile)
      const relatedNames = related.map(f => f.split('/').pop()).join(', ')

      memories.push({
        repoId,
        entityId,
        type: 'session',
        content: `Worked on ${primaryFile} alongside ${relatedNames} in the same session.`,
        sessionId,
        confidence: 0.7,
        source: 'co_occurrence',
      })
    }
  }

  // ── Duration signal ───────────────────────────────────────
  // Long sessions on a file = higher architectural importance
  const minutesSpent = Math.round(durationMs / 60000)
  if (minutesSpent > 20 && filesObserved.length > 0) {
    const primaryFile = filesObserved[0]!
    const entityId = makeEntityId('file', repoId, primaryFile)

    memories.push({
      repoId,
      entityId,
      type: 'session',
      content: `Extended session: ${minutesSpent} minutes spent primarily in this area.`,
      sessionId,
      confidence: 0.6,
      source: 'duration',
      initialWeight: 0.40,
    })
  }

  return memories
}

// ============================================================
// EXPLICIT MEMORY SIGNAL
// When developer says "remember this" via VS Code action
// or CLI command — highest trust, immediate structural weight
// ============================================================

export function createExplicitMemory(
  repoId: string,
  entityId: string | null,
  content: string,
  sessionId: string | null
): ExtractedMemory {
  return {
    repoId,
    entityId,
    type: 'structural',
    content,
    sessionId,
    confidence: 1.0,
    source: 'explicit',
    initialWeight: 0.75,  // starts high, grows with reinforcement
  }
}

// ============================================================
// OPEN QUESTION DETECTOR
// Scans file content for unresolved markers
// Phase 1: simple pattern matching
// ============================================================

const OPEN_QUESTION_PATTERNS = [
  /TODO[:\s]+(.+)/gi,
  /FIXME[:\s]+(.+)/gi,
  /HACK[:\s]+(.+)/gi,
  /NOTE[:\s]+(.+)/gi,
  /\?\s*$/gm,              // lines ending with ?
  /unresolved[:\s]+(.+)/gi,
  /open question[:\s]+(.+)/gi,
  /why does this (.+)/gi,
]

export function extractOpenQuestions(
  repoId: string,
  relativePath: string,
  content: string,
  sessionId: string | null
): ExtractedMemory[] {
  const memories: ExtractedMemory[] = []
  const entityId = makeEntityId('file', repoId, relativePath)

  for (const pattern of OPEN_QUESTION_PATTERNS) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const questionText = match[1]?.trim() ?? match[0]?.trim()
      if (!questionText || questionText.length < 10) continue

      memories.push({
        repoId,
        entityId,
        type: 'session',
        content: `Open question in ${relativePath}: ${questionText}`,
        sessionId,
        confidence: 0.8,
        source: 'open_question',
        initialWeight: 0.45,  // moderate — developer needs to confirm
      })

      // Don't extract too many from one file
      if (memories.length >= 3) break
    }
    if (memories.length >= 3) break
  }

  return memories
}

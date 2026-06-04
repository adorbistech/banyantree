/**
 * BanyanTree Parser — Public API
 *
 * The single entry point for all file parsing.
 * Secrets filter is applied BEFORE extraction.
 * Content is never stored verbatim — only structure.
 *
 * Performance budget: < 100ms per file
 */

import { readFileSync, statSync } from 'fs'
import { relative } from 'path'
import { detectLanguage, isParseableFile } from './language-detector.js'
import { parseTypeScript } from './ts-parser.js'
import { isPathAllowed, filterContent } from '../../../core/security/secrets-filter.js'
import type { ParseResult, ParsedFile } from './types.js'

export type { ParsedFile, ParseResult, SupportedLanguage } from './types.js'

// ============================================================
// MAIN PARSE FUNCTION
// ============================================================

export async function parseFile(
  absolutePath: string,
  repoRoot: string
): Promise<ParseResult> {
  const relativePath = relative(repoRoot, absolutePath)

  // ── Security gate 1: path filter ──────────────────────────
  if (!isPathAllowed(absolutePath)) {
    return {
      success: false,
      error: {
        path: absolutePath,
        reason: 'Path excluded by secrets policy',
        fatal: false,
      },
    }
  }

  // ── Language check ─────────────────────────────────────────
  if (!isParseableFile(absolutePath)) {
    return {
      success: false,
      error: {
        path: absolutePath,
        reason: 'Unsupported file type',
        fatal: false,
      },
    }
  }

  // ── Read file ──────────────────────────────────────────────
  let content: string
  let sizeBytes: number

  try {
    const stat = statSync(absolutePath)
    sizeBytes = stat.size

    // Skip very large files — they are unlikely to be cognitively relevant
    // and would hurt performance budget
    if (sizeBytes > 500_000) {
      return {
        success: false,
        error: {
          path: absolutePath,
          reason: `File too large (${Math.round(sizeBytes / 1024)}KB > 500KB limit)`,
          fatal: false,
        },
      }
    }

    content = readFileSync(absolutePath, 'utf8')
  } catch (err) {
    return {
      success: false,
      error: {
        path: absolutePath,
        reason: err instanceof Error ? err.message : 'Read error',
        fatal: false,
      },
    }
  }

  // ── Security gate 2: content filter ───────────────────────
  // Redacts secret-looking values before any extraction
  const filtered = filterContent(content)
  const safeContent = filtered.content ?? content

  // ── Parse ──────────────────────────────────────────────────
  const language = detectLanguage(absolutePath)

  try {
    let parsed: ParsedFile

    if (language === 'typescript' || language === 'javascript') {
      parsed = await parseTypeScript(safeContent, absolutePath, relativePath, language, sizeBytes)
    } else if (language === 'python') {
      // Python parser — Phase 1 stub (regex fallback only)
      parsed = await parseTypeScript(safeContent, absolutePath, relativePath, language, sizeBytes)
    } else {
      return {
        success: false,
        error: { path: absolutePath, reason: 'No parser for language', fatal: false },
      }
    }

    return { success: true, file: parsed }
  } catch (err) {
    return {
      success: false,
      error: {
        path: absolutePath,
        reason: err instanceof Error ? err.message : 'Parse failed',
        fatal: false,
      },
    }
  }
}

// ============================================================
// BATCH PARSE
// Parses multiple files with performance tracking
// ============================================================

export async function parseFiles(
  paths: string[],
  repoRoot: string
): Promise<{ results: ParseResult[]; slowFiles: string[]; errorCount: number }> {
  const results: ParseResult[] = []
  const slowFiles: string[] = []
  let errorCount = 0

  for (const path of paths) {
    const result = await parseFile(path, repoRoot)
    results.push(result)

    if (result.success) {
      if (result.file.parseTimeMs > 100) {
        slowFiles.push(path)
      }
    } else {
      if (result.error.fatal) errorCount++
    }
  }

  return { results, slowFiles, errorCount }
}

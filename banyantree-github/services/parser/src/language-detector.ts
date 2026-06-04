/**
 * BanyanTree Language Detector
 *
 * Maps file extensions to supported parser languages.
 * Phase 1: TypeScript, JavaScript, Python only.
 * Phase 2: additional languages via parser plugins.
 */

import { extname } from 'path'
import type { SupportedLanguage } from './types.js'

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts':  'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js':  'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py':  'python',
}

export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_MAP[ext] ?? 'unknown'
}

export function isParseableFile(filePath: string): boolean {
  return detectLanguage(filePath) !== 'unknown'
}

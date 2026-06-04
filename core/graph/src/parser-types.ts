/**
 * Parser types inlined for graph engine use.
 * Avoids cross-package import from services/parser/src/types.ts
 * which breaks during flat build path resolution.
 */

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'unknown'

export interface ParsedImport {
  source: string
  names: string[]
  isDefault: boolean
  isDynamic: boolean
  line: number
}

export interface ParsedExport {
  name: string
  kind: 'function' | 'class' | 'const' | 'type' | 'default' | 're-export'
  line: number
}

export interface ParsedFunction {
  name: string
  isAsync: boolean
  isExported: boolean
  params: string[]
  line: number
}

export interface ParsedClass {
  name: string
  isExported: boolean
  extends: string | null
  implements: string[]
  line: number
}

export interface ParsedCall {
  callee: string
  line: number
}

export interface ParsedFile {
  path: string
  relativePath: string
  language: SupportedLanguage
  sizeBytes: number
  lineCount: number
  parsedAt: number
  parseTimeMs: number
  imports: ParsedImport[]
  exports: ParsedExport[]
  functions: ParsedFunction[]
  classes: ParsedClass[]
  calls: ParsedCall[]
  dependencies: string[]
  errors: string[]
}

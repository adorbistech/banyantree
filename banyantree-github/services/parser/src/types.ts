/**
 * BanyanTree Parser Types
 *
 * These are the output types of the parser — structured extractions
 * from AST analysis. They are NOT graph entities yet.
 *
 * The graph engine (Block 5) converts ParsedFile → Entity + Relationship.
 * The parser only extracts. It never writes to the graph.
 *
 * Node creation policy (graph-governance.md):
 * A node is created ONLY when the file was referenced in an active AI session,
 * or the developer explicitly said "remember this",
 * or the file is in the dependency chain of an existing root node.
 *
 * The parser extracts regardless — the graph engine decides what enters.
 */

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'unknown'

export interface ParsedImport {
  source: string           // what is imported from (module path)
  names: string[]          // named imports
  isDefault: boolean       // default import?
  isDynamic: boolean       // dynamic import()?
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
  callee: string           // what is being called
  line: number
}

export interface ParsedFile {
  path: string             // absolute path
  relativePath: string     // relative to repo root
  language: SupportedLanguage
  sizeBytes: number
  lineCount: number
  parsedAt: number         // timestamp
  parseTimeMs: number      // performance tracking

  imports: ParsedImport[]
  exports: ParsedExport[]
  functions: ParsedFunction[]
  classes: ParsedClass[]
  calls: ParsedCall[]

  // Extracted dependencies (resolved module paths)
  dependencies: string[]

  // Parse errors (non-fatal — partial results still useful)
  errors: string[]
}

export interface ParseError {
  path: string
  reason: string
  fatal: boolean
}

export type ParseResult =
  | { success: true; file: ParsedFile }
  | { success: false; error: ParseError }

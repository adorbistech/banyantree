/**
 * BanyanTree TypeScript/JavaScript Parser
 *
 * Uses Tree-sitter to extract cognitive structure from TS/JS files.
 * Performance budget: < 100ms per file (performance-budget.md)
 *
 * Extracts:
 * - imports (static + dynamic)
 * - exports (named, default, re-export)
 * - function declarations
 * - class declarations
 * - call expressions (for dependency mapping)
 *
 * Does NOT extract:
 * - raw file content (never stored verbatim)
 * - string literals (potential secrets)
 * - comments (noise)
 * - variable values (potential secrets)
 */

import type { ParsedFile, ParsedImport, ParsedExport, ParsedFunction, ParsedClass, ParsedCall, SupportedLanguage } from './types.js'

// Tree-sitter is loaded lazily to avoid startup cost
let Parser: any = null
let TypeScriptLang: any = null
let JavaScriptLang: any = null

async function loadTreeSitter(): Promise<void> {
  if (Parser) return
  try {
    const ts = await import('tree-sitter')
    const tsLang = await import('tree-sitter-typescript')
    const jsLang = await import('tree-sitter-javascript')
    Parser = ts.default ?? ts
    TypeScriptLang = tsLang.default?.typescript ?? tsLang.typescript
    JavaScriptLang = jsLang.default ?? jsLang
  } catch {
    // Tree-sitter not available — graceful degradation
    Parser = null
  }
}

export async function parseTypeScript(
  content: string,
  filePath: string,
  relativePath: string,
  language: SupportedLanguage,
  sizeBytes: number
): Promise<ParsedFile> {
  const startMs = Date.now()
  const errors: string[] = []

  const lineCount = content.split('\n').length

  const imports: ParsedImport[] = []
  const exports_: ParsedExport[] = []
  const functions: ParsedFunction[] = []
  const classes: ParsedClass[] = []
  const calls: ParsedCall[] = []

  try {
    await loadTreeSitter()

    if (Parser) {
      const parser = new Parser()
      const lang = language === 'typescript' ? TypeScriptLang : JavaScriptLang

      if (lang) {
        parser.setLanguage(lang)
        const tree = parser.parse(content)
        const root = tree.rootNode

        walkNode(root, content, imports, exports_, functions, classes, calls, errors)
      } else {
        // Fallback: regex-based extraction if tree-sitter lang not available
        extractWithRegex(content, imports, exports_, functions, classes)
      }
    } else {
      // Full fallback: regex-based
      extractWithRegex(content, imports, exports_, functions, classes)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Parse error: ${msg}`)
    // Partial results still returned — non-fatal
  }

  const parseTimeMs = Date.now() - startMs

  // Log slow parses for performance monitoring
  if (parseTimeMs > 100) {
    console.warn(`[BANYAN:parser] Slow parse: ${relativePath} took ${parseTimeMs}ms`)
  }

  return {
    path: filePath,
    relativePath,
    language,
    sizeBytes,
    lineCount,
    parsedAt: Date.now(),
    parseTimeMs,
    imports,
    exports: exports_,
    functions,
    classes,
    calls,
    dependencies: extractDependencies(imports),
    errors,
  }
}

// ============================================================
// TREE-SITTER AST WALKER
// ============================================================

function walkNode(
  node: any,
  content: string,
  imports: ParsedImport[],
  exports_: ParsedExport[],
  functions: ParsedFunction[],
  classes: ParsedClass[],
  calls: ParsedCall[],
  errors: string[]
): void {
  switch (node.type) {

    case 'import_statement':
      try {
        imports.push(extractImport(node, content))
      } catch { /* partial parse — skip this node */ }
      break

    case 'export_statement':
    case 'export_default_declaration':
      try {
        const exp = extractExport(node, content)
        if (exp) exports_.push(exp)
      } catch { /* skip */ }
      break

    case 'function_declaration':
    case 'function_expression':
    case 'arrow_function': {
      try {
        const fn = extractFunction(node, content)
        if (fn) functions.push(fn)
      } catch { /* skip */ }
      break
    }

    case 'class_declaration':
    case 'class_expression': {
      try {
        const cls = extractClass(node, content)
        if (cls) classes.push(cls)
      } catch { /* skip */ }
      break
    }

    case 'call_expression': {
      try {
        const callee = node.childForFieldName('function')
        if (callee) {
          const calleeName = content.slice(callee.startIndex, callee.endIndex)
          // Only record named function calls, not anonymous ones
          if (calleeName && !calleeName.includes('\n') && calleeName.length < 100) {
            calls.push({ callee: calleeName, line: node.startPosition.row + 1 })
          }
        }
      } catch { /* skip */ }
      break
    }
  }

  // Recurse into children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      walkNode(child, content, imports, exports_, functions, classes, calls, errors)
    }
  }
}

// ============================================================
// EXTRACTION HELPERS
// ============================================================

function extractImport(node: any, content: string): ParsedImport {
  const source = node.childForFieldName('source')
  const sourcePath = source
    ? content.slice(source.startIndex + 1, source.endIndex - 1)  // strip quotes
    : ''

  const names: string[] = []
  let isDefault = false

  // Walk import clause for named imports
  const clause = node.childForFieldName('import_clause')
  if (clause) {
    for (let i = 0; i < clause.childCount; i++) {
      const child = clause.child(i)
      if (!child) continue
      if (child.type === 'identifier') {
        isDefault = true
        names.push(content.slice(child.startIndex, child.endIndex))
      } else if (child.type === 'named_imports') {
        for (let j = 0; j < child.childCount; j++) {
          const spec = child.child(j)
          if (spec?.type === 'import_specifier') {
            const name = spec.childForFieldName('name')
            if (name) names.push(content.slice(name.startIndex, name.endIndex))
          }
        }
      }
    }
  }

  return {
    source: sourcePath,
    names,
    isDefault,
    isDynamic: false,
    line: node.startPosition.row + 1,
  }
}

function extractExport(node: any, content: string): ParsedExport | null {
  const declaration = node.childForFieldName('declaration')
  if (!declaration) return null

  const line = node.startPosition.row + 1

  if (declaration.type === 'function_declaration') {
    const nameNode = declaration.childForFieldName('name')
    if (nameNode) {
      return { name: content.slice(nameNode.startIndex, nameNode.endIndex), kind: 'function', line }
    }
  }

  if (declaration.type === 'class_declaration') {
    const nameNode = declaration.childForFieldName('name')
    if (nameNode) {
      return { name: content.slice(nameNode.startIndex, nameNode.endIndex), kind: 'class', line }
    }
  }

  if (node.type === 'export_default_declaration') {
    return { name: 'default', kind: 'default', line }
  }

  return null
}

function extractFunction(node: any, content: string): ParsedFunction | null {
  const nameNode = node.childForFieldName('name')
  if (!nameNode) return null

  const name = content.slice(nameNode.startIndex, nameNode.endIndex)
  if (!name || name.length > 100) return null

  const isAsync = node.children.some((c: any) => c?.type === 'async')
  const params: string[] = []

  const paramsNode = node.childForFieldName('parameters')
  if (paramsNode) {
    for (let i = 0; i < paramsNode.childCount; i++) {
      const param = paramsNode.child(i)
      if (param?.type === 'identifier') {
        params.push(content.slice(param.startIndex, param.endIndex))
      }
    }
  }

  return {
    name,
    isAsync,
    isExported: false,  // determined by parent export_statement
    params,
    line: node.startPosition.row + 1,
  }
}

function extractClass(node: any, content: string): ParsedClass | null {
  const nameNode = node.childForFieldName('name')
  if (!nameNode) return null

  const name = content.slice(nameNode.startIndex, nameNode.endIndex)
  if (!name) return null

  return {
    name,
    isExported: false,
    extends: null,
    implements: [],
    line: node.startPosition.row + 1,
  }
}

// ============================================================
// REGEX FALLBACK
// Used when tree-sitter is not available
// Less precise but never throws
// ============================================================

function extractWithRegex(
  content: string,
  imports: ParsedImport[],
  exports_: ParsedExport[],
  functions: ParsedFunction[],
  classes: ParsedClass[]
): void {
  const lines = content.split('\n')

  lines.forEach((line, i) => {
    const lineNum = i + 1
    const trimmed = line.trim()

    // Static imports: import { X } from 'Y'
    const importMatch = trimmed.match(/^import\s+(?:{([^}]+)})?\s*(?:from\s+)?['"]([^'"]+)['"]/)
    if (importMatch) {
      const names = importMatch[1]
        ? importMatch[1].split(',').map(n => n.trim()).filter(Boolean)
        : []
      imports.push({
        source: importMatch[2] ?? '',
        names,
        isDefault: false,
        isDynamic: false,
        line: lineNum,
      })
    }

    // Function declarations
    const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
    if (fnMatch?.[1]) {
      functions.push({
        name: fnMatch[1],
        isAsync: trimmed.includes('async'),
        isExported: trimmed.startsWith('export'),
        params: [],
        line: lineNum,
      })
    }

    // Class declarations
    const clsMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/)
    if (clsMatch?.[1]) {
      classes.push({
        name: clsMatch[1],
        isExported: trimmed.startsWith('export'),
        extends: null,
        implements: [],
        line: lineNum,
      })
    }
  })
}

// ============================================================
// DEPENDENCY EXTRACTION
// Converts import sources to dependency list
// ============================================================

function extractDependencies(imports: ParsedImport[]): string[] {
  const deps = new Set<string>()

  for (const imp of imports) {
    if (!imp.source) continue
    // External packages (not relative paths)
    if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) {
      // Get the package name (handle @scope/package)
      const parts = imp.source.split('/')
      const pkgName = imp.source.startsWith('@')
        ? `${parts[0]}/${parts[1]}`
        : parts[0]
      if (pkgName) deps.add(pkgName)
    } else {
      // Relative imports — normalize the path
      deps.add(imp.source)
    }
  }

  return Array.from(deps)
}

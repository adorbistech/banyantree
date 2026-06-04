/**
 * BanyanTree MCP Tool Handlers
 *
 * What each tool returns when Claude calls it.
 * All handlers are read-only. None mutate state.
 * Every call is logged to the security audit trail.
 *
 * The payload returned to Claude is the full cognition packet:
 * graph relationships + memory hierarchy + corrections + open questions
 * That is fundamentally different from raw code or vector chunks.
 */

import Database from 'better-sqlite3'
import { GraphEngine } from '../../../core/graph/src/index.js'
import { MemoryCoordinator } from '../../../core/memory/src/index.js'
import { makeEntityId } from '../../../core/graph/src/identity.js'
import { v4 as uuid } from 'uuid'

export interface ToolCallContext {
  repoId: string
  repoRoot: string
  db: Database.Database
  sessionId: string | null
}

export interface ToolResult {
  content: Array<{
    type: 'text'
    text: string
  }>
  isError?: boolean
}

// ============================================================
// HANDLER REGISTRY
// ============================================================

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext
): Promise<ToolResult> {
  const graph = new GraphEngine(ctx.db, ctx.repoId)
  const memory = new MemoryCoordinator(ctx.db, ctx.repoId)

  // Log every tool call to security audit trail
  logToolCall(ctx.db, ctx.repoId, toolName, args)

  try {
    switch (toolName) {
      case 'get_file_context':
        return handleGetFileContext(args, ctx, graph, memory)

      case 'get_related_files':
        return handleGetRelatedFiles(args, ctx, graph)

      case 'get_dependencies':
        return handleGetDependencies(args, ctx, graph, memory)

      case 'get_open_questions':
        return handleGetOpenQuestions(args, ctx, memory)

      case 'search_memories':
        return handleSearchMemories(args, ctx, memory)

      case 'get_corrections':
        return handleGetCorrections(args, ctx, memory)

      case 'get_repo_context':
        return handleGetRepoContext(args, ctx, graph, memory)

      default:
        return errorResult(`Unknown tool: ${toolName}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return errorResult(`Tool error (${toolName}): ${msg}`)
  }
}

// ============================================================
// TOOL 1 — get_file_context
// The aha moment payload. Primary tool.
// ============================================================

function handleGetFileContext(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  graph: GraphEngine,
  memory: MemoryCoordinator
): ToolResult {
  const relativePath = args['relative_path'] as string
  const includeRelated = (args['include_related'] ?? true) as boolean

  if (!relativePath) return errorResult('relative_path is required')

  // Get graph context
  const graphCtx = graph.assembleFileContext(relativePath)

  // Get memory context
  const fileEntityId = graphCtx.file?.id ??
    makeEntityId('file', ctx.repoId, relativePath)
  const memCtx = memory.assembleFileContext(fileEntityId)

  // Build the cognition packet
  const sections: string[] = []

  // ── File identity ─────────────────────────────────────────
  sections.push(`## File: ${relativePath}`)

  if (graphCtx.file) {
    const meta = graphCtx.file.metadata
    sections.push(`Language: ${meta['language'] ?? 'unknown'} | Lines: ${meta['lineCount'] ?? '?'} | Graph weight: ${graphCtx.file.weight.toFixed(2)}`)
  }

  // ── Corrections (highest priority — always shown first) ──
  if (memCtx.corrections.length > 0) {
    sections.push('\n### Corrections (human overrides — highest trust)')
    for (const c of memCtx.corrections) {
      sections.push(`- ${c.content}`)
    }
  }

  // ── Open questions ────────────────────────────────────────
  if (memCtx.openQuestions.length > 0) {
    sections.push('\n### Open questions (unresolved)')
    for (const q of memCtx.openQuestions) {
      sections.push(`- ${q.content}`)
    }
  }

  // ── Architectural memories ────────────────────────────────
  const structural = memCtx.memories.filter(
    m => m.type === 'structural' && !m.isCorrection
  )
  if (structural.length > 0) {
    sections.push('\n### Architectural decisions')
    for (const m of structural.slice(0, 5)) {
      sections.push(`- [weight: ${m.weight.toFixed(2)}] ${m.content}`)
    }
  }

  // ── Session notes ─────────────────────────────────────────
  const sessionNotes = memCtx.memories.filter(
    m => m.type === 'session' && !m.isCorrection &&
         !memCtx.openQuestions.find(q => q.id === m.id)
  )
  if (sessionNotes.length > 0) {
    sections.push('\n### Recent session notes')
    for (const n of sessionNotes.slice(0, 3)) {
      const age = msToHuman(Date.now() - n.createdAt)
      sections.push(`- [${age} ago] ${n.content}`)
    }
  }

  // ── Graph connections ─────────────────────────────────────
  if (graphCtx.dependencies.length > 0) {
    sections.push('\n### Direct imports')
    for (const d of graphCtx.dependencies.slice(0, 5)) {
      sections.push(`- ${d.name} (weight: ${d.weight.toFixed(2)})`)
    }
  }

  if (graphCtx.importedBy.length > 0) {
    sections.push('\n### Imported by')
    for (const d of graphCtx.importedBy.slice(0, 5)) {
      sections.push(`- ${d.name}`)
    }
  }

  // ── Related files ─────────────────────────────────────────
  if (includeRelated && graphCtx.related.length > 0) {
    sections.push('\n### Semantically related files')
    for (const r of graphCtx.related.slice(0, 5)) {
      sections.push(`- ${r.relativePath ?? r.name} (${r.type}, weight: ${r.weight.toFixed(2)})`)
    }
  }

  // ── Context summary ───────────────────────────────────────
  sections.push(`\n### Memory summary`)
  sections.push(memCtx.contextSummary)
  sections.push(`Graph nodes in repo: ${graphCtx.nodeCount}`)

  if (!memCtx.hasContext) {
    sections.push('\nNo memory recorded for this file yet. This is the first session on it.')
  }

  return textResult(sections.join('\n'))
}

// ============================================================
// TOOL 2 — get_related_files
// ============================================================

function handleGetRelatedFiles(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  graph: GraphEngine
): ToolResult {
  const relativePath = args['relative_path'] as string
  const maxHops = Math.min(2, (args['max_hops'] as number) ?? 2)
  const limit = Math.min(15, (args['limit'] as number) ?? 8)

  if (!relativePath) return errorResult('relative_path is required')

  const fileEntities = graph.getFileEntities(relativePath)
  const fileEntity = fileEntities.find(e => e.type === 'file')

  if (!fileEntity) {
    return textResult(`No graph entity found for: ${relativePath}\nThis file may not have been indexed yet. It will be indexed when opened during an active session.`)
  }

  const traversal = graph.getRelatedFiles(fileEntity.id, maxHops, limit)

  if (!traversal || traversal.nodes.length === 0) {
    return textResult(`No related files found for: ${relativePath}`)
  }

  const lines = [
    `## Related files for: ${relativePath}`,
    `Traversal: ${maxHops} hops | ${traversal.nodes.length} results | ${traversal.traversalMs}ms`,
    '',
  ]

  for (const node of traversal.nodes) {
    const e = node.entity
    lines.push(`- [depth:${node.depth}] ${e.relativePath ?? e.name} (${e.type}, weight: ${e.weight.toFixed(2)})`)
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// TOOL 3 — get_dependencies
// ============================================================

function handleGetDependencies(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  graph: GraphEngine,
  memory: MemoryCoordinator
): ToolResult {
  const relativePath = args['relative_path'] as string
  if (!relativePath) return errorResult('relative_path is required')

  const fileEntities = graph.getFileEntities(relativePath)
  const fileEntity = fileEntities.find(e => e.type === 'file')

  if (!fileEntity) {
    return textResult(`No graph entity found for: ${relativePath}`)
  }

  const deps = graph.getDependencies(fileEntity.id)
  if (!deps) return textResult(`No dependency data for: ${relativePath}`)

  const lines = [`## Dependencies for: ${relativePath}`, '']

  if (deps.imports.length > 0) {
    lines.push('### Imports (this file depends on)')
    for (const d of deps.imports) lines.push(`- ${d.name}`)
    lines.push('')
  }

  if (deps.importedBy.length > 0) {
    lines.push('### Imported by (these files depend on this one)')
    for (const d of deps.importedBy) lines.push(`- ${d.relativePath ?? d.name}`)
    lines.push('')
  }

  if (deps.calls.length > 0) {
    lines.push('### Calls')
    for (const d of deps.calls.slice(0, 8)) lines.push(`- ${d.name}`)
    lines.push('')
  }

  if (deps.calledBy.length > 0) {
    lines.push('### Called by')
    for (const d of deps.calledBy.slice(0, 8)) lines.push(`- ${d.relativePath ?? d.name}`)
  }

  if (deps.imports.length === 0 && deps.importedBy.length === 0) {
    lines.push('No dependency relationships recorded yet.')
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// TOOL 4 — get_open_questions
// ============================================================

function handleGetOpenQuestions(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  memory: MemoryCoordinator
): ToolResult {
  const relativePath = args['relative_path'] as string | undefined
  const limit = Math.min(20, (args['limit'] as number) ?? 10)

  let questions: import('../../../core/memory/src/index.js').MemoryNode[]

  if (relativePath) {
    const entityId = makeEntityId('file', ctx.repoId, relativePath)
    const ctx_ = memory.assembleFileContext(entityId)
    questions = ctx_.openQuestions.slice(0, limit)
  } else {
    // Search all session memories for question markers
    questions = memory.search('unresolved', limit / 2)
      .concat(memory.search('open question', limit / 2))
      .concat(memory.search('TODO', limit / 2))
      .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
      .slice(0, limit)
  }

  if (questions.length === 0) {
    return textResult('No open questions recorded. Good state — nothing pending.')
  }

  const lines = [`## Open questions${relativePath ? ` in ${relativePath}` : ' across repository'}`, '']

  for (const q of questions) {
    const age = msToHuman(Date.now() - q.createdAt)
    lines.push(`- [${age} ago, weight: ${q.weight.toFixed(2)}] ${q.content}`)
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// TOOL 5 — search_memories
// ============================================================

function handleSearchMemories(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  memory: MemoryCoordinator
): ToolResult {
  const query = args['query'] as string
  const limit = Math.min(20, (args['limit'] as number) ?? 10)

  if (!query) return errorResult('query is required')

  const results = memory.search(query, limit)

  if (results.length === 0) {
    return textResult(`No memories found for query: "${query}"`)
  }

  const lines = [`## Memory search: "${query}"`, `${results.length} results`, '']

  for (const m of results) {
    const typeLabel = m.isCorrection ? 'CORRECTION' : m.type.toUpperCase()
    const age = msToHuman(Date.now() - m.createdAt)
    lines.push(`### [${typeLabel}] weight: ${m.weight.toFixed(2)} | ${age} ago`)
    lines.push(m.content)
    lines.push('')
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// TOOL 6 — get_corrections
// ============================================================

function handleGetCorrections(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  memory: MemoryCoordinator
): ToolResult {
  const relativePath = args['relative_path'] as string | undefined

  const allCorrections = memory.search('correction', 50)
    .filter(m => m.isCorrection)

  const filtered = relativePath
    ? allCorrections.filter(m => m.content.includes(relativePath))
    : allCorrections

  if (filtered.length === 0) {
    return textResult('No corrections recorded yet.')
  }

  const lines = [
    `## Human corrections${relativePath ? ` for ${relativePath}` : ''}`,
    'These represent the highest-trust memories — human overrides that never decay.',
    '',
  ]

  for (const c of filtered) {
    const age = msToHuman(Date.now() - c.createdAt)
    lines.push(`- [${age} ago] ${c.content}`)
    if (c.correctsId) {
      lines.push(`  (supersedes memory: ${c.correctsId.slice(0, 8)}...)`)
    }
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// TOOL 7 — get_repo_context
// Session start context — the WHY behind the codebase
// ============================================================

function handleGetRepoContext(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  graph: GraphEngine,
  memory: MemoryCoordinator
): ToolResult {
  const includeFlags = (args['include_flags'] ?? true) as boolean

  const lines = ['## BanyanTree Repository Context', '']

  // ── Seed document (project doctrine) ─────────────────────
  const seedDoc = ctx.db.prepare(
    "SELECT value FROM doctrine WHERE repo_id = ? AND key = 'seed'"
  ).get(ctx.repoId) as { value: string } | undefined

  if (seedDoc) {
    lines.push('### Project doctrine (seed document)')
    lines.push(seedDoc.value.slice(0, 1000))  // cap length
    lines.push('')
  }

  // ── Top memories across repo ──────────────────────────────
  const topMemories = memory.getRepoContext(10)

  if (topMemories.length > 0) {
    const corrections = topMemories.filter(m => m.isCorrection)
    const structural = topMemories.filter(m => m.type === 'structural' && !m.isCorrection)
    const sessions = topMemories.filter(m => m.type === 'session')

    if (corrections.length > 0) {
      lines.push('### Active corrections (human overrides)')
      for (const c of corrections) lines.push(`- ${c.content}`)
      lines.push('')
    }

    if (structural.length > 0) {
      lines.push('### Architectural decisions')
      for (const m of structural) lines.push(`- [${m.weight.toFixed(2)}] ${m.content}`)
      lines.push('')
    }

    if (sessions.length > 0) {
      lines.push('### Recent session notes')
      for (const m of sessions.slice(0, 3)) {
        const age = msToHuman(Date.now() - m.createdAt)
        lines.push(`- [${age} ago] ${m.content}`)
      }
      lines.push('')
    }
  } else {
    lines.push('No memories recorded yet. This may be the first session.')
    lines.push('')
  }

  // ── Graph stats ───────────────────────────────────────────
  const health = graph.checkIntegrity()
  lines.push('### Graph state')
  lines.push(`Nodes: ${health.nodeCount} | Edges: ${health.edgeCount} | Healthy: ${health.healthy}`)
  lines.push('')

  // ── Active flags ──────────────────────────────────────────
  if (includeFlags) {
    const flags = ctx.db.prepare(`
      SELECT * FROM agent_flags
      WHERE repo_id = ? AND acknowledged = 0
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
      LIMIT 5
    `).all(ctx.repoId, Date.now()) as Array<{
      severity: string; title: string; detail: string | null
    }>

    if (flags.length > 0) {
      lines.push('### Active alerts')
      for (const f of flags) {
        lines.push(`- [${f.severity.toUpperCase()}] ${f.title}${f.detail ? ': ' + f.detail : ''}`)
      }
      lines.push('')
    }
  }

  // ── Top entities ──────────────────────────────────────────
  const top = graph.getTopEntities(5)
  if (top.length > 0) {
    lines.push('### Highest-weight graph entities')
    for (const e of top) {
      lines.push(`- ${e.relativePath ?? e.name} (${e.type}, weight: ${e.weight.toFixed(2)})`)
    }
  }

  return textResult(lines.join('\n'))
}

// ============================================================
// HELPERS
// ============================================================

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `[BANYAN ERROR] ${message}` }],
    isError: true,
  }
}

function msToHuman(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

function logToolCall(
  db: Database.Database,
  repoId: string,
  toolName: string,
  args: Record<string, unknown>
): void {
  try {
    db.prepare(`
      INSERT INTO events (id, repo_id, type, actor, payload, created_at)
      VALUES (?, ?, 'mcp_tool_call', 'claude', ?, ?)
    `).run(
      uuid(),
      repoId,
      JSON.stringify({ tool: toolName, args }),
      Date.now()
    )
  } catch {
    // Non-fatal — logging never blocks tool execution
  }
}

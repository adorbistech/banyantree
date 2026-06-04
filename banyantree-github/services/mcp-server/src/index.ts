#!/usr/bin/env node
/**
 * BanyanTree MCP Server
 *
 * Block 7. The final block. The cognitive loop closes here.
 *
 * After this file, the full loop is operational:
 * 1. Developer works → file watcher observes
 * 2. Parser extracts structure → graph engine stores entities
 * 3. Memory engine accumulates session signals
 * 4. Developer opens a file → Claude calls get_file_context()
 * 5. MCP server returns full cognition packet
 * 6. Claude responds with context it was never explicitly given
 * 7. The aha moment happens
 *
 * Transport: stdio (standard MCP protocol)
 * This is what Claude Code and Cursor connect to.
 *
 * Security: read-only tools only. No filesystem access.
 * Every tool call logged to security audit trail.
 *
 * From AI_BOUNDARIES.md:
 * "AI cannot write, delete, or mutate anything."
 * "Everything flows through policy → graph → memory → curated retrieval."
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { BANYAN_TOOLS } from './tools.js'
import { handleToolCall } from './handlers.js'
import { loadConfig } from '../../apps/desktop-runtime/src/config.js'

const VERSION = '0.1.0'
const SERVER_NAME = 'banyantree'

// ============================================================
// STARTUP
// ============================================================

async function main(): Promise<void> {
  const config = await loadConfig()

  if (!config.activeRepo) {
    process.stderr.write(
      '[BANYAN MCP] No active repository configured.\n' +
      "[BANYAN MCP] Run 'banyan init <path>' first.\n"
    )
    process.exit(1)
  }

  if (!existsSync(config.dbPath)) {
    process.stderr.write(
      `[BANYAN MCP] Database not found: ${config.dbPath}\n` +
      "[BANYAN MCP] Run 'banyan init <path>' to initialise.\n"
    )
    process.exit(1)
  }

  // Open database (read-write for audit logging, read-only for data)
  const db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  // Get repo ID from the database
  const repoRow = db.prepare(
    "SELECT id FROM repositories WHERE path = ? AND status = 'active'"
  ).get(config.activeRepo) as { id: string } | undefined

  if (!repoRow) {
    process.stderr.write(
      `[BANYAN MCP] Repository not registered: ${config.activeRepo}\n` +
      "[BANYAN MCP] Run 'banyan init <path>' to register it.\n"
    )
    process.exit(1)
  }

  const toolCtx = {
    repoId: repoRow.id,
    repoRoot: config.activeRepo,
    db,
    sessionId: null as string | null,
  }

  process.stderr.write(
    `[BANYAN MCP] v${VERSION} starting\n` +
    `[BANYAN MCP] Repository: ${config.activeRepo}\n` +
    `[BANYAN MCP] Transport: stdio\n` +
    `[BANYAN MCP] Tools: ${BANYAN_TOOLS.length}\n`
  )

  // ============================================================
  // MCP SERVER
  // ============================================================

  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } }
  )

  // ── List tools ──────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: BANYAN_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }
  })

  // ── Call tool ───────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    process.stderr.write(`[BANYAN MCP] Tool called: ${name}\n`)

    const result = await handleToolCall(
      name,
      (args ?? {}) as Record<string, unknown>,
      toolCtx
    )

    return result
  })

  // ── Transport ───────────────────────────────────────────────
  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.stderr.write('[BANYAN MCP] Connected. Ready for Claude.\n')

  // Graceful shutdown
  process.on('SIGINT', () => {
    process.stderr.write('[BANYAN MCP] Shutting down.\n')
    db.close()
    process.exit(0)
  })
}

main().catch((err) => {
  process.stderr.write(`[BANYAN MCP] Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

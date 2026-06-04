#!/usr/bin/env node
/**
 * BanyanTree MCP Server — Block 7
 * Secure cognition exposure layer for Claude.
 * Read-only tools only. No filesystem access.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import Database from 'better-sqlite3'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'
import { BANYAN_TOOLS } from './tools.js'
import { handleToolCall } from './handlers.js'

const VERSION = '0.1.0'
const SERVER_NAME = 'banyantree'

// ── Inline config loading (avoids cross-package import path issues) ──
function getDataDir(): string {
  const os = platform()
  if (os === 'win32') {
    return join(process.env['PROGRAMDATA'] ?? 'C:\\ProgramData', 'Adorbis', 'BanyanTree')
  }
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'BanyanTree')
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'banyantree')
}

function loadConfig() {
  const dataDir = getDataDir()
  const configPath = join(dataDir, 'config.json')
  if (!existsSync(configPath)) {
    return { activeRepo: null, dbPath: join(dataDir, 'cognition.db'), mcpPort: 7842 }
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return { activeRepo: null, dbPath: join(dataDir, 'cognition.db'), mcpPort: 7842 }
  }
}

// ── Startup ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const config = loadConfig()

  if (!config.activeRepo) {
    process.stderr.write('[BANYAN MCP] No active repository. Run banyan init <path> first.\n')
    process.exit(1)
  }

  if (!existsSync(config.dbPath)) {
    process.stderr.write(`[BANYAN MCP] Database not found: ${config.dbPath}\n`)
    process.stderr.write('[BANYAN MCP] Run banyan init <path> to initialise.\n')
    process.exit(1)
  }

  const db = new Database(config.dbPath) as any
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Get or create repo record
  let repoRow = db.prepare(
    "SELECT id FROM repositories WHERE path = ? AND status = 'active'"
  ).get(config.activeRepo) as { id: string } | undefined

  if (!repoRow) {
    // Auto-register repo if not in DB yet
    const { v4: uuidv4 } = await import('uuid')
    const repoId = uuidv4()
    db.prepare(`
      INSERT OR IGNORE INTO repositories (id, path, name, status, created_at, last_active, node_count)
      VALUES (?, ?, ?, 'active', ?, ?, 0)
    `).run(repoId, config.activeRepo, config.activeRepo.split(/[/\\]/).pop(), Date.now(), Date.now())
    repoRow = { id: repoId }
  }

  const toolCtx = {
    repoId: repoRow.id,
    repoRoot: config.activeRepo,
    db,
    sessionId: null as string | null,
  }

  process.stderr.write(`[BANYAN MCP] v${VERSION} starting\n`)
  process.stderr.write(`[BANYAN MCP] Repository: ${config.activeRepo}\n`)
  process.stderr.write(`[BANYAN MCP] Transport: stdio\n`)
  process.stderr.write(`[BANYAN MCP] Tools: ${BANYAN_TOOLS.length}\n`)

  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: BANYAN_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, (async (request: any) => {
    const { name, arguments: args } = request.params
    process.stderr.write(`[BANYAN MCP] Tool: ${name}\n`)
    return await handleToolCall(name, (args ?? {}) as Record<string, unknown>, toolCtx)
  }) as any)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.stderr.write('[BANYAN MCP] Connected. Ready for Claude.\n')

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

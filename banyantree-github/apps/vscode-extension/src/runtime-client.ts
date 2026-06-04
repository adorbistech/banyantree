/**
 * BanyanTree Runtime Client
 *
 * The VS Code extension reads the BanyanTree SQLite database directly.
 * No network calls. No HTTP server. Direct file read.
 *
 * Performance budget: memory retrieval < 200ms (performance-budget.md)
 *
 * Why direct SQLite instead of a local HTTP server:
 * - Faster (no serialisation overhead)
 * - Simpler (no server process needed for reads)
 * - More reliable (no port conflicts, no connection management)
 * - Works offline (reads even if daemon is not running)
 * - Trust: developer can inspect the database directly
 *
 * The daemon writes. The extension reads.
 * SQLite WAL mode allows concurrent read + write safely.
 */

import * as vscode from 'vscode'
import { join } from 'path'
import { existsSync } from 'fs'
import { homedir, platform } from 'os'

type StatusCallback = (status: 'connected' | 'disconnected') => void

export interface FileContext {
  file: {
    relativePath: string
    weight: number
    language: string
  } | null
  memories: Array<{
    id: string
    type: string
    content: string
    weight: number
    isCorrection: boolean
    createdAt: number
  }>
  corrections: Array<{
    id: string
    content: string
    createdAt: number
  }>
  openQuestions: Array<{
    id: string
    content: string
    weight: number
  }>
  flags: Array<{
    id: string
    severity: string
    title: string
    detail: string | null
  }>
  relatedFiles: Array<{
    name: string
    relativePath: string | null
    weight: number
  }>
  hasContext: boolean
  nodeCount: number
}

export class RuntimeClient {
  private context: vscode.ExtensionContext
  private db: any   // better-sqlite3 Database
  private repoId: string | null = null
  private statusCallbacks: StatusCallback[] = []
  private connected = false

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  // ============================================================
  // CONNECTION
  // ============================================================

  async connect(): Promise<void> {
    const dbPath = this.getDbPath()

    if (!dbPath || !existsSync(dbPath)) {
      this.setStatus('disconnected')
      return
    }

    try {
      // Lazy import — better-sqlite3 is a native module
      const Database = require('better-sqlite3')
      this.db = new Database(dbPath, { readonly: true })
      this.db.pragma('journal_mode = WAL')

      // Get active repository ID
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (workspaceRoot) {
        const row = this.db.prepare(
          "SELECT id FROM repositories WHERE path = ? AND status = 'active'"
        ).get(workspaceRoot) as { id: string } | undefined

        if (row) {
          this.repoId = row.id
          this.setStatus('connected')
        } else {
          this.setStatus('disconnected')
        }
      }
    } catch {
      this.setStatus('disconnected')
    }
  }

  disconnect(): void {
    try { this.db?.close() } catch {}
    this.db = null
    this.repoId = null
    this.setStatus('disconnected')
  }

  // ============================================================
  // FILE CONTEXT QUERY
  // The aha moment data source
  // Performance budget: < 200ms
  // ============================================================

  async getFileContext(relativePath: string): Promise<FileContext | null> {
    if (!this.db || !this.repoId) return null

    const start = Date.now()
    const minWeight = vscode.workspace
      .getConfiguration('banyantree')
      .get<number>('minWeightToShow', 0.3)

    try {
      // File entity
      const fileEntity = this.db.prepare(`
        SELECT id, name, weight, metadata FROM entities
        WHERE repo_id = ? AND path LIKE ? AND type = 'file' AND status = 'active'
        LIMIT 1
      `).get(this.repoId, `%${relativePath}%`) as {
        id: string; name: string; weight: number; metadata: string
      } | undefined

      const entityId = fileEntity?.id

      // Memories for this file
      const memories = entityId ? this.db.prepare(`
        SELECT id, type, content, weight, is_correction, created_at
        FROM memories
        WHERE entity_id = ? AND status = 'active' AND weight >= ?
        ORDER BY is_correction DESC, weight DESC
        LIMIT 15
      `).all(entityId, minWeight) as Array<{
        id: string; type: string; content: string;
        weight: number; is_correction: number; created_at: number
      }> : []

      // Active flags for this file
      const flags = this.db.prepare(`
        SELECT id, severity, title, detail FROM agent_flags
        WHERE repo_id = ? AND acknowledged = 0
          AND (entity_ids LIKE ? OR entity_ids IS NULL)
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
        LIMIT 5
      `).all(this.repoId, `%${entityId ?? 'NONE'}%`, Date.now()) as Array<{
        id: string; severity: string; title: string; detail: string | null
      }>

      // Related files (1-hop only for speed)
      const related = entityId ? this.db.prepare(`
        SELECT e.name, e.path, e.weight
        FROM entities e
        JOIN relationships r ON (r.to_id = e.id OR r.from_id = e.id)
        WHERE (r.from_id = ? OR r.to_id = ?)
          AND e.id != ?
          AND e.type = 'file'
          AND e.status = 'active'
          AND r.status = 'active'
        ORDER BY e.weight DESC
        LIMIT 6
      `).all(entityId, entityId, entityId) as Array<{
        name: string; path: string | null; weight: number
      }> : []

      // Node count
      const nodeCount = (this.db.prepare(
        "SELECT COUNT(*) as n FROM entities WHERE repo_id = ? AND status = 'active'"
      ).get(this.repoId) as { n: number }).n

      const elapsed = Date.now() - start
      if (elapsed > 200) {
        console.warn(`[BanyanTree] Slow context query: ${relativePath} took ${elapsed}ms`)
      }

      const corrections = memories
        .filter(m => m.is_correction === 1)
        .map(m => ({ id: m.id, content: m.content, createdAt: m.created_at }))

      const openQuestions = memories
        .filter(m => m.is_correction === 0 &&
          (m.content.includes('?') || m.content.toLowerCase().includes('unresolved') ||
           m.content.toLowerCase().includes('todo')))
        .map(m => ({ id: m.id, content: m.content, weight: m.weight }))

      const fileMeta = fileEntity?.metadata
        ? JSON.parse(fileEntity.metadata)
        : {}

      return {
        file: fileEntity ? {
          relativePath,
          weight: fileEntity.weight,
          language: fileMeta['language'] ?? 'unknown',
        } : null,
        memories: memories.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          weight: m.weight,
          isCorrection: m.is_correction === 1,
          createdAt: m.created_at,
        })),
        corrections,
        openQuestions,
        flags,
        relatedFiles: related.map(r => ({
          name: r.name,
          relativePath: r.path,
          weight: r.weight,
        })),
        hasContext: memories.length > 0,
        nodeCount,
      }

    } catch (err) {
      console.error('[BanyanTree] Context query error:', err)
      return null
    }
  }

  // ============================================================
  // MEMORY WRITE OPERATIONS
  // These go through the runtime daemon via the events table
  // The daemon processes them and writes to memories table
  // ============================================================

  async writeMemorySignal(
    type: 'remember' | 'correct' | 'forget',
    entityId: string | null,
    content: string,
    memoryId?: string
  ): Promise<boolean> {
    if (!this.db || !this.repoId) return false

    try {
      // Write a signal event — the runtime daemon picks this up
      // and creates the actual memory node
      // This preserves the read-only nature of the extension's DB connection
      const writeDb = require('better-sqlite3')(this.getDbPath()!)
      writeDb.prepare(`
        INSERT INTO events (id, repo_id, type, actor, entity_id, memory_id, payload, created_at)
        VALUES (?, ?, ?, 'human', ?, ?, ?, ?)
      `).run(
        require('uuid').v4(),
        this.repoId,
        `vscode_${type}_signal`,
        entityId,
        memoryId ?? null,
        JSON.stringify({ content, type }),
        Date.now()
      )
      writeDb.close()
      return true
    } catch {
      return false
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb)
  }

  isConnected(): boolean {
    return this.connected
  }

  getRepoId(): string | null {
    return this.repoId
  }

  private setStatus(status: 'connected' | 'disconnected'): void {
    this.connected = status === 'connected'
    this.statusCallbacks.forEach(cb => cb(status))
  }

  private getDbPath(): string | null {
    const os = platform()
    let dataDir: string

    if (os === 'win32') {
      dataDir = join(process.env['PROGRAMDATA'] ?? 'C:\\ProgramData', 'Adorbis', 'BanyanTree')
    } else if (os === 'darwin') {
      dataDir = join(homedir(), 'Library', 'Application Support', 'BanyanTree')
    } else {
      dataDir = join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'banyantree')
    }

    return join(dataDir, 'cognition.db')
  }
}

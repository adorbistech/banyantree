/**
 * BanyanTree File Watcher
 *
 * Security rule R3: File access is explicit and repo-scoped only.
 * This watcher ONLY watches the path given to it via banyan init.
 * It never crawls home directories, system folders, or unrelated repos.
 *
 * Uses chokidar for cross-platform file watching.
 * Performance budget: AST parse on save < 100ms
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { extname, relative } from 'path'
import { RuntimeLogger } from './logger.js'
import { type EventBus } from './event-bus.js'

// File extensions that BanyanTree indexes (cognitive relevance filter)
// Not every file — only files that could carry architectural meaning
const INDEXED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs',
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.sql', '.graphql', '.gql',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx',
])

// Directories never watched — reduces noise and AV suspicion
const IGNORED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/target/**',       // Rust
  '**/.gradle/**',      // Java
  '**/vendor/**',       // Go
]

export class FileWatcher {
  private repoPath: string
  private bus: EventBus
  private watcher: FSWatcher | null = null
  private log: RuntimeLogger

  constructor(repoPath: string, bus: EventBus) {
    this.repoPath = repoPath
    this.bus = bus
    this.log = new RuntimeLogger('filewatcher')
  }

  async start(): Promise<void> {
    this.log.info(`Watching: ${this.repoPath}`)

    this.watcher = chokidar.watch(this.repoPath, {
      ignored: IGNORED_DIRS,
      persistent: true,
      ignoreInitial: true,          // don't fire for existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 150,    // wait 150ms after last write before firing
        pollInterval: 50,
      },
      usePolling: false,            // native events — polling only as fallback
    })

    this.watcher
      .on('change', (path) => this.onFileChanged(path))
      .on('add', (path) => this.onFileCreated(path))
      .on('unlink', (path) => this.onFileDeleted(path))
      .on('error', (err) => this.log.error('Watcher error:', err))

    this.log.debug('File watcher active.')
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      this.log.debug('File watcher stopped.')
    }
  }

  // --------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------

  private onFileChanged(filePath: string): void {
    if (!this.shouldIndex(filePath)) return

    const relativePath = relative(this.repoPath, filePath)
    this.log.debug(`Changed: ${relativePath}`)

    this.bus.emit('file:changed', {
      absolutePath: filePath,
      relativePath,
      extension: extname(filePath),
      timestamp: Date.now(),
    }, 'filewatcher')
  }

  private onFileCreated(filePath: string): void {
    if (!this.shouldIndex(filePath)) return

    const relativePath = relative(this.repoPath, filePath)
    this.log.debug(`Created: ${relativePath}`)

    this.bus.emit('file:created', {
      absolutePath: filePath,
      relativePath,
      extension: extname(filePath),
      timestamp: Date.now(),
    }, 'filewatcher')
  }

  private onFileDeleted(filePath: string): void {
    if (!this.shouldIndex(filePath)) return

    const relativePath = relative(this.repoPath, filePath)
    this.log.debug(`Deleted: ${relativePath}`)

    this.bus.emit('file:deleted', {
      absolutePath: filePath,
      relativePath,
      timestamp: Date.now(),
    }, 'filewatcher')
  }

  // --------------------------------------------------------
  // COGNITIVE RELEVANCE FILTER
  // Only index files that could carry architectural meaning.
  // Not every file becomes a node. (graph-governance.md rule)
  // --------------------------------------------------------

  private shouldIndex(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return INDEXED_EXTENSIONS.has(ext)
  }
}

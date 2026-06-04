/**
 * BanyanTree Runtime Config
 *
 * Cross-platform data paths (from PLATFORM_RUNTIME_AND_CLI.md):
 *   Windows : C:\ProgramData\Adorbis\BanyanTree\
 *   macOS   : ~/Library/Application Support/BanyanTree/
 *   Linux   : ~/.config/banyantree/
 *
 * Config is a plain JSON file. No proprietary formats.
 * Developer always controls: retention, deletion, export.
 */

import { platform, homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

export interface RuntimeConfig {
  version: string
  activeRepo: string | null
  approvedRepos: string[]           // explicit opt-in only — never crawl unrelated dirs
  dbPath: string
  logPath: string
  mcpPort: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  cloudModels: {
    enabled: boolean                // off by default — local-first
    provider: string | null
    apiKeyEnvVar: string | null
  }
  limits: {
    maxNodesPerRepo: number
    maxEdgesPerNode: number
    maxDbSizeMb: number
  }
}

// ============================================================
// PLATFORM DATA DIRECTORY
// ============================================================

export function getDataDir(): string {
  const os = platform()

  if (os === 'win32') {
    const programData = process.env['PROGRAMDATA'] ?? 'C:\\ProgramData'
    return join(programData, 'Adorbis', 'BanyanTree')
  }

  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'BanyanTree')
  }

  // Linux / other POSIX
  const xdgConfig = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  return join(xdgConfig, 'banyantree')
}

export function getConfigPath(): string {
  return join(getDataDir(), 'config.json')
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

function defaultConfig(): RuntimeConfig {
  const dataDir = getDataDir()
  return {
    version: '0.1.0',
    activeRepo: null,
    approvedRepos: [],
    dbPath: join(dataDir, 'cognition.db'),
    logPath: join(dataDir, 'logs'),
    mcpPort: 7842,
    logLevel: 'info',
    cloudModels: {
      enabled: false,               // local-first: cloud is always opt-in
      provider: null,
      apiKeyEnvVar: null,
    },
    limits: {
      maxNodesPerRepo: 500,
      maxEdgesPerNode: 20,
      maxDbSizeMb: 50,
    },
  }
}

// ============================================================
// LOAD / SAVE
// ============================================================

export async function loadConfig(): Promise<RuntimeConfig> {
  const dataDir = getDataDir()
  const configPath = getConfigPath()

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  if (!existsSync(configPath)) {
    const config = defaultConfig()
    saveConfig(config)
    return config
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>
    // Merge with defaults to handle new keys added in updates
    return { ...defaultConfig(), ...parsed }
  } catch {
    // Corrupted config — reset to default
    const config = defaultConfig()
    saveConfig(config)
    return config
  }
}

export function saveConfig(config: RuntimeConfig): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

export function updateConfig(updates: Partial<RuntimeConfig>): RuntimeConfig {
  const raw = readFileSync(getConfigPath(), 'utf8')
  const current = JSON.parse(raw) as RuntimeConfig
  const updated = { ...current, ...updates }
  saveConfig(updated)
  return updated
}

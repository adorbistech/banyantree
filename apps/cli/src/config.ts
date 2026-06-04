/**
 * CLI Config — delegates to the shared runtime config module
 * The single source of config truth lives in desktop-runtime.
 */
import { platform, homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

export interface RuntimeConfig {
  version: string
  activeRepo: string | null
  approvedRepos: string[]
  dbPath: string
  logPath: string
  mcpPort: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  cloudModels: { enabled: boolean; provider: string | null; apiKeyEnvVar: string | null }
  limits: { maxNodesPerRepo: number; maxEdgesPerNode: number; maxDbSizeMb: number }
}

export function getDataDir(): string {
  const os = platform()
  if (os === 'win32') {
    return join(process.env['PROGRAMDATA'] ?? 'C:\\ProgramData', 'Adorbis', 'BanyanTree')
  }
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'BanyanTree')
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'banyantree')
}

function defaultConfig(): RuntimeConfig {
  const dataDir = getDataDir()
  return {
    version: '0.1.0', activeRepo: null, approvedRepos: [],
    dbPath: join(dataDir, 'cognition.db'),
    logPath: join(dataDir, 'logs'),
    mcpPort: 7842, logLevel: 'info',
    cloudModels: { enabled: false, provider: null, apiKeyEnvVar: null },
    limits: { maxNodesPerRepo: 500, maxEdgesPerNode: 20, maxDbSizeMb: 50 },
  }
}

export async function loadConfig(): Promise<RuntimeConfig> {
  const dataDir = getDataDir()
  const configPath = join(dataDir, 'config.json')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(configPath)) { const c = defaultConfig(); saveConfig(c); return c }
  try { return { ...defaultConfig(), ...JSON.parse(readFileSync(configPath, 'utf8')) } }
  catch { const c = defaultConfig(); saveConfig(c); return c }
}

export function saveConfig(config: RuntimeConfig): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8')
}

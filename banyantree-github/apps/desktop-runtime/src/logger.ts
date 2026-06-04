/**
 * BanyanTree Runtime Logger
 *
 * Output style from PLATFORM_RUNTIME_AND_CLI.md:
 * [BANYAN] Runtime active
 * [BANYAN] Repository graph healthy
 *
 * Rules:
 * - No emojis
 * - No AI personality
 * - No playful output
 * - Infrastructure-grade, operational, low-noise
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
}

export class RuntimeLogger {
  private component: string
  private minLevel: LogLevel

  constructor(component: string, minLevel: LogLevel = 'info') {
    this.component = component.toUpperCase()
    this.minLevel = process.env.BANYAN_DEBUG === '1' ? 'debug' : minLevel
  }

  private format(level: LogLevel, message: string, ...args: unknown[]): string {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const tag = `[BANYAN:${this.component}]`
    const extra = args.length > 0
      ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      : ''
    return `${ts} ${tag} ${message}${extra}`
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel]
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      process.stdout.write(this.format('debug', message, ...args) + '\n')
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      process.stdout.write(this.format('info', message, ...args) + '\n')
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      process.stderr.write(this.format('warn', message, ...args) + '\n')
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      process.stderr.write(this.format('error', message, ...args) + '\n')
    }
  }
}

// Convenience factory
export function createLogger(component: string): RuntimeLogger {
  return new RuntimeLogger(component)
}

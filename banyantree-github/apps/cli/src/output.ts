/**
 * BanyanTree CLI Output
 *
 * All output follows the infrastructure style from PLATFORM_RUNTIME_AND_CLI.md:
 * [BANYAN] Runtime active
 * [BANYAN] Repository graph healthy
 *
 * No emojis. No AI personality. No playful output.
 * Operational, low-noise, enterprise-safe.
 */

const PREFIX = '[BANYAN]'
const PREFIX_OK  = '[BANYAN OK]'
const PREFIX_ERR = '[BANYAN ERR]'
const PREFIX_STEP = '[BANYAN] ...'

export function print(message: string): void {
  process.stdout.write(`${PREFIX} ${message}\n`)
}

export function printSuccess(message: string): void {
  process.stdout.write(`${PREFIX_OK} ${message}\n`)
}

export function printError(message: string): void {
  process.stderr.write(`${PREFIX_ERR} ${message}\n`)
}

export function printStep(message: string): void {
  process.stdout.write(`${PREFIX_STEP} ${message}\n`)
}

export function printRaw(message: string): void {
  process.stdout.write(message + '\n')
}

export function printTable(
  headers: string[],
  rows: string[][],
  colWidths?: number[]
): void {
  const widths = colWidths ?? headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => (r[i] ?? '').length))
    return Math.max(h.length, maxRow)
  })

  const divider = widths.map(w => '-'.repeat(w)).join('-+-')
  const headerRow = headers.map((h, i) => h.padEnd(widths[i] ?? h.length)).join(' | ')

  printRaw('')
  printRaw(`  ${headerRow}`)
  printRaw(`  ${divider}`)
  for (const row of rows) {
    const line = row.map((c, i) => (c ?? '').padEnd(widths[i] ?? c.length)).join(' | ')
    printRaw(`  ${line}`)
  }
  printRaw('')
}

export function printSection(title: string): void {
  printRaw('')
  printRaw(`  ${title}`)
  printRaw(`  ${'─'.repeat(title.length)}`)
}

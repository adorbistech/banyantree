/**
 * BanyanTree Secrets Filter
 *
 * Applied before ANY content enters the graph or gets transmitted.
 * From SECRETS_POLICY.md: BanyanTree never stores, indexes, graphs,
 * or transmits secrets.
 *
 * This runs as a synchronous gate — if it throws, the content is blocked.
 */

// Files that are never indexed — checked by path/filename
const EXCLUDED_FILENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.staging',
  '.env.development', '.env.test', '.env.example',
  'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
  'credentials.json', 'service-account.json',
  '.netrc',
])

const EXCLUDED_EXTENSIONS = new Set([
  '.pem', '.key', '.p12', '.pfx', '.crt', '.cer',
  '.secret', '.keystore',
])

const EXCLUDED_DIRECTORIES = new Set([
  '.secrets', 'secrets', 'credentials',
  'private', 'certs', '.ssh',
])

// Patterns that trigger redaction within content
// These replace the matched value with [REDACTED]
const REDACTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g,                    label: 'openai-key' },
  { pattern: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g,          label: 'bearer-token' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g,                    label: 'github-token' },
  { pattern: /github_pat_[a-zA-Z0-9_]{82}/g,            label: 'github-pat' },
  { pattern: /AKIA[A-Z0-9]{16}/g,                       label: 'aws-access-key' },
  { pattern: /[A-Z_]+=["']?[a-zA-Z0-9+/=._\-]{20,}["']?/g, label: 'env-assignment' },
  { pattern: /private[_\s]key["']?\s*[:=]\s*["'][^"']{20,}["']/gi, label: 'private-key' },
  { pattern: /password["']?\s*[:=]\s*["'][^"']{6,}["']/gi, label: 'password' },
]

export interface FilterResult {
  allowed: boolean
  reason?: string
  redacted?: boolean
  content?: string
}

// ============================================================
// PATH FILTER — called before reading any file
// ============================================================

export function isPathAllowed(filePath: string): boolean {
  const parts = filePath.split(/[/\\]/)
  const filename = parts[parts.length - 1] ?? ''
  const ext = filename.includes('.')
    ? '.' + filename.split('.').pop()!.toLowerCase()
    : ''

  // Check excluded filenames
  if (EXCLUDED_FILENAMES.has(filename) || EXCLUDED_FILENAMES.has(filename.toLowerCase())) {
    return false
  }

  // Check excluded extensions
  if (ext && EXCLUDED_EXTENSIONS.has(ext)) {
    return false
  }

  // Check excluded directories anywhere in the path
  for (const part of parts) {
    if (EXCLUDED_DIRECTORIES.has(part) || EXCLUDED_DIRECTORIES.has(part.toLowerCase())) {
      return false
    }
  }

  // .npmrc may contain auth tokens — skip
  if (filename === '.npmrc' || filename === '.yarnrc') {
    return false
  }

  return true
}

// ============================================================
// CONTENT FILTER — called before storing any content
// Redacts secret-looking values in place
// ============================================================

export function filterContent(content: string): FilterResult {
  if (!content || content.trim().length === 0) {
    return { allowed: true, content }
  }

  let filtered = content
  let redacted = false

  for (const { pattern, label } of REDACTION_PATTERNS) {
    const before = filtered
    filtered = filtered.replace(pattern, `[REDACTED:${label}]`)
    if (filtered !== before) {
      redacted = true
    }
  }

  return {
    allowed: true,
    redacted,
    content: filtered,
  }
}

// ============================================================
// STRICT MODE — for content being sent to cloud AI
// More aggressive — redacts anything that looks secret-adjacent
// ============================================================

export function filterForCloudTransmission(content: string): string {
  // Never transmit raw code blocks
  // Only semantic summaries should reach cloud models
  // This function is a last-resort safety net
  let filtered = filterContent(content).content ?? content

  // Additional aggressive patterns for cloud transmission
  const cloudPatterns = [
    /[a-f0-9]{32,64}/g,   // hex strings that could be tokens
    /[A-Za-z0-9+/]{40,}={0,2}/g,  // base64 strings
  ]

  for (const pattern of cloudPatterns) {
    filtered = filtered.replace(pattern, (match) => {
      // Only redact if it looks like it could be a credential
      // (not a git commit hash in a path, etc.)
      if (match.length > 50) return '[REDACTED:long-token]'
      return match
    })
  }

  return filtered
}

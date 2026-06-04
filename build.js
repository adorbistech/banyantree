/**
 * BanyanTree flat build script
 * Compiles all TypeScript source files together as one project.
 * This avoids cross-package import resolution issues in Phase 1.
 * Usage: node build.js
 */
const { execSync } = require('child_process')
const { existsSync, mkdirSync } = require('fs')
const { join } = require('path')

const root = __dirname

console.log('[BANYAN] Starting flat build...')

// Ensure all dist directories exist
const distDirs = [
  'core/storage/dist',
  'core/graph/dist', 
  'core/memory/dist',
  'core/security/dist',
  'services/parser/dist',
  'services/mcp-server/dist',
  'services/indexer/dist',
  'apps/desktop-runtime/dist',
  'apps/cli/dist',
]

for (const dir of distDirs) {
  const full = join(root, dir)
  if (!existsSync(full)) {
    mkdirSync(full, { recursive: true })
    console.log(`[BANYAN] Created: ${dir}`)
  }
}

// Create a combined tsconfig that includes all source files
const combinedTsConfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    lib: ['ES2022'],
    strict: false,          // relaxed for first build
    declaration: true,
    sourceMap: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: './dist-flat',
    rootDir: '.',
  },
  include: [
    'core/*/src/**/*.ts',
    'services/*/src/**/*.ts',
    'apps/desktop-runtime/src/**/*.ts',
    'apps/cli/src/**/*.ts',
  ],
  exclude: ['node_modules', 'dist', 'dist-flat'],
}

const fs = require('fs')
fs.writeFileSync(
  join(root, 'tsconfig.build.json'),
  JSON.stringify(combinedTsConfig, null, 2)
)

console.log('[BANYAN] Compiling...')
try {
  execSync('npx tsc --project tsconfig.build.json', { 
    cwd: root, 
    stdio: 'inherit' 
  })
  console.log('[BANYAN OK] Build complete.')
} catch (err) {
  console.log('[BANYAN] TypeScript errors above. Check and fix, then re-run.')
  process.exit(1)
}

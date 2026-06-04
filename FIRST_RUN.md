# BanyanTree — First Run Guide

This guide gets you from the zip file to a working cognition loop
in a single terminal session.

Prerequisites: Node.js >= 20, npm >= 9, VS Code >= 1.85

---

## Step 1 — Install dependencies

```bash
cd banyantree
npm install
```

This installs: better-sqlite3, tree-sitter, commander, chokidar,
the MCP SDK, and turbo. All local. Nothing cloud.

---

## Step 2 — Build all packages

```bash
npm run build
```

Turbo builds in dependency order:
  core/storage → core/graph → core/memory →
  services/parser → services/indexer →
  services/mcp-server → apps/desktop-runtime → apps/cli

If you see TypeScript errors on first build — they are path
resolution issues from cross-package imports. Fix:

```bash
# Add path aliases to tsconfig.json if needed
# Or build packages individually in order:
cd core/storage && npm run build
cd ../graph && npm run build
cd ../memory && npm run build
cd ../../services/parser && npm run build
cd ../mcp-server && npm run build
cd ../../apps/desktop-runtime && npm run build
cd ../cli && npm run build
```

---

## Step 3 — Make the CLI available globally

```bash
# macOS / Linux
npm link --workspace=@banyantree/cli
# or
ln -s $(pwd)/apps/cli/dist/index.js /usr/local/bin/banyan
chmod +x /usr/local/bin/banyan

# Windows PowerShell (run as administrator)
# Add apps/cli/dist/ to your PATH manually
```

Test it:
```bash
banyan --version
# [BANYAN] BanyanTree v0.1.0
```

---

## Step 4 — Initialise your repository

Navigate to the repository you want BanyanTree to watch:

```bash
cd /path/to/your/project
banyan init .
```

Output:
```
[BANYAN] ... Registering repository...
[BANYAN] ... Writing seed document...
[BANYAN] ... Writing repository config...
[BANYAN OK] Repository initialised: /path/to/your/project

Next steps:
  1. Edit the seed document: .banyan/seed.md
  2. Start the runtime: banyan runtime start
  3. Open VS Code in this repository.
```

---

## Step 5 — Fill in the seed document

Open `.banyan/seed.md` in any editor. Fill in:

- `name` and `description` — what the project is
- `conventions` — your coding rules (hooks only, no class components, etc.)
- `security.rules` — things Claude must always respect
- `constraints` — architectural decisions that are final

This takes 10–15 minutes. It is the highest-trust memory layer.
BanyanTree reads it at the start of every Claude session.

---

## Step 6 — Start the runtime daemon

```bash
# In a terminal you leave running (or use a process manager)
node apps/desktop-runtime/dist/index.js

# Or if you have pm2:
pm2 start apps/desktop-runtime/dist/index.js --name banyantree
```

Output:
```
2024-01-15 10:32:01 [BANYAN:RUNTIME] BanyanTree Runtime v0.1.0
2024-01-15 10:32:01 [BANYAN:RUNTIME] Platform: darwin
2024-01-15 10:32:01 [BANYAN:RUNTIME] Active repository: /path/to/your/project
2024-01-15 10:32:01 [BANYAN:RUNTIME] Event bus started.
2024-01-15 10:32:01 [BANYAN:RUNTIME] File watcher started.
2024-01-15 10:32:01 [BANYAN:RUNTIME] Session observer started.
2024-01-15 10:32:01 [BANYAN:RUNTIME] Cognition engine active.
```

---

## Step 7 — Start the MCP server

In a second terminal:

```bash
node services/mcp-server/dist/index.js
```

Output:
```
[BANYAN MCP] v0.1.0 starting
[BANYAN MCP] Repository: /path/to/your/project
[BANYAN MCP] Transport: stdio
[BANYAN MCP] Tools: 7
[BANYAN MCP] Connected. Ready for Claude.
```

---

## Step 8 — Connect Claude Code

The `.mcp.json` file in the repo root configures this automatically.
Claude Code reads it when you open the workspace.

If Claude Code does not auto-detect:
1. Open Claude Code settings
2. Add MCP server manually:
   - Command: `node`
   - Args: `/path/to/banyantree/services/mcp-server/dist/index.js`

Verify connection — in Claude Code, ask:
```
Use the get_repo_context tool.
```

Claude should return your seed document, active memories (empty on
first run), and graph state.

---

## Step 9 — Install the VS Code extension

```bash
cd apps/vscode-extension
npm run build

# Package as .vsix
npm install -g @vscode/vsce
vsce package
code --install-extension banyantree-0.1.0.vsix
```

The BanyanTree icon appears in the VS Code activity bar (left sidebar).

---

## Step 10 — The first aha moment

Open any file in your project in VS Code.

The BanyanTree memory panel shows:
- "No memory recorded yet. First session on this file."

That is correct. The graph is empty on day one.

Work normally for a session — open files, talk to Claude, write code.

Close VS Code. Open it the next day. Open the same file.

The memory panel now shows what you were working on yesterday.
Claude already knows it when you open a new session.

That is the aha moment. It compounds from here.

---

## Health check

```bash
banyan doctor
```

Output:
```
[BANYAN] Running health check...

  Health Report
  ─────────────
  Runtime         active
  Active repo     /path/to/your/project
  Approved repos  1
  Cloud models    disabled (local-first)
  Database        0.2MB of 50MB limit
  MCP port        7842
  Data directory  ~/Library/Application Support/BanyanTree

[BANYAN OK] All checks passed. Runtime healthy.
```

---

## Graph inspection

```bash
banyan graph
# [BANYAN] Graph statistics
#   Nodes         12 of 500 limit
#   Relationships 34
#   Memories      3
```

```bash
banyan inspect
# Shows all stored memory nodes with weights
```

---

## Export everything

```bash
banyan export --pretty
# Creates banyan-export-2024-01-15T10-32-01.json
# You own this. Take it anywhere.
```

---

## If something breaks

```bash
banyan safe-mode
# Disables indexing and AI connectors
# Graph read, export, repair still work

banyan validate
# Check graph integrity without changes

banyan repair
# Fix automatically-repairable issues
```

---

## What NOT to do on first run

- Do not try to index your entire repo at once
- Do not run banyan init on multiple repos simultaneously
- Do not delete `.banyan/seed.md` — it is your root doctrine
- Do not modify the SQLite database directly
- Do not run the MCP server as root

---

## The 60-day experiment starts now

From today, track these six numbers once per day (30 seconds):

1. Time to recover context after 1 week away (stopwatch)
2. Times Claude re-explained same concept this week (tally)
3. Architectural mistakes caught before commit (count)
4. Confidence returning to old code (1–10 self-rating)
5. Context recovery speed — question to answer (stopwatch)
6. Useful sidebar surfaces today (count)

If these numbers do not move in 60 days, something in the
architecture is wrong. Phase 2 does not begin until they do.

That experiment is more important than any new feature.

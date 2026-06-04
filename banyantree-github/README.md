# BanyanTree

> Remembers WHY your code is the way it is — not just what it is.

**Category:** Local-first repository cognition runtime  
**License:** MIT  
**Platform:** Windows · macOS · Linux

---

## Install in one command

**Windows** (PowerShell — paste and press Enter):
```powershell
irm https://raw.githubusercontent.com/adorbis/banyantree/main/install.ps1 | iex
```

**macOS / Linux** (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/adorbis/banyantree/main/install.sh | bash
```

The installer handles everything automatically:
- Checks / installs Node.js 20
- Clones the repository
- Installs dependencies and builds
- Adds `banyan` CLI to PATH
- Registers runtime daemon (starts on login)
- Installs VS Code extension if VS Code is present

---

## The aha moment

A developer opens a file they have not touched in 6 weeks.  
Without typing a single word, the sidebar already shows:

- What they were working on
- Why the decision was made
- What remains unresolved
- What files are connected

**That 10-second experience is the product.**

---

## What Git gives you vs what BanyanTree adds

| Git already gives you | BanyanTree adds |
|----------------------|-----------------|
| What changed and when | Why the approach was chosen |
| Who changed it | What alternatives were rejected |
| Commit messages | Reasoning that never became a commit |
| Current file state | Open questions still unresolved |
| Code review comments | Semantic file relationships |

Git versions decisions after they are made.  
BanyanTree captures reasoning while it is happening.

---

## After installing

```bash
# 1. Initialise a repository
banyan init /path/to/your/project

# 2. Health check
banyan doctor

# 3. Connect Claude Code — add to your project .mcp.json:
# { "mcpServers": { "banyantree": { "command": "banyan-mcp" } } }
```

Then open VS Code in your project. The BanyanTree sidebar appears.  
Open Claude Code and ask about any file. Claude already knows its history.

---

## CLI

```bash
banyan init <path>      # initialise a repository
banyan doctor           # health check — shows runtime state
banyan inspect          # browse all stored memories
banyan graph            # graph statistics
banyan memory           # recent session memories
banyan export           # export everything as JSON (you own it)
banyan forget <id>      # delete a memory node permanently
banyan validate         # check graph integrity
banyan repair           # fix repairable integrity issues
banyan safe-mode        # emergency mode — disable indexing
```

---

## What BanyanTree is not

- Not an AI coding assistant or code generator
- Not SaaS or cloud-first
- Not autonomous — agents flag only, never execute
- Not productivity surveillance

See [docs/doctrine/anti-goals.md](docs/doctrine/anti-goals.md)

---

## Architecture

```
VS Code Extension  →  Local Runtime Daemon
                              ↓
                   SQLite Cognition Storage
                    (graph + memory + events)
                              ↓
                    MCP Server (read-only)
                              ↓
                         Claude Code
```

Everything runs on your machine.  
Cloud is always opt-in, never default.  
You own your graph. Export anytime. Delete anytime.

---

## Requirements

- Node.js 20+
- Git
- VS Code 1.85+ (optional but recommended)
- Windows 10+ · macOS 12+ · Ubuntu 20+
- 150MB RAM idle · 500MB disk

---

## Contributing

Read [docs/doctrine/rules.md](docs/doctrine/rules.md) before contributing.  
Core rule: architecture changes only from real usage — not trends.

---

## License

MIT — see [LICENSE](LICENSE)

Built by [Adorbis](https://adorbis.com).  
The graph is yours. The memory is yours. BanyanTree holds it in trust.

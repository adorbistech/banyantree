## MCP Connection (added to bottom of CLAUDE.md)

BanyanTree exposes its cognition graph to Claude via MCP.
The .mcp.json file in the repo root configures this automatically.

### How to use BanyanTree tools in Claude Code

At the start of every session, call:
  get_repo_context()

When opening a file you want to reason about:
  get_file_context(relative_path: "src/auth/AuthService.ts")

When you need to understand impact radius before a change:
  get_dependencies(relative_path: "src/auth/AuthService.ts")

When you need to find related files:
  get_related_files(relative_path: "src/auth/AuthService.ts")

When you want to find past decisions about a topic:
  search_memories(query: "token expiry")

Before making any recommendation that could conflict with doctrine:
  get_corrections()

### What these tools return

Not raw code. Not vector chunks. A structured cognition packet:
- Architectural decisions recorded in past sessions
- Human corrections (overrides that never decay)
- Open questions still unresolved
- Graph relationships (what this file imports, what imports it)
- Semantic neighbours (files worked on together)
- Session-derived importance weights

### What Claude must never do via these tools

These are read-only tools. Claude cannot write to the graph,
delete memories, or modify anything. All writes go through
the developer (VS Code UI or banyan CLI commands).

This is constitutional rule R03:
Memory is shown to the developer first. Claude receives it second.

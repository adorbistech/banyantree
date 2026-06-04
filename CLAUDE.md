# BanyanTree — Instructions for Claude Code

## What this project is

BanyanTree is a **local-first repository cognition runtime**.
It preserves, structures, and surfaces engineering reasoning across repositories and time.

Single-line definition:
> "Remembers WHY your code is the way it is — not just what it is."

Category: Licensed Local Cognitive Infrastructure.
NOT an AI assistant. NOT a code generator. NOT SaaS.

---

## The aha moment — the only thing Phase 1 builds toward

A developer opens a file they haven't touched in 6 weeks.
Without typing a word, the sidebar already shows:
- what they were working on
- why the decision was made
- what remains unresolved
- what files are connected

That 10-second experience is the product. Every line of code you write serves this moment.

---

## Current phase

**Phase 1 — Cognitive Foundation**

Prove persistent repository cognition. Nothing more.

Build only:
- VS Code extension (sidebar + memory panel)
- Local Banyan runtime (Node.js daemon)
- SQLite cognition storage (memory DB + graph tables + event log)
- Tree-sitter AST parser
- Memory lifecycle engine
- MCP server (graph as tools for Claude)
- CLI: banyan init / inspect / graph / memory / doctor / export / forget
- 3 agents ONLY: Memory Agent, Graph Agent, Drift Agent (flag-only, no execution)

---

## Constitutional rules — never violate these

- **R01** Memory first. Features second.
- **R02** Graph is the source of truth. Not prompts. Not embeddings. Not chat logs.
- **R03** Memory shown to developer FIRST. Claude receives it second.
- **R04** Human correction is unconditionally final. The graph never argues back.
- **R05** No autonomous execution of any kind. Agents flag only.
- **R06** All AI decisions must be explainable — source, confidence, reasoning visible on demand.
- **R07** Local-first by default. Cloud always opt-in, never opt-out.
- **R08** Developer owns everything. BanyanTree holds in trust.
- **R09** Context quality over model size.
- **R10** Invisible until it has something worth saying.
- **R11** Simplification over expansion when failure appears.
- **R12** Documentation is part of cognition.
- **R13** No hidden AI behaviour. No silent mutations.
- **R14** Architecture changes only from real usage — not trends.
- **R15** Phase 1 success = contextual continuity, not features.

---

## Anti-goals — reject any feature resembling these

Never build: autonomous code execution, surveillance, SaaS, productivity tracking,
cloud-first architecture, always-online dependency, code generation, AI pair programmer,
enterprise admin dashboard, agent swarm, code review system, team communication.

---

## Tech stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js ≥20
- **Monorepo:** Turborepo + npm workspaces
- **Storage:** SQLite (better-sqlite3) — Phase 1 only. Neo4j deferred to Phase 2.
- **AST parsing:** Tree-sitter
- **AI connector:** Claude via MCP
- **IDE extension:** VS Code Extension API
- **CLI:** Commander.js

---

## Performance budgets — hard limits

| System | Budget |
|---|---|
| Idle RAM | < 150MB |
| Sidebar render | < 150ms |
| Memory retrieval | < 200ms |
| AST parse on save | < 100ms |
| Graph write | < 50ms |
| CLI response | < 500ms |
| SQLite file size | < 50MB |

---

## Graph node creation policy

A node is created ONLY when:
1. The file was referenced in an active AI session
2. The developer explicitly said "remember this"
3. The file is in the dependency chain of an existing root node
4. A drift flag was raised against it

**Never** create nodes for every file on install. That is graph explosion.

---

## Phase 1 hard limits

- Max nodes per repo: **500**
- Max edges per node: **20**
- Max session notes: **200** (rolling)
- Max graph file: **50MB**
- Agents in Phase 1: **3** (Memory, Graph, Drift — flag-only)

---

## How to behave in this project

- Filter every proposal through the constitutional rules first
- Ask: does this contribute to the aha moment?
- Prefer boring reliable engineering over clever abstractions
- When scope creeps — redirect to V1 definition
- When in doubt — do less, not more
- Never suggest adding agents, layers, or complexity without real usage evidence
- SQLite is the database. Do not suggest alternatives until Phase 2.
- The 3 agents are pipelines with schedules, not autonomous reasoning systems

---

## Repository structure

```
/banyantree
  /apps
    /vscode-extension    # sidebar, memory panel, drift alerts
    /desktop-runtime     # local daemon, file watcher, event bus
    /cli                 # banyan commands
  /core
    /memory              # lifecycle, weighting, decay, correction
    /graph               # entities, relationships, SQLite graph
    /events              # event bus, temporal log
    /reasoning           # trace storage and replay
    /security            # repo scope, permissions, audit log
    /storage             # SQLite adapters, schema, migrations
  /services
    /parser              # Tree-sitter AST, entity extraction
    /indexer             # session observer, file watcher
    /mcp-server          # MCP interface, graph query tools
    /ai-connectors       # Claude, model abstraction layer
  /agents
    /memory-agent        # session observation + memory lifecycle
    /graph-agent         # graph integrity + pruning queue
    /drift-agent         # doctrine comparison + flag writing
  /docs
    /doctrine            # all 12 foundation documents
```

---

## Doctrine documents

Full doctrine is in `/docs/doctrine/`. Read before changing anything architectural:
- `rules.md` — constitutional law
- `anti-goals.md` — scope immune system
- `cognition-principles.md` — human thinking philosophy
- `architecture.md` — system design
- `memory-lifecycle.md` — memory contract
- `graph-governance.md` — graph hard limits
- `security-principles.md` — security rules
- `knowledge.md` — canonical institutional knowledge
- `SKILL.md` — capability + limitation doctrine
- `performance-budget.md` — hard performance ceilings
- `failure-modes.md` — known failures + recovery
- `metrics.md` — Phase 1 success criteria

# PHASE_LOCKS.md
# BanyanTree — Phase Lock System

## Purpose

This document prevents architectural drift by naming exactly what
is forbidden in each phase. Every contributor reads this before
proposing any feature. Every PR is checked against this list.

Architecture changes only from real usage — not trends.
(Constitutional Rule R14)

---

## Phase 1 — FORBIDDEN (hard locks)

These cannot be built in Phase 1 under any circumstances.
No exception. No "just a small version of it."

### Infrastructure forbidden
- Cloud sync of any kind
- Multi-user shared graph
- Distributed agent systems
- Hosted SaaS deployment
- Always-online dependency
- Mandatory cloud activation

### Agent forbidden
- More than 3 agents (Memory, Graph, Drift)
- Any agent with write access beyond flag nodes
- Autonomous code modification
- Autonomous graph mutation
- Self-reinforcing memory without human approval

### AI forbidden
- AI mutating graph directly
- AI deleting memory
- AI auto-reinforcing nodes
- AI rewriting reasoning history
- Silent context injection (developer sees it first — R03)

### Storage forbidden
- Neo4j (SQLite only in Phase 1)
- pgvector (SQLite only in Phase 1)
- Cloud database of any kind
- Shared graph storage across machines

### UI forbidden
- Enterprise admin dashboard
- Team management interface
- Billing or subscription UI
- Productivity analytics or tracking
- Social or collaboration features
- Desktop Electron app

### Features forbidden
- Code generation
- Autonomous refactoring suggestions
- PR review automation
- CI/CD integration
- Team communication
- Productivity scoring
- Developer surveillance of any kind

---

## Phase 1 — ALLOWED

Only these are in scope:

- VS Code extension (sidebar, memory panel, drift alerts)
- Local runtime daemon (Node.js)
- SQLite cognition storage (graph + memory + events)
- Tree-sitter AST parser
- Memory lifecycle engine (create, weight, decay, correct, delete)
- MCP server (graph as tools for Claude)
- CLI: init / status / inspect / graph / memory / doctor / export / forget / logs
- Memory Agent (session observation + memory lifecycle)
- Graph Agent (graph integrity + pruning queue)
- Drift Agent (doctrine comparison + flag writing, flag-only)
- Reasoning trace storage and replay
- banyan safe-mode (emergency recovery)
- banyan repair / validate (data integrity)

---

## Phase 2 — Unlocked after Phase 1 success criteria met

Success criteria: developer returns after 1+ week, recovers context
in under 3 minutes without re-reading codebase. Metrics in metrics.md.

- Drift agent (full implementation)
- Governance engine and pruning scheduler
- Immune layer (contradiction detection)
- Branch consolidation (automated)
- pgvector embeddings
- Desktop control panel (Tauri)
- System tray runtime indicator
- Reasoning replay UI
- Graph visualization
- Additional AI model connectors

---

## Phase 3 — Do not discuss until Phase 2 is stable

- Cross-repository cognition
- Multi-user shared graph
- Team knowledge transfer
- Enterprise policy layers
- Plugin system
- Organizational memory
- Cloud sync (opt-in only, never default)

---

## How to use this document

When a feature is proposed:
1. Check the Phase 1 forbidden list first
2. If it appears there — answer is no, immediately, without debate
3. If unclear — default to no and ask: "does this contribute to the aha moment?"
4. If yes and it is not forbidden — build it

This document does not expire. It updates only when a phase
boundary is officially crossed based on real usage evidence.

# BanyanTree

> Remembers WHY your code is the way it is — not just what it is.

**Category:** Local-first repository cognition runtime  
**Phase:** 1 — Cognitive Foundation  
**Status:** Active development

---

## What this is

BanyanTree is persistent engineering memory for your repository.

Every AI tool today starts each session blank. BanyanTree gives Claude persistent knowledge of your project's architectural decisions, reasoning history, and unresolved questions — so you never re-explain the same thing twice.

**Read first:** [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — the problem, the aha moment, and the mission.

---

## The aha moment

A developer opens a file they haven't touched in 6 weeks.  
Without typing a word, the sidebar already shows:

- What they were working on
- Why the decision was made
- What remains unresolved  
- What files are connected

That 10-second experience is the product.

---

## Phase 1 — what gets built

| Component | Purpose |
|---|---|
| VS Code extension | Sidebar + memory panel + drift alerts |
| Local runtime daemon | Session observer + file watcher + event bus |
| SQLite cognition layer | Graph + memory + events + reasoning traces |
| Tree-sitter parser | AST parsing + entity extraction |
| MCP server | Graph as tools for Claude |
| CLI (`banyan`) | init / inspect / graph / memory / doctor / export |
| 3 agents | Memory, Graph, Drift — flag-only, no execution |

---

## Quick start

```bash
npm install
npm run build
banyan init /path/to/your/repo
```

---

## Doctrine

All architectural decisions live in [`/docs/doctrine/`](./docs/doctrine/).  
Read before changing anything structural.

Key documents:
- [`rules.md`](./docs/doctrine/rules.md) — 15 constitutional rules
- [`anti-goals.md`](./docs/doctrine/anti-goals.md) — what this never becomes
- [`architecture.md`](./docs/doctrine/architecture.md) — system design
- [`SKILL.md`](./docs/doctrine/SKILL.md) — capability and limitation contract

---

## Performance budgets

| System | Budget |
|---|---|
| Sidebar render | < 150ms |
| Memory retrieval | < 200ms |
| Idle RAM | < 150MB |
| Graph file | < 50MB |

---

## What this is not

Not an AI coding assistant. Not a code generator. Not SaaS.  
Not autonomous. Not surveillance. Not cloud-first.

See [`anti-goals.md`](./docs/doctrine/anti-goals.md).

# BUILD_BLOCKS.md
# BanyanTree — Lego Block Build Methodology

## The build law

One block only. Until: stable, tested, documented, verified, secured.
Then move forward. Never build two major blocks at once.

Architecture changes only when real usage proves something wrong.
Not because of new ideas, trends, or "what if we also."

---

## Block status

| Block | Name                    | Status      | Gate condition |
|-------|-------------------------|-------------|----------------|
| 1     | Repository Foundation   | ✓ LOCKED    | Scaffold + doctrine complete |
| 2     | SQLite Cognition Schema | ✓ LOCKED    | schema.sql + types.ts + db.ts |
| 3     | Local Runtime Daemon    | ✓ LOCKED    | daemon + event bus + file watcher + session observer |
| 4     | Tree-sitter Parser      | ✓ LOCKED    | AST parse → entity extract → graph write |
| 5     | Graph Engine            | ✓ LOCKED    | entity CRUD + traversal + confidence |
| 6     | Memory Engine           | ✓ LOCKED    | create + reinforce + correct + decay + delete |
| 7     | MCP Server              | ✓ LOCKED    | graph as tools, Claude queries mid-reasoning |
| 8     | VS Code Extension       | ✓ LOCKED    | sidebar + memory panel + drift alerts = aha moment |
| 9     | Desktop Control Panel   | ○ pending   | dashboard + memory + security + runtime (Tauri) |
| 10    | CLI System              | ✓ LOCKED    | all commands wired, cross-platform |
| 11    | Installers & Signing    | ○ pending   | MSI + PKG + AppImage, signed binaries |
| 12    | Security Hardening      | ○ pending   | tamper resistance, plugin sandbox, integrity |
| 13    | Phase 1 Self-Use Test   | ○ pending   | 60-day experiment, real metrics |

---

## Block definition template

Every block before build must define:

- **Purpose** — what problem this block solves
- **Boundaries** — what it can and cannot do
- **Inputs** — what enters the block
- **Outputs** — what leaves the block
- **Dependencies** — which previous blocks are required
- **Security rules** — what protections apply
- **Tests** — how correctness is validated
- **Lock conditions** — what must pass before moving on

---

## Block 4 — Tree-sitter Parser (NEXT)

**Purpose:** Convert repository files into graph entities. The cognitive
relevance filter that decides what enters the graph.

**Boundaries:**
- Parses TypeScript, JavaScript, Python (Phase 1)
- Extracts: imports, exports, function names, class names, dependencies
- Never stores raw file content
- Never stores secrets (secrets-filter.ts applied before every write)
- Only session-referenced files enter the graph (node creation policy)

**Inputs:** File path from file watcher event bus

**Outputs:** Structured entity + relationship objects → graph engine

**Dependencies:** Block 2 (schema), Block 3 (event bus, file watcher)

**Security:** secrets-filter.ts runs on every extraction. .gitignore respected.

**Tests:**
- Parses 200-file TypeScript repo without error
- Extracts correct import relationships
- Blocks .env and credential files
- Does not exceed 100ms per file (performance budget)

**Lock conditions:** Parser produces correct entity + relationship JSON
for all supported languages. Secrets filter verified. Performance budget met.

---

## Block 7 — MCP Server (after blocks 4, 5, 6)

**Purpose:** Expose the cognition graph as MCP tools so Claude can
query it mid-reasoning. The bridge between the graph and AI.

**Boundaries:**
- Read tools only (AI_BOUNDARIES.md)
- AI cannot write, delete, or mutate graph
- All tools return structured JSON
- Tool calls logged in security audit trail

**MCP tools (Phase 1):**
- `get_context_for_file` — returns memory nodes, graph connections, flags for a file path
- `get_memory_nodes` — returns top-weighted memories for current repo
- `get_graph_connections` — returns entity relationships (2-hop traversal)
- `get_active_flags` — returns unacknowledged agent flags
- `get_reasoning_trace` — returns past reasoning for a session
- `get_doctrine` — returns seed document and root nodes

**Lock conditions:** Claude Code can call all 6 tools and receive
structured responses. No write tools exposed. Security log shows every call.

---

## Build execution rules

1. Never skip verification
2. Never skip documentation
3. Never add future-phase systems early
4. Never redesign stable blocks without usage evidence
5. Never merge untested cognition logic
6. Every block must remain independently understandable
7. Every block must fail gracefully
8. Every block must expose observability
9. Performance budgets enforced from day one
10. If complexity explodes — STOP. Simplify first.

## The most important rule

Do not build the vision. Build the next stable block only.

---

## Documentation is now closed

All doctrine documents are written. Architecture is locked.
The next change to any document in /docs/doctrine/ requires
real usage evidence that something is wrong.

Implementation begins with Block 4.

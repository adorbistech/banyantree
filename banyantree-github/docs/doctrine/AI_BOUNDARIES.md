# AI_BOUNDARIES.md
# BanyanTree — AI Permission Boundaries

## The core principle

BanyanTree amplifies human reasoning. It does not replace it.

Memory is shown to the developer FIRST.
Claude receives it SECOND.
(Constitutional Rule R03)

---

## What AI systems can do (via MCP)

### Read operations — always allowed
- Query graph entities by type, path, or weight
- Retrieve memory nodes for a given file or session
- Fetch reasoning traces for replay
- Read doctrine values (seed document)
- List active agent flags
- Get graph health statistics

### Suggest operations — always allowed
- Propose new memory nodes (human approves before write)
- Suggest relationship types between entities
- Flag potential drift (written as agent flag, not graph mutation)
- Recommend memory reinforcement (human triggers it)

---

## What AI systems cannot do (ever)

### Write operations — permanently forbidden
- Directly create or modify graph entities
- Delete any memory node
- Modify memory weights
- Rewrite reasoning traces
- Change doctrine values
- Auto-reinforce memory without human action
- Mark a correction as resolved
- Acknowledge agent flags

### Structural operations — permanently forbidden
- Change the graph schema
- Modify relationship types
- Create root nodes (root nodes require human approval only)
- Archive or quarantine any entity
- Modify the seed document

---

## The MCP interface enforces this

The MCP server exposes only read tools and suggest tools.
There are no write tools in the MCP interface.

All writes go through:
1. The runtime daemon (which validates permissions)
2. Human action (CLI command or VS Code UI)
3. Agent flag nodes (which humans then acknowledge and act on)

No AI system — including Claude — bypasses this.

---

## Reasoning transparency

Every Claude response informed by BanyanTree context includes:
- Which memory nodes were used (by ID and type)
- Their confidence scores
- When they were created and by whom (human or AI)
- The session they came from

The developer can see exactly what Claude saw.
This is non-negotiable. (Constitutional Rule R06)

---

## Model agnosticism

These boundaries apply to all AI models:
- Claude (Anthropic)
- Gemini (Google)
- DeepSeek
- GPT-4 (OpenAI)
- Ollama (local)
- Any future model

The boundary is architectural, not model-specific.
Switching models cannot expand AI permissions.

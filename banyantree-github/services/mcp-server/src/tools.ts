/**
 * BanyanTree MCP Tool Definitions
 *
 * These are the ONLY tools Claude can call.
 * Read-only. Curated. Policy-gated.
 *
 * From AI_BOUNDARIES.md:
 * - AI can read everything via these tools
 * - AI can suggest (returned in responses, not acted on)
 * - AI cannot write, delete, or mutate anything
 *
 * From ChatGPT Block 7 spec:
 * "Never expose raw unrestricted filesystem access.
 * Everything flows through: policy → graph → memory → curated retrieval"
 *
 * Tools (7 total):
 * 1. get_file_context     — aha moment payload for a specific file
 * 2. get_related_files    — semantic neighbours via graph traversal
 * 3. get_dependencies     — what this file imports and what imports it
 * 4. get_open_questions   — unresolved questions and TODOs
 * 5. search_memories      — text search across all memories
 * 6. get_corrections      — human corrections (highest trust memories)
 * 7. get_repo_context     — top-level repo cognition for session start
 */

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      default?: unknown
    }>
    required: string[]
  }
}

export const BANYAN_TOOLS: ToolDefinition[] = [
  {
    name: 'get_file_context',
    description: [
      'Returns the full BanyanTree cognition context for a specific file.',
      'Includes: memory nodes (architectural decisions, session notes),',
      'corrections (human overrides), open questions (unresolved TODOs),',
      'graph entity information, and related files.',
      'Call this when opening or discussing a specific file.',
      'This is the primary tool — use it first.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'File path relative to the repository root. Example: src/auth/AuthService.ts',
        },
        include_related: {
          type: 'boolean',
          description: 'Whether to include semantically related files (default: true)',
          default: true,
        },
      },
      required: ['relative_path'],
    },
  },

  {
    name: 'get_related_files',
    description: [
      'Returns files semantically related to the given file via graph traversal.',
      'Traverses up to 2 hops of IMPORTS, CALLS, DEFINES, and DEPENDS_ON relationships.',
      'Results are ranked by graph weight (most relevant first).',
      'Use when you need to understand what other files are connected to the current one.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'File path relative to repository root',
        },
        max_hops: {
          type: 'number',
          description: 'Maximum traversal depth (1 or 2, default: 2)',
          default: 2,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of related files to return (default: 8)',
          default: 8,
        },
      },
      required: ['relative_path'],
    },
  },

  {
    name: 'get_dependencies',
    description: [
      'Returns the dependency context for a file:',
      'what it imports, what imports it, what it calls, what calls it.',
      'Use when analysing impact radius before making changes,',
      'or when understanding what breaks if this file changes.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'File path relative to repository root',
        },
      },
      required: ['relative_path'],
    },
  },

  {
    name: 'get_open_questions',
    description: [
      'Returns unresolved questions, TODOs, and deferred decisions',
      'recorded in BanyanTree memory for this repository or a specific file.',
      'These are questions that were raised in past sessions but never resolved.',
      'Use at the start of a session to understand what needs attention.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Optional: limit to a specific file. Omit for all open questions.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of open questions to return (default: 10)',
          default: 10,
        },
      },
      required: [],
    },
  },

  {
    name: 'search_memories',
    description: [
      'Text search across all BanyanTree memory nodes.',
      'Returns memories matching the query, ranked by weight.',
      'Use when you need to find specific architectural decisions,',
      'past reasoning, or recorded constraints about a topic.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Example: "auth token expiry" or "retry logic"',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
          default: 10,
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'get_corrections',
    description: [
      'Returns human corrections — memories where the developer explicitly overrode',
      'an AI assumption or corrected past reasoning.',
      'Corrections have the highest trust level and never decay.',
      'Always check corrections before making recommendations that could conflict.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Optional: limit to corrections for a specific file.',
        },
      },
      required: [],
    },
  },

  {
    name: 'get_repo_context',
    description: [
      'Returns top-level repository cognition: the seed document (project doctrine),',
      'highest-weighted memories, recent corrections, and active agent flags.',
      'Call this at the start of a new session to load foundational project context.',
      'This gives Claude the WHY behind the codebase, not just the WHAT.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        include_flags: {
          type: 'boolean',
          description: 'Whether to include active agent drift flags (default: true)',
          default: true,
        },
      },
      required: [],
    },
  },
]

-- BanyanTree Phase 1 — SQLite Cognition Schema
-- The source of truth. Not prompts. Not embeddings. Not chat logs.
-- Graph rules: no orphan nodes, confidence required, lifecycle mandatory.
-- Node creation policy: session-referenced + root-connected + drift-flagged ONLY.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ============================================================
-- REPOSITORIES
-- ============================================================
-- One row per approved repository. banyan init creates this.

CREATE TABLE IF NOT EXISTS repositories (
  id          TEXT PRIMARY KEY,              -- uuid
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,          -- absolute local path
  created_at  INTEGER NOT NULL,              -- unix timestamp ms
  last_active INTEGER,
  node_count  INTEGER DEFAULT 0,             -- maintained by graph-agent
  status      TEXT DEFAULT 'active'          -- active | archived | paused
);

-- ============================================================
-- ENTITIES (graph nodes)
-- ============================================================
-- Every node in the cognition graph lives here.
-- Phase 1 hard limit: 500 nodes per repository.

CREATE TABLE IF NOT EXISTS entities (
  id            TEXT PRIMARY KEY,            -- uuid
  repo_id       TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,               -- see EntityType enum below
  name          TEXT NOT NULL,
  path          TEXT,                        -- file path if applicable
  content       TEXT,                        -- serialised JSON payload
  weight        REAL NOT NULL DEFAULT 0.5,   -- 0.0 – 1.0
  confidence    REAL NOT NULL DEFAULT 0.5,   -- 0.0 – 1.0
  trust_level   TEXT DEFAULT 'ai',           -- ai | human | system
  source        TEXT,                        -- session_id or 'human' or 'parser'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_accessed INTEGER,
  expires_at    INTEGER,                     -- null = never expires
  status        TEXT DEFAULT 'active'        -- active | quarantine | archived | deleted
);

-- EntityType values (enforced at application layer):
-- repository | file | function | class | workflow | decision
-- reasoning  | dependency | session | memory | event | architecture_rule

CREATE INDEX IF NOT EXISTS idx_entities_repo ON entities(repo_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_weight ON entities(weight DESC);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_path ON entities(path);

-- ============================================================
-- RELATIONSHIPS (graph edges)
-- ============================================================
-- All edges between entities.
-- Phase 1 hard limit: 20 edges per node.

CREATE TABLE IF NOT EXISTS relationships (
  id           TEXT PRIMARY KEY,
  repo_id      TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  from_id      TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,               -- see RelationshipType enum below
  weight       REAL NOT NULL DEFAULT 0.5,
  confidence   REAL NOT NULL DEFAULT 0.5,
  metadata     TEXT,                        -- JSON
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  status       TEXT DEFAULT 'active'        -- active | superseded | archived

  -- RelationshipType values:
  -- IMPORTS | CALLS | DEPENDS_ON | MODIFIES | RELATES_TO
  -- REASONED_ABOUT | SUPERSEDES | REINFORCES | CONTRADICTS
  -- CREATED_BY | CONNECTED_TO
);

CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_id);
CREATE INDEX IF NOT EXISTS idx_rel_to ON relationships(to_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);
CREATE INDEX IF NOT EXISTS idx_rel_repo ON relationships(repo_id);

-- Prevent duplicate edges of the same type between the same nodes
CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique
  ON relationships(from_id, to_id, type)
  WHERE status = 'active';

-- ============================================================
-- MEMORY
-- ============================================================
-- Session memory, structural memory, reinforced memory.
-- Lifecycle: creation → weighting → reinforcement → decay → archive/delete

CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  repo_id         TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  entity_id       TEXT REFERENCES entities(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,            -- session | structural | reinforced | correction
  content         TEXT NOT NULL,            -- the actual memory text
  weight          REAL NOT NULL DEFAULT 0.4,
  reinforcement   INTEGER DEFAULT 0,        -- count of human reinforcements
  is_correction   INTEGER DEFAULT 0,        -- 1 if this overrides a previous memory
  corrects_id     TEXT REFERENCES memories(id),
  session_id      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_accessed   INTEGER,
  expires_at      INTEGER,                  -- null for permanent memories
  status          TEXT DEFAULT 'active'     -- active | decayed | archived | deleted
);

CREATE INDEX IF NOT EXISTS idx_mem_repo ON memories(repo_id);
CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_mem_weight ON memories(weight DESC);
CREATE INDEX IF NOT EXISTS idx_mem_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_mem_entity ON memories(entity_id);
CREATE INDEX IF NOT EXISTS idx_mem_status ON memories(status);

-- ============================================================
-- SESSIONS
-- ============================================================
-- One row per working session observed by the runtime.
-- A session = one continuous working period in the IDE.

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  files_touched TEXT,                       -- JSON array of paths
  summary     TEXT,                         -- brief AI-generated summary (Phase 2)
  node_count  INTEGER DEFAULT 0,            -- nodes created/referenced in session
  status      TEXT DEFAULT 'active'         -- active | completed | archived
);

CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

-- ============================================================
-- REASONING TRACES
-- ============================================================
-- Why the AI made a recommendation. Replayable. Auditable.

CREATE TABLE IF NOT EXISTS reasoning_traces (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sessions(id),
  entity_ids  TEXT,                         -- JSON array of entity ids used as context
  memory_ids  TEXT,                         -- JSON array of memory ids used as context
  query       TEXT NOT NULL,                -- what the developer asked
  context     TEXT,                         -- serialised context sent to AI
  response    TEXT,                         -- AI response summary
  model       TEXT,                         -- which AI model was used
  confidence  REAL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traces_repo ON reasoning_traces(repo_id);
CREATE INDEX IF NOT EXISTS idx_traces_session ON reasoning_traces(session_id);

-- ============================================================
-- EVENTS
-- ============================================================
-- Temporal log of all system mutations. Immutable append-only.
-- This becomes the temporal cognition foundation.

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT REFERENCES repositories(id),
  type        TEXT NOT NULL,                -- see EventType below
  actor       TEXT NOT NULL,               -- 'human' | 'memory-agent' | 'graph-agent' | 'drift-agent' | 'system'
  entity_id   TEXT,
  memory_id   TEXT,
  payload     TEXT,                         -- JSON
  created_at  INTEGER NOT NULL
  -- EventType values:
  -- node_created | node_updated | node_deleted | node_quarantined
  -- memory_created | memory_corrected | memory_reinforced | memory_decayed
  -- relationship_created | relationship_removed
  -- drift_flagged | drift_acknowledged
  -- session_started | session_ended
  -- graph_pruned | memory_archived
);

CREATE INDEX IF NOT EXISTS idx_events_repo ON events(repo_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id);

-- ============================================================
-- AGENT FLAGS
-- ============================================================
-- What agents write. Flag-only. No execution rights.
-- Acknowledged flags do not get deleted — they become history.

CREATE TABLE IF NOT EXISTS agent_flags (
  id              TEXT PRIMARY KEY,
  repo_id         TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  agent           TEXT NOT NULL,            -- memory-agent | graph-agent | drift-agent
  severity        TEXT NOT NULL,            -- info | warning | critical
  type            TEXT NOT NULL,            -- drift | stale | conflict | limit | entropy
  title           TEXT NOT NULL,
  detail          TEXT,
  entity_ids      TEXT,                     -- JSON array of related entity ids
  acknowledged    INTEGER DEFAULT 0,        -- 0 | 1
  acknowledged_at INTEGER,
  resolution      TEXT,                     -- human-written note on resolution
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER                   -- auto-expire info flags after 7 days
);

CREATE INDEX IF NOT EXISTS idx_flags_repo ON agent_flags(repo_id);
CREATE INDEX IF NOT EXISTS idx_flags_agent ON agent_flags(agent);
CREATE INDEX IF NOT EXISTS idx_flags_ack ON agent_flags(acknowledged);
CREATE INDEX IF NOT EXISTS idx_flags_severity ON agent_flags(severity);

-- ============================================================
-- DOCTRINE
-- ============================================================
-- Key-value store for the seed document and project doctrine.
-- Human-written. High trust. Never overwritten by AI.

CREATE TABLE IF NOT EXISTS doctrine (
  key         TEXT NOT NULL,
  repo_id     TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  value       TEXT NOT NULL,
  trust_level TEXT DEFAULT 'human',         -- always human for doctrine
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (key, repo_id)
);

-- ============================================================
-- GRAPH HEALTH SNAPSHOT
-- ============================================================
-- Weekly health report written by graph-agent.
-- Used by banyan doctor and the control panel.

CREATE TABLE IF NOT EXISTS graph_health (
  id              TEXT PRIMARY KEY,
  repo_id         TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  node_count      INTEGER NOT NULL,
  edge_count      INTEGER NOT NULL,
  memory_count    INTEGER NOT NULL,
  stale_nodes     INTEGER DEFAULT 0,
  orphan_nodes    INTEGER DEFAULT 0,
  pending_prune   INTEGER DEFAULT 0,
  db_size_bytes   INTEGER,
  health_score    REAL,                     -- 0.0 – 1.0 computed by graph-agent
  notes           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_repo ON graph_health(repo_id);
CREATE INDEX IF NOT EXISTS idx_health_created ON graph_health(created_at DESC);

CREATE TABLE workspace_state (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

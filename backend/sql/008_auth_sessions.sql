CREATE TABLE IF NOT EXISTS bridge.auth_sessions (
  token_hash TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_actor_id
  ON bridge.auth_sessions(actor_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON bridge.auth_sessions(expires_at);
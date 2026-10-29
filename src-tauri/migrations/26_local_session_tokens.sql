-- Migration 26 : jetons opaques de restauration de session locale
-- Le secret n'est jamais stocké en clair : seul son hash bcrypt est conservé.
CREATE TABLE IF NOT EXISTS local_session_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_local_session_tokens_user
    ON local_session_tokens(user_id, school_id);

CREATE INDEX IF NOT EXISTS idx_local_session_tokens_expiry
    ON local_session_tokens(expires_at);

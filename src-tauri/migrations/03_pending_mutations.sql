-- Migration 03 : File de synchronisation (Offline-First)
-- Prépare les mutations en attente pour synchronisation avec Supabase

CREATE TABLE IF NOT EXISTS pending_mutations (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,      -- ex: 'school', 'user', 'profile'
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,        -- 'INSERT', 'UPDATE', 'DELETE'
    payload TEXT NOT NULL,          -- JSON sérialisé
    status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'SYNCED', 'FAILED', 'CONFLICT'
    device_id TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME,
    error_message TEXT,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_mutations_status ON pending_mutations(status);
CREATE INDEX IF NOT EXISTS idx_mutations_entity ON pending_mutations(entity_type, entity_id);

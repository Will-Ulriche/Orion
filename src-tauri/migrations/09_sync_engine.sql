-- ============================================================
-- Migration 09 : Sync Engine — Session 3 Offline-First
-- ============================================================
-- Stratégie :
--   1. Enrichir pending_mutations avec les champs nécessaires
--      (on ne la renomme pas pour ne pas casser les FK existantes)
--   2. Créer sync_inbox pour les changements entrants depuis Supabase
--   3. Créer sync_state pour le suivi de la dernière synchronisation
-- ============================================================

-- ─────────────────────────────────────────────────────
-- 1. Enrichissement de pending_mutations (proto-outbox)
--    Nouveaux champs : school_id, attempt_count,
--    last_attempt_at, last_error, server_version
-- ─────────────────────────────────────────────────────

ALTER TABLE pending_mutations ADD COLUMN school_id TEXT;
ALTER TABLE pending_mutations ADD COLUMN attempt_count INTEGER DEFAULT 0;
ALTER TABLE pending_mutations ADD COLUMN last_attempt_at DATETIME;
ALTER TABLE pending_mutations ADD COLUMN last_error TEXT;
ALTER TABLE pending_mutations ADD COLUMN server_version TEXT;

-- Index supplémentaires pour les requêtes de synchronisation
CREATE INDEX IF NOT EXISTS idx_mutations_school ON pending_mutations(school_id, status);
CREATE INDEX IF NOT EXISTS idx_mutations_attempt ON pending_mutations(status, attempt_count);

-- ─────────────────────────────────────────────────────
-- 2. sync_inbox — Changements entrants depuis Supabase
--    Reçoit les deltas distants avant application locale
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_inbox (
    id              TEXT PRIMARY KEY,
    remote_id       TEXT NOT NULL,          -- ID du changement côté Supabase
    school_id       TEXT NOT NULL,
    device_id       TEXT,                   -- Appareil source du changement
    user_id         TEXT,
    entity_type     TEXT NOT NULL,          -- Table cible : 'students', 'enrollments'...
    entity_id       TEXT NOT NULL,          -- UUID de l'entité concernée
    operation       TEXT NOT NULL,          -- 'INSERT', 'UPDATE', 'DELETE'
    payload         TEXT NOT NULL,          -- JSON du changement distant
    server_version  TEXT,                   -- Cursor/version Supabase pour l'incrémential
    status          TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPLIED', 'CONFLICT', 'FAILED', 'SKIPPED'
    conflict_data   TEXT,                   -- JSON des deux versions en cas de conflit
    error_message   TEXT,
    received_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    applied_at      DATETIME,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_status  ON sync_inbox(status);
CREATE INDEX IF NOT EXISTS idx_inbox_school  ON sync_inbox(school_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_entity  ON sync_inbox(entity_type, entity_id);

-- ─────────────────────────────────────────────────────
-- 3. sync_state — État du moteur par appareil
--    Une ligne par (school_id, device_id)
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_state (
    id                      TEXT PRIMARY KEY,
    school_id               TEXT NOT NULL,
    device_id               TEXT NOT NULL,
    last_sync_at            DATETIME,           -- Dernière sync complète réussie
    last_outbound_at        DATETIME,           -- Dernière émission vers Supabase
    last_inbound_at         DATETIME,           -- Dernière réception depuis Supabase
    outbound_cursor         TEXT,               -- Cursor pour la reprise outbound
    inbound_cursor          TEXT,               -- Cursor/version Supabase pour l'incremental
    engine_status           TEXT DEFAULT 'IDLE',-- 'IDLE', 'SYNCING', 'ERROR', 'OFFLINE'
    last_error              TEXT,
    last_error_at           DATETIME,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, device_id),
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

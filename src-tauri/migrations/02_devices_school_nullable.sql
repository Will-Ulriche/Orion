-- Migration 02 : Rendre school_id nullable dans devices
-- Raison : un appareil peut être enregistré avant que l'établissement soit configuré (premier lancement)

-- Recréer la table devices avec school_id nullable
CREATE TABLE IF NOT EXISTS devices_new (
    id TEXT PRIMARY KEY,
    school_id TEXT,  -- nullable : NULL pendant la phase de premier lancement
    device_identifier TEXT UNIQUE NOT NULL,
    device_name TEXT,
    platform TEXT,
    status TEXT DEFAULT 'ACTIVE',
    last_seen_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

INSERT INTO devices_new SELECT * FROM devices;
DROP TABLE devices;
ALTER TABLE devices_new RENAME TO devices;

-- LIC-02 : cycle de vie des licences (base locale SQLite)
-- Une seule licence courante par etablissement, historique conserve

ALTER TABLE licenses ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0;

-- Backfill : au plus une licence courante par etablissement
UPDATE licenses
SET is_current = 1
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY school_id
             ORDER BY (status = 'ACTIVE') DESC, COALESCE(starts_at, created_at) DESC,
                      created_at DESC, id DESC
           ) AS rn
    FROM licenses
  )
  WHERE rn = 1
);

-- Les anciennes licences ACTIVES deviennent des archives
UPDATE licenses
SET status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
WHERE is_current = 0 AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_one_current_per_school
  ON licenses(school_id) WHERE is_current = 1;

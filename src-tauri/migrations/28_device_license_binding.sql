ALTER TABLE devices ADD COLUMN license_id TEXT;
ALTER TABLE devices ADD COLUMN deleted_at INTEGER;

UPDATE devices
   SET license_id = (
     SELECT licenses.id
       FROM licenses
      WHERE licenses.school_id = devices.school_id
        AND licenses.is_current = 1
      ORDER BY licenses.created_at DESC, licenses.id DESC
      LIMIT 1
   )
 WHERE license_id IS NULL;

UPDATE devices
   SET status = 'REVOKED',
       deleted_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE license_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_active_license_identifier
  ON devices(license_id, device_identifier)
 WHERE deleted_at IS NULL AND status = 'ACTIVE';

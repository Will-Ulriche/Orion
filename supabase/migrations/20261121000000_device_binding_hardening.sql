ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.devices
   SET status = upper(btrim(coalesce(status, 'ACTIVE')))
 WHERE status IS NULL OR status <> upper(btrim(coalesce(status, 'ACTIVE')));

UPDATE public.devices d
   SET license_id = (
     SELECT l.id
       FROM public.licenses l
      WHERE l.school_id = d.school_id
        AND l.is_current = true
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 1
   )
 WHERE d.license_id IS NULL;

UPDATE public.devices
   SET status = 'REVOKED',
       deleted_at = coalesce(deleted_at, now())
 WHERE license_id IS NULL;

UPDATE public.devices
   SET status = 'ACTIVE'
 WHERE status NOT IN ('ACTIVE', 'REVOKED');

ALTER TABLE public.devices
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_status_allowed;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_status_allowed
  CHECK (status IN ('ACTIVE', 'REVOKED'));

CREATE UNIQUE INDEX IF NOT EXISTS devices_active_license_identifier
  ON public.devices (license_id, device_identifier)
 WHERE deleted_at IS NULL AND status = 'ACTIVE';

UPDATE public.licenses
   SET status = upper(btrim(coalesce(status, 'ACTIVE')))
 WHERE status IS NULL OR status <> upper(btrim(coalesce(status, 'ACTIVE')));

UPDATE public.licenses
   SET max_devices = 1
 WHERE max_devices IS NULL OR max_devices < 1;

ALTER TABLE public.licenses
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN max_devices SET DEFAULT 1,
  ALTER COLUMN max_devices SET NOT NULL;

ALTER TABLE public.licenses
  DROP CONSTRAINT IF EXISTS licenses_status_allowed;

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_status_allowed
  CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'SUPERSEDED'));

ALTER TABLE public.licenses
  DROP CONSTRAINT IF EXISTS licenses_max_devices_positive;

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_max_devices_positive
  CHECK (max_devices >= 1);

CREATE OR REPLACE FUNCTION public.register_or_reactivate_device(
  p_license_id uuid,
  p_device_identifier text,
  p_device_name text DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $device_registration$
DECLARE
  v_user_id text := auth.uid()::text;
  v_clean_identifier text := btrim(p_device_identifier);
  v_lic public.licenses%ROWTYPE;
  v_dev public.devices%ROWTYPE;
  v_user_schools text[];
  v_count integer;
  v_max integer;
  v_device_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour enregistrer un appareil'
      USING ERRCODE = '42501';
  END IF;

  IF v_clean_identifier IS NULL OR v_clean_identifier = '' OR length(v_clean_identifier) > 512 THEN
    RAISE EXCEPTION 'Identifiant d''appareil invalide'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lic
    FROM public.licenses
   WHERE id = p_license_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Licence introuvable'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT array_agg(school_id::text) INTO v_user_schools
      FROM public.user_school_ids() AS school_id;

    IF v_user_schools IS NULL OR NOT (v_lic.school_id::text = ANY(v_user_schools)) THEN
      RAISE EXCEPTION 'Non autorisé pour cet établissement'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_school_role(v_lic.school_id::text, ARRAY['DIRECTION']::text[]) THEN
      RAISE EXCEPTION 'Seule la direction de l''établissement peut enregistrer un appareil'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_lic.is_current THEN
    RAISE EXCEPTION 'Licence remplacée ou archivée'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Licence non active'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.starts_at IS NOT NULL AND v_lic.starts_at > now() THEN
    RAISE EXCEPTION 'Licence pas encore active'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.expires_at IS NOT NULL AND v_lic.expires_at <= now() THEN
    RAISE EXCEPTION 'Licence expirée'
      USING ERRCODE = 'P0001';
  END IF;

  v_max := coalesce(v_lic.max_devices, 1);
  IF v_max < 1 THEN
    RAISE EXCEPTION 'Quota d''appareils invalide'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dev
    FROM public.devices
   WHERE device_identifier = v_clean_identifier
   FOR UPDATE;

  IF FOUND THEN
    IF v_dev.deleted_at IS NULL AND v_dev.status = 'ACTIVE'
       AND (v_dev.license_id IS DISTINCT FROM v_lic.id
            OR v_dev.school_id IS DISTINCT FROM v_lic.school_id) THEN
      RAISE EXCEPTION 'Appareil déjà associé à une autre licence'
        USING ERRCODE = '42501';
    END IF;

    IF v_dev.deleted_at IS NOT NULL OR v_dev.status <> 'ACTIVE' THEN
      SELECT count(*) INTO v_count
        FROM public.devices
       WHERE license_id = v_lic.id
         AND deleted_at IS NULL
         AND status = 'ACTIVE';

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Limite d''appareils atteinte pour cette licence'
          USING ERRCODE = 'P0001', DETAIL = 'DEVICE_LIMIT_REACHED';
      END IF;
    END IF;

    UPDATE public.devices
       SET school_id = v_lic.school_id,
           license_id = v_lic.id,
           device_name = coalesce(nullif(btrim(p_device_name), ''), device_name),
           platform = coalesce(nullif(btrim(p_platform), ''), platform),
           status = 'ACTIVE',
           deleted_at = NULL,
           last_seen_at = now(),
           updated_at = now()
     WHERE id = v_dev.id
     RETURNING id INTO v_device_id;
  ELSE
    SELECT count(*) INTO v_count
      FROM public.devices
     WHERE license_id = v_lic.id
       AND deleted_at IS NULL
       AND status = 'ACTIVE';

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Limite d''appareils atteinte pour cette licence'
        USING ERRCODE = 'P0001', DETAIL = 'DEVICE_LIMIT_REACHED';
    END IF;

    INSERT INTO public.devices (
      school_id, license_id, device_identifier, device_name, platform,
      status, last_seen_at
    ) VALUES (
      v_lic.school_id, v_lic.id, v_clean_identifier,
      nullif(btrim(p_device_name), ''), nullif(btrim(p_platform), ''),
      'ACTIVE', now()
    )
    RETURNING id INTO v_device_id;
  END IF;

  RETURN jsonb_build_object(
    'device_id', v_device_id,
    'device_identifier', v_clean_identifier,
    'license_id', v_lic.id,
    'school_id', v_lic.school_id,
    'max_devices', v_max
  );
END
$device_registration$;

REVOKE ALL ON FUNCTION public.register_or_reactivate_device(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_or_reactivate_device(uuid, text, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_device(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $device_release$
DECLARE
  v_user_id text := auth.uid()::text;
  v_dev public.devices%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Action réservée au SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dev
    FROM public.devices
   WHERE id = p_device_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appareil introuvable'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.devices
     SET status = 'REVOKED',
         deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   WHERE id = p_device_id
   RETURNING * INTO v_dev;

  INSERT INTO public.audit_logs (
    id, school_id, user_id, device_id, action, entity_type, entity_id,
    old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), v_dev.school_id, v_user_id::uuid, v_dev.id,
    'DEVICE_RELEASED', 'devices', v_dev.id::text,
    jsonb_build_object(
      'status', 'ACTIVE',
      'license_id', v_dev.license_id,
      'device_identifier', v_dev.device_identifier
    ),
    jsonb_build_object(
      'status', 'REVOKED',
      'license_id', v_dev.license_id,
      'device_identifier', v_dev.device_identifier,
      'deleted_at', v_dev.deleted_at
    ),
    now()
  );

  RETURN jsonb_build_object(
    'device_id', v_dev.id,
    'school_id', v_dev.school_id,
    'license_id', v_dev.license_id,
    'device_identifier', v_dev.device_identifier,
    'status', v_dev.status,
    'deleted_at', v_dev.deleted_at
  );
END
$device_release$;

REVOKE ALL ON FUNCTION public.release_device(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_device(uuid) TO authenticated, service_role;

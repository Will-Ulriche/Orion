-- ============================================================
-- LIC-02 : Cycle de vie des licences Orion
-- ------------------------------------------------------------
-- 1. Une seule licence courante par établissement (index partiel).
-- 2. Les anciennes licences restent dans l'historique (SUPERSEDED)
--    et ne peuvent jamais réautoriser l'accès.
-- 3. Le renouvellement est atomique : archivage de l'ancienne
--    courante + promotion de la nouvelle dans une seule transaction.
-- 4. Le drapeau is_current ne peut être modifié que par les RPC
--    SECURITY DEFINER de ce module (trigger de garde).
-- ============================================================

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false;

-- Backfill : au plus une licence courante par établissement.
-- Priorité à une licence ACTIVE, puis à la plus récente.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY school_id
           ORDER BY (status = 'ACTIVE') DESC,
                    COALESCE(starts_at, created_at, now()) DESC,
                    created_at DESC,
                    id DESC
         ) AS rn
  FROM public.licenses
)
UPDATE public.licenses l
SET is_current = true
FROM ranked
WHERE ranked.id = l.id AND ranked.rn = 1;

-- Tout historique ACTIVE non courant est archivé explicitement.
UPDATE public.licenses
SET status = 'SUPERSEDED', updated_at = now()
WHERE is_current = false AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_current_per_school
  ON public.licenses (school_id) WHERE is_current = true;

-- ── Garde du drapeau is_current ────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_license_current_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('orion.license_lifecycle', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Le drapeau is_current ne peut être modifié que via renew_license() ou archive_license()'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_license_current_flag ON public.licenses;
CREATE TRIGGER trg_license_current_flag
  BEFORE INSERT OR UPDATE OF is_current ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_license_current_flag();

-- ── RPC : renouvellement / création atomique ───────────────────
CREATE OR REPLACE FUNCTION public.renew_license(
  p_school_id uuid,
  p_license_key text,
  p_starts_at timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_max_devices integer DEFAULT 1,
  p_status text DEFAULT 'ACTIVE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_clean_key text := upper(trim(p_license_key));
  v_status text := upper(trim(coalesce(p_status, 'ACTIVE')));
  v_school public.schools%ROWTYPE;
  v_new public.licenses%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Action réservée au SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  IF v_clean_key !~ '^ORION-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' THEN
    RAISE EXCEPTION 'Format de clé de licence invalide'
      USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Statut de licence invalide'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_max_devices, 0) < 1 THEN
    RAISE EXCEPTION 'Le nombre d''appareils doit être supérieur à zéro'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_expires_at <= p_starts_at THEN
    RAISE EXCEPTION 'La date d''expiration doit être postérieure à la date de début'
      USING ERRCODE = '22023';
  END IF;

  -- Verrouille l'établissement pour sérialiser les renouvellements concurrents.
  SELECT * INTO v_school FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF v_school.id IS NULL THEN
    RAISE EXCEPTION 'Établissement introuvable'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.licenses WHERE license_key = v_clean_key) THEN
    RAISE EXCEPTION 'Cette clé de licence existe déjà'
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('orion.license_lifecycle', 'on', true);

  -- Archivage transactionnel de l'ancienne licence courante.
  UPDATE public.licenses
  SET is_current = false,
      status = CASE WHEN status = 'ACTIVE' THEN 'SUPERSEDED' ELSE status END,
      updated_at = now()
  WHERE school_id = p_school_id AND is_current = true;

  INSERT INTO public.licenses (
    school_id, license_key, status, issued_at, starts_at, expires_at,
    max_devices, is_current
  ) VALUES (
    p_school_id, v_clean_key, v_status, now(), p_starts_at, p_expires_at,
    p_max_devices, v_status = 'ACTIVE'
  )
  RETURNING * INTO v_new;

  PERFORM set_config('orion.license_lifecycle', 'off', true);
  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.renew_license(uuid, text, timestamptz, timestamptz, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_license(uuid, text, timestamptz, timestamptz, integer, text)
  TO authenticated, service_role;

-- ── RPC : archivage sans destruction ───────────────────────────
CREATE OR REPLACE FUNCTION public.archive_license(p_license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_lic public.licenses%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Action réservée au SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = p_license_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Licence introuvable'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('orion.license_lifecycle', 'on', true);

  UPDATE public.licenses
  SET is_current = false,
      status = CASE WHEN status = 'ACTIVE' OR status = 'SUPERSEDED'
                    THEN 'REVOKED' ELSE status END,
      updated_at = now()
  WHERE id = p_license_id
  RETURNING * INTO v_lic;

  PERFORM set_config('orion.license_lifecycle', 'off', true);
  RETURN to_jsonb(v_lic);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_license(uuid) TO authenticated, service_role;

-- ── Renforcement de activate_license : licence courante obligatoire ──
CREATE OR REPLACE FUNCTION public.activate_license(
  p_license_key text,
  p_school_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_lic record;
  v_is_super_admin boolean;
  v_user_schools text[];
  v_has_role boolean;
  v_clean_key text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour activer une licence'
      USING ERRCODE = '42501';
  END IF;

  v_clean_key := upper(trim(p_license_key));
  IF v_clean_key IS NULL OR v_clean_key = '' THEN
    RAISE EXCEPTION 'Clé de licence vide ou invalide'
      USING ERRCODE = '22023';
  END IF;

  v_is_super_admin := public.is_super_admin();

  IF NOT v_is_super_admin THEN
    SELECT array_agg(school_id::text) INTO v_user_schools
    FROM public.user_school_ids() AS school_id;

    IF v_user_schools IS NULL OR NOT (p_school_id = ANY(v_user_schools)) THEN
      RAISE EXCEPTION 'Non autorisé pour cet établissement'
        USING ERRCODE = '42501';
    END IF;

    v_has_role := public.has_school_role(p_school_id, ARRAY['DIRECTION']::text[]);
    IF NOT v_has_role THEN
      RAISE EXCEPTION 'Seule la direction de l''établissement peut activer la licence'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id, school_id, license_key, status, starts_at, expires_at, max_devices,
         is_current, created_at
  INTO v_lic
  FROM public.licenses
  WHERE license_key = v_clean_key;

  IF NOT FOUND OR v_lic.school_id::text <> p_school_id THEN
    RAISE EXCEPTION 'Clé de licence invalide, introuvable ou non attribuée à votre établissement'
      USING ERRCODE = 'P0002';
  END IF;

  -- Une licence archivée ne réautorise jamais l'accès, même si son statut
  -- historique était ACTIVE.
  IF NOT v_lic.is_current THEN
    RAISE EXCEPTION 'Cette licence a été remplacée et ne peut plus être activée'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.status = 'REVOKED' THEN
    RAISE EXCEPTION 'Cette clé de licence a été révoquée' USING ERRCODE = 'P0001';
  ELSIF v_lic.status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Cette clé de licence est suspendue' USING ERRCODE = 'P0001';
  ELSIF v_lic.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Cette clé de licence n''est pas active' USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.starts_at IS NOT NULL AND v_lic.starts_at > now() THEN
    RAISE EXCEPTION 'Cette clé de licence n''est pas encore active' USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.expires_at IS NOT NULL AND v_lic.expires_at <= now() THEN
    RAISE EXCEPTION 'Cette clé de licence est expirée' USING ERRCODE = 'P0001';
  END IF;

  RETURN to_jsonb(v_lic);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_license(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text) TO authenticated, service_role;

COMMENT ON COLUMN public.licenses.is_current IS
  'Vrai uniquement pour la licence courante de l''établissement. Les anciennes licences restent en historique.';

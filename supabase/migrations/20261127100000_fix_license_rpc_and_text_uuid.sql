-- ============================================================
-- 20261127100000 — Correction Complète & Définitive RPC Licences & Casts UUID/TEXT
-- ============================================================
-- Résout définitivement « operator does not exist: text = uuid » sur :
--   1. public.renew_license (création & renouvellement atomique)
--   2. public.archive_license (archivage logique)
--   3. public.is_super_admin
--   4. public.user_school_ids
--   5. public.has_school_role & check_user_has_role
--   6. public.can_manage_school
--   7. public.activate_license
--   8. Politiques RLS sur public.licenses et public.schools
-- ============================================================

-- ── 0. Garantie des valeurs par défaut sur les clés primaires (id) ──
-- Empêche l'erreur : null value in column "id" of relation "licenses" violates not-null constraint

DO $$
DECLARE
  v_col_type text;
BEGIN
  -- licenses.id
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'id';

  IF v_col_type = 'uuid' THEN
    EXECUTE 'ALTER TABLE public.licenses ALTER COLUMN id SET DEFAULT gen_random_uuid()';
  ELSIF v_col_type IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.licenses ALTER COLUMN id SET DEFAULT gen_random_uuid()::text';
  END IF;

  -- devices.id
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'id';

  IF v_col_type = 'uuid' THEN
    EXECUTE 'ALTER TABLE public.devices ALTER COLUMN id SET DEFAULT gen_random_uuid()';
  ELSIF v_col_type IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.devices ALTER COLUMN id SET DEFAULT gen_random_uuid()::text';
  END IF;
END $$;

-- ── 1. Helper is_super_admin() ───────────────────────────────

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id::text = ur.role_id::text
    WHERE ur.user_id::text = auth.uid()::text
      AND r.name = 'SUPER_ADMIN'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id::text = ur.user_id::text
          AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id::text = ur.user_id::text
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ── 2. Helper user_school_ids() ──────────────────────────────

CREATE OR REPLACE FUNCTION public.user_school_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.school_id::text
  FROM public.profiles p
  WHERE p.user_id::text = auth.uid()::text
    AND p.school_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = p.user_id::text
        AND u.status = 'ACTIVE'
    )
  UNION
  SELECT ur.school_id::text
  FROM public.user_roles ur
  WHERE ur.user_id::text = auth.uid()::text
    AND ur.school_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = ur.user_id::text
        AND u.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id::text = ur.user_id::text
        AND p.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.user_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_school_ids() TO authenticated, service_role;

-- ── 3. Helper has_school_role() ──────────────────────────────

CREATE OR REPLACE FUNCTION public.has_school_role(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id::text = ur.role_id::text
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.school_id::text = p_school_id::text
      AND r.name = ANY (p_roles)
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id::text = ur.user_id::text
          AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id::text = ur.user_id::text
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_role(text, text[]) TO authenticated, service_role;

-- ── 4. Helper check_user_has_role() ──────────────────────────

CREATE OR REPLACE FUNCTION public.check_user_has_role(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_school_role(p_school_id, p_roles);
$$;

REVOKE ALL ON FUNCTION public.check_user_has_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_user_has_role(text, text[]) TO authenticated, service_role;

-- ── 5. Helper can_manage_school() ────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_school(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin()
      OR (
        p_school_id::text IN (SELECT public.user_school_ids())
        AND public.has_school_role(p_school_id, p_roles)
      );
$$;

REVOKE ALL ON FUNCTION public.can_manage_school(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_school(text, text[]) TO authenticated, service_role;

-- ── 6. Trigger de garde is_current ───────────────────────────

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

-- ── 7. RPC : renew_license (Création & Renouvellement atomique) ──
-- IMPORTANT : Supprimer d'abord TOUTES les anciennes signatures pour éviter
-- l'erreur PostgREST : « Could not choose the best candidate function »

DROP FUNCTION IF EXISTS public.renew_license(uuid, text, timestamptz, timestamptz, integer, text);
DROP FUNCTION IF EXISTS public.renew_license(text, text, timestamptz, timestamptz, integer, text);

CREATE OR REPLACE FUNCTION public.renew_license(
  p_school_id text,
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
  v_old public.licenses%ROWTYPE;
  v_new public.licenses%ROWTYPE;
  v_device_count integer;
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

  -- 1. Verrouille l'établissement, puis sa licence courante
  SELECT * INTO v_school
    FROM public.schools
   WHERE id::text = p_school_id::text
   FOR UPDATE;

  IF v_school.id IS NULL THEN
    RAISE EXCEPTION 'Établissement introuvable'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_old
    FROM public.licenses
   WHERE school_id::text = p_school_id::text AND is_current = true
   FOR UPDATE;

  -- 2. Comptage des appareils actifs à transférer
  SELECT count(*) INTO v_device_count
    FROM (
      SELECT d.id
        FROM public.devices d
        JOIN public.licenses l ON l.id::text = d.license_id::text
       WHERE l.school_id::text = p_school_id::text
         AND d.school_id::text = p_school_id::text
         AND d.deleted_at IS NULL
         AND d.status = 'ACTIVE'
       FOR UPDATE OF d
    ) AS v_devices_to_transfer;

  -- 3. Contrôle du quota
  IF v_device_count > p_max_devices THEN
    RAISE EXCEPTION 'Quota insuffisant pour transférer les appareils actifs (% appareils pour un quota de %)',
      v_device_count, p_max_devices
      USING ERRCODE = 'P0001', DETAIL = 'DEVICE_LIMIT_REACHED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.licenses WHERE license_key = v_clean_key) THEN
    RAISE EXCEPTION 'Cette clé de licence existe déjà'
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('orion.license_lifecycle', 'on', true);

  -- 4. Archivage transactionnel de l'ancienne licence courante
  UPDATE public.licenses
  SET is_current = false,
      status = CASE WHEN status = 'ACTIVE' THEN 'SUPERSEDED' ELSE status END,
      updated_at = now()
  WHERE school_id::text = p_school_id::text AND is_current = true;

  -- 5. Création de la nouvelle licence courante (school_id = v_school.id garantit le bon type de colonne)
  INSERT INTO public.licenses (
    school_id, license_key, status, issued_at, starts_at, expires_at,
    max_devices, is_current
  ) VALUES (
    v_school.id, v_clean_key, v_status, now(), p_starts_at, p_expires_at,
    p_max_devices, v_status = 'ACTIVE'
  )
  RETURNING * INTO v_new;

  -- 6. Transfert des appareils actifs
  UPDATE public.devices d
     SET license_id = v_new.id,
         updated_at = now()
   WHERE d.school_id::text = p_school_id::text
     AND d.deleted_at IS NULL
     AND d.status = 'ACTIVE'
     AND d.license_id::text IS DISTINCT FROM v_new.id::text
     AND EXISTS (
       SELECT 1
         FROM public.licenses l
        WHERE l.id::text = d.license_id::text
          AND l.school_id::text = p_school_id::text
          AND l.is_current = false
     );

  PERFORM set_config('orion.license_lifecycle', 'off', true);
  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.renew_license(text, text, timestamptz, timestamptz, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_license(text, text, timestamptz, timestamptz, integer, text) TO authenticated, service_role;

-- ── 8. RPC : archive_license (Archivage logique sans suppression) ──

DROP FUNCTION IF EXISTS public.archive_license(uuid);
DROP FUNCTION IF EXISTS public.archive_license(text);

CREATE OR REPLACE FUNCTION public.archive_license(p_license_id text)
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

  SELECT * INTO v_lic
    FROM public.licenses
   WHERE id::text = p_license_id::text
   FOR UPDATE;

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
  WHERE id::text = p_license_id::text
  RETURNING * INTO v_lic;

  PERFORM set_config('orion.license_lifecycle', 'off', true);
  RETURN to_jsonb(v_lic);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_license(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_license(text) TO authenticated, service_role;

-- ── 9. RPC : activate_license ────────────────────────────────

DROP FUNCTION IF EXISTS public.activate_license(text, text);

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

    IF v_user_schools IS NULL OR NOT (p_school_id::text = ANY(v_user_schools)) THEN
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

  IF NOT FOUND OR v_lic.school_id::text <> p_school_id::text THEN
    RAISE EXCEPTION 'Clé de licence invalide, introuvable ou non attribuée à votre établissement'
      USING ERRCODE = 'P0002';
  END IF;

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

-- ── 10. Politiques RLS licenses & schools ─────────────────────

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.licenses FROM anon;
GRANT SELECT ON TABLE public.licenses TO authenticated;

DO $$
DECLARE
  v_policy text;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'licenses'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.licenses', v_policy);
  END LOOP;
END $$;

CREATE POLICY lic_select ON public.licenses
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR school_id::text IN (SELECT public.user_school_ids())
  );

CREATE POLICY lic_insert ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY lic_update ON public.licenses
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY lic_delete ON public.licenses
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schools FROM anon;
GRANT SELECT ON TABLE public.schools TO authenticated;

DO $$
DECLARE
  v_policy text;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schools'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.schools', v_policy);
  END LOOP;
END $$;

CREATE POLICY schools_select ON public.schools
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR id::text IN (SELECT public.user_school_ids())
  );

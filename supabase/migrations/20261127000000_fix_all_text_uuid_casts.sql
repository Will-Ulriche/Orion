-- ============================================================
-- 20261127000000 — Correction DÉFINITIVE « operator does not exist: text = uuid »
-- ============================================================
-- DIAGNOSTIC :
--   user_roles.user_id  → TEXT
--   users.id            → UUID
--   profiles.user_id    → UUID
--   auth.uid()          → UUID
--
-- Toutes les fonctions SECURITY DEFINER qui comparent user_roles.user_id
-- (text) avec des colonnes UUID doivent utiliser des casts ::text explicites.
--
-- Cette migration réécrit définitivement toutes les fonctions affectées.
-- Elle peut être réexécutée sans danger (CREATE OR REPLACE).
-- ============================================================

-- ── 1. is_super_admin() ─────────────────────────────────────────────────────

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
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()::text
      AND r.name = 'SUPER_ADMIN'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id::text = ur.user_id
          AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id::text = ur.user_id
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ── 2. user_school_ids() ─────────────────────────────────────────────────────

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
  WHERE ur.user_id = auth.uid()::text
    AND ur.school_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = ur.user_id
        AND u.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id::text = ur.user_id
        AND p.school_id::text = ur.school_id::text
        AND p.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.user_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_school_ids() TO authenticated, service_role;

-- ── 3. has_school_role() ─────────────────────────────────────────────────────

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
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()::text
      AND ur.school_id::text = p_school_id
      AND r.name = ANY (p_roles)
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id::text = ur.user_id
          AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id::text = ur.user_id
          AND p.school_id::text = p_school_id
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_role(text, text[]) TO authenticated, service_role;

-- ── 4. check_user_has_role() ─────────────────────────────────────────────────

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

-- ── 5. can_manage_school() ───────────────────────────────────────────────────

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
        p_school_id IN (SELECT public.user_school_ids())
        AND public.has_school_role(p_school_id, p_roles)
      );
$$;

REVOKE ALL ON FUNCTION public.can_manage_school(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_school(text, text[]) TO authenticated, service_role;

-- ── 6. Recréation des politiques RLS sur licenses ────────────────────────────
-- Supprime TOUTES les politiques existantes sur licenses et recrée proprement.

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

-- ── 7. Recréation de la politique RLS SELECT sur schools ─────────────────────
-- Assure que le JOIN licenses → schools ne lève pas d'erreur.

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

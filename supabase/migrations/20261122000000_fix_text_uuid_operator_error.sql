-- ============================================================
-- 20261122000000 — Correction « operator does not exist: text = uuid »
-- ============================================================
-- DIAGNOSTIC CONFIRMÉ :
--   user_roles.user_id  → TEXT  (pas UUID comme dans le schéma théorique)
--   users.id            → UUID
--   profiles.user_id    → UUID
--   auth.uid()          → UUID
--
-- Toute comparaison directe entre une colonne UUID et user_roles.user_id
-- sans cast explicite lève : « operator does not exist ».
-- Règle appliquée partout : cast explicite ::text sur les colonnes UUID
-- avant toute comparaison avec user_roles.user_id (text).
--
-- Correctifs :
--   1. Suppression des politiques sec007_* orphelines (jamais nettoyées
--      par la migration 20261118 qui a créé les sec08_*).
--   2. Réécriture des helpers SECURITY DEFINER avec casts ::text cohérents.
-- ============================================================

-- ── 1. Suppression des politiques sec007_* orphelines ──────────

DROP POLICY IF EXISTS sec007_licenses_select_own      ON public.licenses;
DROP POLICY IF EXISTS sec007_schools_select            ON public.schools;
DROP POLICY IF EXISTS sec007_users_select_self         ON public.users;
DROP POLICY IF EXISTS sec007_profiles_select_self      ON public.profiles;
DROP POLICY IF EXISTS sec007_profiles_select_managers  ON public.profiles;
DROP POLICY IF EXISTS sec007_user_roles_select_self    ON public.user_roles;
DROP POLICY IF EXISTS sec007_user_roles_select_managers ON public.user_roles;

DROP POLICY IF EXISTS super_admin_schools_all    ON public.schools;
DROP POLICY IF EXISTS super_admin_licenses_all   ON public.licenses;
DROP POLICY IF EXISTS super_admin_devices_all    ON public.devices;
DROP POLICY IF EXISTS super_admin_profiles_all   ON public.profiles;
DROP POLICY IF EXISTS super_admin_users_all      ON public.users;
DROP POLICY IF EXISTS super_admin_user_roles_all ON public.user_roles;

-- ── 2. is_super_admin() ─────────────────────────────────────────
-- ur.user_id est TEXT → cast auth.uid() en text, et les colonnes UUID
-- (users.id, profiles.user_id) en text avant comparaison.

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

-- ── 3. user_school_ids() ────────────────────────────────────────

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

-- ── 4. has_school_role() ────────────────────────────────────────

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

-- ── 5. check_user_has_role() ────────────────────────────────────

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

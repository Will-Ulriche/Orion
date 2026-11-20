-- ============================================================
-- 20261120000000 — Durcissement global du statut public.users
-- ============================================================
-- Audit des migrations déjà déployées : 7 garde-fous permissifs de la forme
--   NOT EXISTS (SELECT 1 FROM public.users u
--               WHERE u.id = ... AND u.status <> 'ACTIVE')
-- dans is_super_admin(), user_school_ids() (2 branches), has_school_role()
-- et check_user_has_role() (versions initiales également remplacées ici).
-- Aucune politique RLS ne porte directement ce mécanisme : elles délèguent
-- toutes à ces helpers. Les politiques RLS existantes ne sont pas modifiées.
--
-- Avec la logique à trois valeurs de SQL, u.status IS NULL rend
-- `u.status <> 'ACTIVE'` UNKNOWN : le NOT EXISTS devient VRAI et un compte
-- sans statut conserve indûment ses privilèges.
--
-- Règle de nettoyage explicite : un statut NULL est un statut inconnu, donc
-- immédiatement révoqué et basculé en 'INACTIVE'. Aucune ligne n'est
-- automatiquement activée : aucune élévation de privilège n'est possible.
--
-- Statuts autorisés : 'ACTIVE' (seul état autorisant l'accès), 'INACTIVE'
-- (état révoqué utilisé par les tests) et 'SUSPENDED' (état révoqué utilisé
-- par l'administration). Les fonctions exigent désormais positivement
-- l'existence d'une ligne public.users avec status = 'ACTIVE'.
-- ============================================================

UPDATE public.users
   SET status = 'INACTIVE'
 WHERE status IS NULL;

ALTER TABLE public.users
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_status_allowed;

ALTER TABLE public.users
  ADD CONSTRAINT users_status_allowed
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'));

-- is_super_admin() : le rôle SUPER_ADMIN ne suffit plus, le compte doit
-- exister et être ACTIVE, en plus du profil non supprimé logiquement.
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
    WHERE ur.user_id::text = auth.uid()::text
      AND r.name = 'SUPER_ADMIN'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = ur.user_id
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- user_school_ids() : les deux branches (profil et rôles) exigent un compte
-- ACTIVE existant ; les contrôles de profil actif existants sont conservés.
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
      WHERE u.id = p.user_id AND u.status = 'ACTIVE'
    )
  UNION
  SELECT ur.school_id::text
  FROM public.user_roles ur
  WHERE ur.user_id::text = auth.uid()::text
    AND ur.school_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = ur.user_id AND u.status = 'ACTIVE'
    )
    -- Un rôle ne suffit pas : le profil correspondant doit encore exister.
    -- Sinon un profil soft-deleted conserverait l'accès via user_roles.
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = ur.user_id
        AND p.school_id::text = ur.school_id::text
        AND p.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.user_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_school_ids() TO authenticated, service_role;

-- has_school_role() : présence obligatoire d'un compte ACTIVE.
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
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.school_id::text = p_school_id
      AND r.name = ANY (p_roles)
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = ur.user_id
          AND p.school_id::text = ur.school_id::text
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_role(text, text[]) TO authenticated, service_role;

-- check_user_has_role() : présence obligatoire d'un compte ACTIVE.
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
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.school_id::text = p_school_id
      AND r.name = ANY (p_roles)
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = ur.user_id
          AND p.school_id::text = ur.school_id::text
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.check_user_has_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_user_has_role(text, text[]) TO authenticated, service_role;

-- Garde-fou : aucune fonction publique ne doit conserver l'ancien mécanisme
-- permissif sur public.users.status (les helpers ci-dessus sont remplacés).
DO $status_guard$
DECLARE
  v_leftovers integer;
BEGIN
  SELECT count(*) INTO v_leftovers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_get_functiondef(p.oid) LIKE '%public.users u%'
    AND pg_get_functiondef(p.oid) LIKE '%status <> %ACTIVE%';

  IF v_leftovers > 0 THEN
    RAISE EXCEPTION 'Durcissement incomplet : % fonction(s) publique(s) utilisent encore NOT EXISTS(... users.status <> ''ACTIVE'')', v_leftovers;
  END IF;
END
$status_guard$;

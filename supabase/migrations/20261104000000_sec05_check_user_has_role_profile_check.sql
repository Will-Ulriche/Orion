-- ============================================================
-- ORI-SEC-05 : Correction de check_user_has_role — vérification du profil actif
-- ============================================================
-- Vulnérabilité confirmée (SERVER-AUTH-03) :
--   public.check_user_has_role(text, text[]) ne vérifie pas l'existence
--   d'un profil actif (deleted_at IS NULL) avant d'accorder un rôle.
--   Contrairement à public.has_school_role(), un utilisateur dont le
--   profil est soft-deleté conserve l'accès via user_roles.
--   Cette fonction est utilisée dans les politiques RLS de
--   fee_structures et payments (SELECT, INSERT, UPDATE, DELETE).
--
-- Correction : ajout de la vérification d'existence d'un profil
-- actif correspondant au même utilisateur et au même établissement,
-- identique à celle de public.has_school_role().
--
-- Aucune politique RLS n'est modifiée.
-- Aucune autre fonction n'est modifiée.
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : Redéfinition de public.check_user_has_role
-- ============================================================
-- Ajout de la vérification du profil actif (deleted_at IS NULL)
-- correspondant au même utilisateur et établissement.
--
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
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
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

-- ============================================================
-- ÉTAPE 2 : Vérifications post-migration (informatives)
-- ============================================================
-- Aucune politique RLS n'est modifiée.
-- La fonction est utilisée dans les 8 politiques RLS de
-- fee_structures et payments (SELECT, INSERT, UPDATE, DELETE).
-- ============================================================
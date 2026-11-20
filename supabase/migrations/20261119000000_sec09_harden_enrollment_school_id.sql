-- ============================================================
-- ORI-SEC-09 : durcissement de enrollment_school_id()
-- ------------------------------------------------------------
-- La fonction renvoyait le school_id de n'importe quelle inscription
-- à tout rôle authenticated (SECURITY DEFINER sans contrôle), ce qui
-- constituait un oracle d'identifiants d'établissement.
--
-- Elle est désormais limitée au SUPER_ADMIN ou aux établissements de
-- l'appelant (profil actif + compte ACTIVE via user_school_ids()).
-- Les politiques SEC007 de enrollment_history continuent de fonctionner :
-- un appel non autorisé renvoie NULL, ce qui fait échouer
-- can_manage_school(NULL, ...) et donc le refus RLS attendu.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enrollment_school_id(p_enrollment_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.school_id::text
  FROM public.enrollments e
  WHERE e.id::text = p_enrollment_id
    AND (
      public.is_super_admin()
      OR e.school_id::text IN (SELECT public.user_school_ids())
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.enrollment_school_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_school_id(text) TO authenticated, service_role;

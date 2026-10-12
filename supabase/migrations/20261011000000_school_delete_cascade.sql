-- ============================================================
-- Suppression complète d'un établissement (espace SUPER_ADMIN)
-- Fonction SECURITY DEFINER : le propriétaire (postgres) contourne
-- les politiques RLS des tables filles (academic_years, students,
-- classes, enrollments, audit_logs… qui n'ont pas de policy DELETE),
-- ce qui garantit que la cascade ON DELETE CASCADE fonctionne
-- quel que soit le client (clé service ou session authentifiée).
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_school_cascade(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.schools WHERE id = p_school_id;
END;
$$;

-- Exécution réservée aux clients authentifiés (super admin) et au service
REVOKE EXECUTE ON FUNCTION public.delete_school_cascade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_cascade(uuid) TO authenticated, service_role;

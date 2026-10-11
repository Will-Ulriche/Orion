-- ============================================================
-- Espace SUPER_ADMIN — gouvernance des établissements & licences
-- Accorde au SUPER_ADMIN la gestion des écoles de base, des
-- licences, des appareils et des attributions (tables cloud).
-- ============================================================

-- 1. Rendre school_id optionnel dans user_roles pour permettre un SUPER_ADMIN global
ALTER TABLE public.user_roles ALTER COLUMN school_id DROP NOT NULL;

-- 2. Fonction utilitaire : l'utilisateur courant est-il SUPER_ADMIN ?
-- SECURITY DEFINER pour traverser les RLS de user_roles / roles.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::text = auth.uid()::text
      AND r.name = 'SUPER_ADMIN'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 3. Établissements : le SUPER_ADMIN peut tout gérer
DROP POLICY IF EXISTS "super_admin_schools_all" ON public.schools;
CREATE POLICY "super_admin_schools_all" ON public.schools
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 4. Licences : le SUPER_ADMIN peut tout gérer
DROP POLICY IF EXISTS "super_admin_licenses_all" ON public.licenses;
CREATE POLICY "super_admin_licenses_all" ON public.licenses
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 5. Appareils : le SUPER_ADMIN peut tout gérer
DROP POLICY IF EXISTS "super_admin_devices_all" ON public.devices;
CREATE POLICY "super_admin_devices_all" ON public.devices
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 6. Profils & Utilisateurs : le SUPER_ADMIN peut tout administrer
DROP POLICY IF EXISTS "super_admin_profiles_all" ON public.profiles;
CREATE POLICY "super_admin_profiles_all" ON public.profiles
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_users_all" ON public.users;
CREATE POLICY "super_admin_users_all" ON public.users
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 7. Attributions de rôles : le SUPER_ADMIN peut tout gérer,
-- et chaque utilisateur peut lire ses propres attributions
DROP POLICY IF EXISTS "super_admin_user_roles_all" ON public.user_roles;
CREATE POLICY "super_admin_user_roles_all" ON public.user_roles
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "own_user_roles_select" ON public.user_roles;
CREATE POLICY "own_user_roles_select" ON public.user_roles
    FOR SELECT
    USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "roles_read_authenticated" ON public.roles;
CREATE POLICY "roles_read_authenticated" ON public.roles
    FOR SELECT
    USING (auth.role() = 'authenticated');

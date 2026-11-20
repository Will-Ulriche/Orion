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
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
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

REVOKE ALL ON TABLE public.schools, public.licenses, public.devices, public.profiles, public.users, public.user_roles FROM anon;

DROP POLICY IF EXISTS "super_admin_schools_all" ON public.schools;
DROP POLICY IF EXISTS sec08_schools_select ON public.schools;
DROP POLICY IF EXISTS sec08_schools_insert ON public.schools;
DROP POLICY IF EXISTS sec08_schools_update ON public.schools;
DROP POLICY IF EXISTS sec08_schools_delete ON public.schools;
CREATE POLICY sec08_schools_select ON public.schools FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_schools_insert ON public.schools FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_schools_update ON public.schools FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_schools_delete ON public.schools FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_licenses_all" ON public.licenses;
DROP POLICY IF EXISTS sec08_licenses_select ON public.licenses;
DROP POLICY IF EXISTS sec08_licenses_insert ON public.licenses;
DROP POLICY IF EXISTS sec08_licenses_update ON public.licenses;
DROP POLICY IF EXISTS sec08_licenses_delete ON public.licenses;
CREATE POLICY sec08_licenses_select ON public.licenses FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_licenses_insert ON public.licenses FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_licenses_update ON public.licenses FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_licenses_delete ON public.licenses FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_devices_all" ON public.devices;
DROP POLICY IF EXISTS sec08_devices_select ON public.devices;
DROP POLICY IF EXISTS sec08_devices_insert ON public.devices;
DROP POLICY IF EXISTS sec08_devices_update ON public.devices;
DROP POLICY IF EXISTS sec08_devices_delete ON public.devices;
CREATE POLICY sec08_devices_select ON public.devices FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_devices_insert ON public.devices FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_devices_update ON public.devices FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_devices_delete ON public.devices FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_profiles_all" ON public.profiles;
DROP POLICY IF EXISTS sec08_profiles_select ON public.profiles;
DROP POLICY IF EXISTS sec08_profiles_insert ON public.profiles;
DROP POLICY IF EXISTS sec08_profiles_update ON public.profiles;
DROP POLICY IF EXISTS sec08_profiles_delete ON public.profiles;
CREATE POLICY sec08_profiles_select ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_profiles_update ON public.profiles FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_profiles_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_users_all" ON public.users;
DROP POLICY IF EXISTS sec08_users_select ON public.users;
DROP POLICY IF EXISTS sec08_users_insert ON public.users;
DROP POLICY IF EXISTS sec08_users_update ON public.users;
DROP POLICY IF EXISTS sec08_users_delete ON public.users;
CREATE POLICY sec08_users_select ON public.users FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_users_insert ON public.users FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_users_update ON public.users FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_users_delete ON public.users FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_user_roles_all" ON public.user_roles;
DROP POLICY IF EXISTS sec08_user_roles_select ON public.user_roles;
DROP POLICY IF EXISTS sec08_user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS sec08_user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS sec08_user_roles_delete ON public.user_roles;
CREATE POLICY sec08_user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY sec08_user_roles_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_user_roles_update ON public.user_roles FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY sec08_user_roles_delete ON public.user_roles FOR DELETE TO authenticated USING (public.is_super_admin());

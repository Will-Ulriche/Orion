BEGIN;

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
    WHERE schemaname = 'public'
      AND tablename = 'licenses'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.licenses', v_policy);
  END LOOP;
END $$;

CREATE POLICY sec08_licenses_select ON public.licenses
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR school_id::text IN (SELECT public.user_school_ids())
  );

DO $$
DECLARE
  v_policy text;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.licenses', v_policy);
  END LOOP;
END $$;

CREATE POLICY sec08_licenses_insert ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY sec08_licenses_update ON public.licenses
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY sec08_licenses_delete ON public.licenses
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

COMMIT;

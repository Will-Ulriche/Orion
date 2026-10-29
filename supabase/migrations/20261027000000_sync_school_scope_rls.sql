-- Politiques RLS nécessaires à la synchronisation avec la clé anon + JWT utilisateur.
-- Sans ces politiques, les tables élèves/classes (RLS activé, aucune policy)
-- n'étaient accessibles qu'avec service_role.

CREATE OR REPLACE FUNCTION public.user_school_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id::text
  FROM public.profiles
  WHERE user_id::text = auth.uid()::text
    AND school_id IS NOT NULL
  UNION
  SELECT school_id::text
  FROM public.user_roles
  WHERE user_id::text = auth.uid()::text
    AND school_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.user_school_ids() TO authenticated;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'academic_years',
        'students',
        'classes',
        'enrollments',
        'fee_structures',
        'payments'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_school_scope', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR ALL
             TO authenticated
             USING (
                 public.is_super_admin()
                 OR school_id::text IN (SELECT public.user_school_ids())
             )
             WITH CHECK (
                 public.is_super_admin()
                 OR school_id::text IN (SELECT public.user_school_ids())
             )',
            t || '_school_scope', t
        );
    END LOOP;
END $$;

DROP POLICY IF EXISTS enrollment_history_school_scope ON public.enrollment_history;
CREATE POLICY enrollment_history_school_scope ON public.enrollment_history
    FOR ALL
    TO authenticated
    USING (
        public.is_super_admin()
        OR enrollment_id IN (
            SELECT e.id FROM public.enrollments e
            WHERE e.school_id::text IN (SELECT public.user_school_ids())
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR enrollment_id IN (
            SELECT e.id FROM public.enrollments e
            WHERE e.school_id::text IN (SELECT public.user_school_ids())
        )
    );

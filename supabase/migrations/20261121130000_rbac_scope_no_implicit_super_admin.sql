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
  SELECT p_school_id IN (SELECT public.user_school_ids())
     AND public.has_school_role(p_school_id, p_roles);
$$;

REVOKE ALL ON FUNCTION public.can_manage_school(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_school(text, text[]) TO authenticated, service_role;

DO $$
DECLARE
  cfg record;
  v_read_expr text;
  v_write_expr text;
BEGIN
  FOR cfg IN
    SELECT *
    FROM (VALUES
      ('academic_years',       NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('students',             NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('classes',              NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('enrollments',          NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('subjects',             NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('grade_types',          NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('grading_periods',      NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('class_subjects',       NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('teacher_assignments',  NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('grades',               NULL::text[],                                    ARRAY['DIRECTION','PROFESSEUR']::text[]),
      ('fee_structures',       ARRAY['DIRECTION','COMPTABLE']::text[],           ARRAY['DIRECTION','COMPTABLE']::text[]),
      ('payments',             ARRAY['DIRECTION','COMPTABLE']::text[],           ARRAY['DIRECTION','COMPTABLE']::text[]),
      ('staff',                ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION']::text[]),
      ('sections',             NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('levels',               NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('series',               NULL::text[],                                    ARRAY['DIRECTION']::text[]),
      ('library_categories',   ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_books',        ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_copies',       ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_readers',      ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_loans',        ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_returns',      ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_penalties',    ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_reservations', ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_settings',     ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[])
    ) AS v(table_name, read_roles, write_roles)
  LOOP
    IF to_regclass('public.' || cfg.table_name) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = cfg.table_name
        AND column_name = 'school_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cfg.table_name || '_school_scope', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Permettre tout aux utilisateurs authentifiés', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cfg.table_name || '_select', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cfg.table_name || '_insert', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cfg.table_name || '_update', cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', cfg.table_name || '_delete', cfg.table_name);

    IF cfg.read_roles IS NULL THEN
      v_read_expr := 'school_id::text IN (SELECT public.user_school_ids())';
    ELSE
      v_read_expr := format(
        'public.can_manage_school(school_id::text, %L::text[])',
        cfg.read_roles::text
      );
    END IF;

    v_write_expr := format(
      'public.can_manage_school(school_id::text, %L::text[])',
      cfg.write_roles::text
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      cfg.table_name || '_select', cfg.table_name, v_read_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      cfg.table_name || '_insert', cfg.table_name, v_write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      cfg.table_name || '_update', cfg.table_name, v_write_expr, v_write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      cfg.table_name || '_delete', cfg.table_name, v_write_expr
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS enrollment_history_school_scope ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_select ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_insert ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_update ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_delete ON public.enrollment_history;

ALTER TABLE public.enrollment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY sec007_enrollment_history_select ON public.enrollment_history
  FOR SELECT TO authenticated
  USING (
    public.enrollment_school_id(enrollment_id::text) IN (SELECT public.user_school_ids())
  );

CREATE POLICY sec007_enrollment_history_insert ON public.enrollment_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION','SECRETAIRE']::text[]
    )
  );

CREATE POLICY sec007_enrollment_history_update ON public.enrollment_history
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION','SECRETAIRE']::text[]
    )
  )
  WITH CHECK (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION','SECRETAIRE']::text[]
    )
  );

CREATE POLICY sec007_enrollment_history_delete ON public.enrollment_history
  FOR DELETE TO authenticated
  USING (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION','SECRETAIRE']::text[]
    )
  );

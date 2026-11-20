CREATE OR REPLACE FUNCTION public.delete_school_cascade(p_school_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_table text;
    v_tables text[] := ARRAY[
        'library_returns',
        'library_penalties',
        'library_reservations',
        'library_loans',
        'library_copies',
        'library_readers',
        'library_books',
        'library_categories',
        'library_settings',
        'grades',
        'teacher_assignments',
        'class_subjects',
        'grading_periods',
        'grade_types',
        'subjects',
        'payments',
        'fee_structures',
        'enrollment_history',
        'enrollments',
        'classes',
        'students',
        'staff',
        'series',
        'levels',
        'sections',
        'academic_years',
        'audit_logs',
        'devices',
        'licenses',
        'user_roles',
        'profiles'
    ];
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'ORI-SEC-007: privileges SUPER_ADMIN requis'
            USING ERRCODE = '42501';
    END IF;

    FOR v_table IN SELECT unnest(v_tables) LOOP
        BEGIN
            IF v_table = 'enrollment_history' THEN
                EXECUTE
                    'DELETE FROM public.enrollment_history
                      WHERE enrollment_id::text IN (
                                SELECT id::text FROM public.enrollments
                                WHERE school_id::text = $1
                            )
                         OR academic_year_id::text IN (
                                SELECT id::text FROM public.academic_years
                                WHERE school_id::text = $1
                            )'
                    USING p_school_id;
            ELSE
                EXECUTE format('DELETE FROM public.%I WHERE school_id::text = $1', v_table)
                    USING p_school_id;
            END IF;
        EXCEPTION
            WHEN undefined_table  THEN NULL;
            WHEN undefined_column THEN NULL;
        END;
    END LOOP;

    DELETE FROM public.schools WHERE id::text = p_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_school_cascade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_cascade(text) TO authenticated, service_role;

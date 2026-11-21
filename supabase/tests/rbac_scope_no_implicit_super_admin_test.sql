BEGIN;

DO $rbac_scope$
DECLARE
  v_bad text[] := ARRAY[]::text[];
  v_def text;
  v_rec record;
BEGIN
  SELECT pg_get_functiondef(oid)
  INTO v_def
  FROM pg_proc
  WHERE oid = to_regprocedure('public.can_manage_school(text, text[])');

  IF v_def IS NULL OR v_def LIKE '%is_super_admin%' THEN
    v_bad := array_append(v_bad, 'can_manage_school');
  END IF;

  FOR v_rec IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'academic_years','students','classes','enrollments','subjects',
        'grade_types','grading_periods','class_subjects','teacher_assignments',
        'grades','fee_structures','payments','staff','sections','levels','series'
      ])
  LOOP
    IF coalesce(v_rec.qual, '') LIKE '%is_super_admin%'
       OR coalesce(v_rec.with_check, '') LIKE '%is_super_admin%' THEN
      v_bad := array_append(v_bad, v_rec.tablename || ':' || v_rec.policyname);
    END IF;
  END LOOP;

  FOR v_rec IN
    SELECT policyname, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grades'
      AND cmd IN ('INSERT', 'UPDATE')
  LOOP
    IF coalesce(v_rec.with_check, '') NOT LIKE '%PROFESSEUR%'
       OR coalesce(v_rec.with_check, '') LIKE '%SECRETAIRE%' THEN
      v_bad := array_append(v_bad, 'grades:' || v_rec.policyname);
    END IF;
  END LOOP;

  FOR v_rec IN
    SELECT tablename, policyname, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('fee_structures', 'payments')
      AND cmd IN ('INSERT', 'UPDATE')
  LOOP
    IF coalesce(v_rec.with_check, '') NOT LIKE '%COMPTABLE%'
       OR coalesce(v_rec.with_check, '') LIKE '%SECRETAIRE%'
       OR coalesce(v_rec.with_check, '') LIKE '%PROFESSEUR%' THEN
      v_bad := array_append(v_bad, v_rec.tablename || ':' || v_rec.policyname);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schools'
      AND policyname = 'sec08_schools_select'
  ) THEN
    v_bad := array_append(v_bad, 'sec08_schools_select');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'grades'
      AND c.relrowsecurity
  ) THEN
    v_bad := array_append(v_bad, 'grades:RLS');
  END IF;

  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'ÉCHEC RBAC RLS : %', v_bad;
  END IF;

  RAISE NOTICE 'OK — RLS RBAC conforme';
END
$rbac_scope$;

ROLLBACK;

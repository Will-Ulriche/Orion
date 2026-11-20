-- ============================================================
-- Tests — migration non destructive des inscriptions Supabase
-- ============================================================
-- À exécuter sur une base Supabase de TEST après
-- 20260929000000_students_classes_enrollments.sql.
-- Le script termine par ROLLBACK.
-- ============================================================

BEGIN;

DO $legacy_enrollment_schema$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.enrollments_legacy_v1') IS NULL THEN
    v_missing := array_append(v_missing, 'table public.enrollments_legacy_v1');
  END IF;

  IF to_regclass('public.enrollment_history_legacy_v1') IS NULL THEN
    v_missing := array_append(v_missing, 'table public.enrollment_history_legacy_v1');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrollments'
      AND column_name = 'legacy_user_id'
  ) THEN
    v_missing := array_append(v_missing, 'column enrollments.legacy_user_id');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrollment_history'
      AND column_name = 'legacy_enrollment_id'
  ) THEN
    v_missing := array_append(v_missing, 'column enrollment_history.legacy_enrollment_id');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrollment_history'
      AND column_name = 'legacy_status'
  ) THEN
    v_missing := array_append(v_missing, 'column enrollment_history.legacy_status');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrollment_history'
      AND column_name = 'legacy_notes'
  ) THEN
    v_missing := array_append(v_missing, 'column enrollment_history.legacy_notes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'enrollments'
      AND indexname = 'idx_student_yearly_enrollment'
  ) THEN
    v_missing := array_append(v_missing, 'index idx_student_yearly_enrollment');
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.enrollments'::regclass) THEN
    v_missing := array_append(v_missing, 'RLS public.enrollments');
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.enrollment_history'::regclass) THEN
    v_missing := array_append(v_missing, 'RLS public.enrollment_history');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC : objets absents : %', array_to_string(v_missing, ', ');
  END IF;

  IF (SELECT count(*) FROM public.enrollments_legacy_v1) <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : la table backup enrollments_legacy_v1 doit être vide sur une base vierge';
  END IF;

  IF (SELECT count(*) FROM public.enrollment_history_legacy_v1) <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : la table backup enrollment_history_legacy_v1 doit être vide sur une base vierge';
  END IF;
END $legacy_enrollment_schema$;

ROLLBACK;

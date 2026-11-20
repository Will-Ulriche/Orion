-- ============================================================
-- ORI-SEC-09 — Contrôle du catalogue RLS et des politiques résiduelles
-- ------------------------------------------------------------
-- À exécuter sur une base Supabase de TEST, après application de
-- toutes les migrations. Le script termine par ROLLBACK.
--
-- Vérifie :
--  1. RLS activé sur toutes les tables métier ;
--  2. aucune ancienne politique permissive résiduelle ;
--  3. la liste exacte des politiques attendues par table (détecte
--     les politiques supplémentaires qui s'ORent avec sec08_*) ;
--  4. aucun privilège anon sur les tables et helpers ;
--  5. durcissement de enrollment_school_id() (SEC09).
-- ============================================================

BEGIN;

CREATE TEMP TABLE sec09_expected (t text, p text) ON COMMIT DROP;

DO $sec09$
DECLARE
  v_table text;
  v_cmd text;
  v_policy text;
  v_rec record;
  v_missing text[] := ARRAY[]::text[];
  v_unexpected text[] := ARRAY[]::text[];
  v_legacy text[] := ARRAY[]::text[];
  v_tables text[] := ARRAY[
    'roles', 'schools', 'licenses', 'devices', 'profiles', 'users', 'user_roles',
    'students', 'classes', 'academic_years', 'enrollments', 'enrollment_history',
    'subjects', 'grade_types', 'grading_periods', 'class_subjects',
    'teacher_assignments', 'grades', 'staff', 'sections', 'levels', 'series',
    'fee_structures', 'payments', 'audit_logs',
    'library_categories', 'library_books', 'library_copies', 'library_readers',
    'library_loans', 'library_returns', 'library_penalties',
    'library_reservations', 'library_settings'
  ];
  v_generic text[] := ARRAY[
    'students', 'classes', 'academic_years', 'enrollments', 'subjects',
    'grade_types', 'grading_periods', 'class_subjects', 'teacher_assignments',
    'grades', 'staff', 'sections', 'levels', 'series', 'fee_structures', 'payments',
    'library_categories', 'library_books', 'library_copies', 'library_readers',
    'library_loans', 'library_returns', 'library_penalties',
    'library_reservations', 'library_settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
    ) THEN
      v_missing := array_append(v_missing, 'RLS:' || v_table);
    END IF;
  END LOOP;

  SELECT array_agg(schemaname || '.' || tablename || ':' || policyname)
  INTO v_legacy
  FROM pg_policies
  WHERE (schemaname = 'public' AND (
      policyname = 'Permettre tout aux utilisateurs authentifiés'
      OR policyname ~ '_school_scope$'
      OR policyname ~ '^super_admin_.*_all$'
      OR policyname IN (
        'schools_read_own', 'roles_read_authenticated', 'own_user_roles_select',
        'Les utilisateurs peuvent voir leur propre profil',
        'fee_structures_read', 'fee_structures_write',
        'payments_read', 'payments_write'
      )
    ))
    OR (schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('staff_photos_public_read', 'student_photos_public_read'));
  IF cardinality(coalesce(v_legacy, ARRAY[]::text[])) > 0 THEN
    RAISE EXCEPTION 'Anciennes politiques permissives résiduelles : %', v_legacy;
  END IF;

  FOREACH v_table IN ARRAY v_generic LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH v_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      v_policy := v_table || '_' || lower(v_cmd);
      INSERT INTO sec09_expected VALUES (v_table, v_policy);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
          AND policyname = v_policy AND cmd = v_cmd
          AND 'authenticated' = ANY(roles)
      ) THEN
        v_missing := array_append(v_missing, v_table || ':' || v_policy);
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO sec09_expected VALUES
    ('roles', 'sec007_roles_select'),
    ('schools', 'sec007_schools_select'),
    ('schools', 'sec08_schools_select'),
    ('schools', 'sec08_schools_insert'),
    ('schools', 'sec08_schools_update'),
    ('schools', 'sec08_schools_delete'),
    ('licenses', 'sec007_licenses_select_own'),
    ('licenses', 'sec08_licenses_select'),
    ('licenses', 'sec08_licenses_insert'),
    ('licenses', 'sec08_licenses_update'),
    ('licenses', 'sec08_licenses_delete'),
    ('devices', 'sec08_devices_select'),
    ('devices', 'sec08_devices_insert'),
    ('devices', 'sec08_devices_update'),
    ('devices', 'sec08_devices_delete'),
    ('profiles', 'sec007_profiles_select_self'),
    ('profiles', 'sec007_profiles_select_managers'),
    ('profiles', 'sec08_profiles_select'),
    ('profiles', 'sec08_profiles_insert'),
    ('profiles', 'sec08_profiles_update'),
    ('profiles', 'sec08_profiles_delete'),
    ('users', 'sec007_users_select_self'),
    ('users', 'sec08_users_select'),
    ('users', 'sec08_users_insert'),
    ('users', 'sec08_users_update'),
    ('users', 'sec08_users_delete'),
    ('user_roles', 'sec007_user_roles_select_self'),
    ('user_roles', 'sec007_user_roles_select_managers'),
    ('user_roles', 'sec08_user_roles_select'),
    ('user_roles', 'sec08_user_roles_insert'),
    ('user_roles', 'sec08_user_roles_update'),
    ('user_roles', 'sec08_user_roles_delete'),
    ('enrollment_history', 'sec007_enrollment_history_select'),
    ('enrollment_history', 'sec007_enrollment_history_insert'),
    ('enrollment_history', 'sec007_enrollment_history_update'),
    ('enrollment_history', 'sec007_enrollment_history_delete');

  FOR v_rec IN
    SELECT e.t, e.p
    FROM sec09_expected e
    WHERE to_regclass('public.' || e.t) IS NOT NULL
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_rec.t
        AND policyname = v_rec.p
    ) THEN
      v_missing := array_append(v_missing, v_rec.t || ':' || v_rec.p);
    END IF;
  END LOOP;

  SELECT array_agg(po.tablename || ':' || po.policyname)
  INTO v_unexpected
  FROM pg_policies po
  WHERE po.schemaname = 'public'
    AND po.tablename = ANY(v_tables)
    AND NOT EXISTS (
      SELECT 1 FROM sec09_expected e
      WHERE e.t = po.tablename AND e.p = po.policyname
    );
  IF cardinality(coalesce(v_unexpected, ARRAY[]::text[])) > 0 THEN
    RAISE EXCEPTION 'Politiques non attendues (risque d''élargissement par OR) : %', v_unexpected;
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Politiques/RLS manquantes : %', v_missing;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE') THEN
      v_unexpected := array_append(v_unexpected, 'anon:' || v_table);
    END IF;
  END LOOP;

  FOREACH v_policy IN ARRAY ARRAY[
    'public.is_super_admin()',
    'public.user_school_ids()',
    'public.has_school_role(text, text[])',
    'public.can_manage_school(text, text[])',
    'public.check_user_has_role(text, text[])',
    'public.enrollment_school_id(text)'
  ] LOOP
    IF to_regprocedure(v_policy) IS NOT NULL THEN
      IF has_function_privilege('anon', v_policy, 'EXECUTE') THEN
        v_unexpected := array_append(v_unexpected, 'anon EXECUTE:' || v_policy);
      END IF;
    END IF;
  END LOOP;
  IF cardinality(v_unexpected) > 0 THEN
    RAISE EXCEPTION 'Privilèges inattendus : %', v_unexpected;
  END IF;

  IF to_regprocedure('public.enrollment_school_id(text)') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_proc
       WHERE oid = to_regprocedure('public.enrollment_school_id(text)')
         AND prosecdef
         AND pg_get_functiondef(oid) LIKE '%user_school_ids%'
     ) THEN
    RAISE EXCEPTION 'enrollment_school_id() non durcie (SEC09 absente)';
  END IF;

  RAISE NOTICE 'OK — catalogue RLS SEC09 conforme';
END
$sec09$;

ROLLBACK;

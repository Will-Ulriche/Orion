-- ============================================================
-- ORI-SEC-007 — Tests RLS et isolation multi-établissement
-- ------------------------------------------------------------
-- À exécuter sur une base Supabase de TEST (jamais en production),
-- après application de :
--   supabase/migrations/20261029000000_ori_sec_007_harden_rls.sql
--
-- Le script crée ses fixtures puis termine par ROLLBACK.
-- En cas d'échec, la transaction reste ouverte : fermer la session ou
-- exécuter ROLLBACK avant de relancer.
--
-- Hypothèses Supabase standard :
--   - schémas auth/storage disponibles ;
--   - rôles anon/authenticated/service_role disponibles ;
--   - droits de table par défaut accordés aux rôles Supabase.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CONTRÔLES CATALOGUE (exécutés en tant que propriétaire)
-- ============================================================

DO $$
DECLARE
  v_table text;
  v_missing text;
  v_core_tables text[] := ARRAY[
    'roles', 'schools', 'users', 'profiles', 'user_roles', 'licenses',
    'devices', 'audit_logs', 'academic_years', 'students', 'classes',
    'enrollments', 'subjects', 'grade_types', 'grading_periods',
    'class_subjects', 'teacher_assignments', 'grades', 'enrollment_history',
    'fee_structures', 'payments', 'staff', 'sections', 'levels', 'series',
    'library_categories', 'library_books', 'library_copies', 'library_readers',
    'library_loans', 'library_returns', 'library_penalties',
    'library_reservations', 'library_settings'
  ];
  v_policy_features text[] := ARRAY[
    'academic_years', 'students', 'classes', 'enrollments', 'subjects',
    'grade_types', 'grading_periods', 'class_subjects', 'teacher_assignments',
    'grades', 'fee_structures', 'payments', 'staff', 'sections', 'levels',
    'series', 'library_categories', 'library_books', 'library_copies',
    'library_readers', 'library_loans', 'library_returns', 'library_penalties',
    'library_reservations', 'library_settings'
  ];
  v_funcs text[] := ARRAY[
    'public.is_super_admin()',
    'public.user_school_ids()',
    'public.has_school_role(text,text[])',
    'public.can_manage_school(text,text[])',
    'public.enrollment_school_id(text)',
    'public.delete_school_cascade(text)'
  ];
  v_func text;
  v_cmd text;
  v_policy text;
  v_count integer;
BEGIN
  -- Toutes les tables connues présentes doivent avoir RLS activée.
  FOREACH v_table IN ARRAY v_core_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND NOT (SELECT c.relrowsecurity
                FROM pg_class c
                WHERE c.oid = to_regclass('public.' || v_table)) THEN
      v_missing := coalesce(v_missing || ', ', '') || v_table;
    END IF;
  END LOOP;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS absente sur : %', v_missing;
  END IF;

  -- Les anciennes politiques permissives du module académique ont disparu.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'Permettre tout aux utilisateurs authentifiés'
  ) THEN
    RAISE EXCEPTION 'Ancienne politique académique permissive encore présente';
  END IF;

  -- Politiques explicites SELECT/INSERT/UPDATE/DELETE pour les tables à school_id.
  FOREACH v_table IN ARRAY v_policy_features LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = 'school_id'
       ) THEN
      FOREACH v_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        v_policy := v_table || '_' || lower(v_cmd);
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = v_table
            AND policyname = v_policy
            AND cmd = v_cmd
        ) THEN
          RAISE EXCEPTION 'Politique manquante : public.% (%)', v_policy, v_cmd;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Tables spécifiques hors boucle school_id.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roles'
      AND policyname = 'sec007_roles_select' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politique roles SELECT manquante';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schools'
      AND policyname = 'sec007_schools_select' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politique schools SELECT manquante';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'sec007_users_select_self' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politique users SELECT self manquante';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'sec007_profiles_select_self' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'sec007_profiles_select_managers' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politiques profiles SELECT manquantes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'sec007_user_roles_select_self' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'sec007_user_roles_select_managers' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politiques user_roles SELECT manquantes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'licenses'
      AND policyname = 'sec007_licenses_select_own' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Politique licenses SELECT manquante';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'enrollment_history'
      AND policyname = 'sec007_enrollment_history_select' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'enrollment_history'
      AND policyname = 'sec007_enrollment_history_insert' AND cmd = 'INSERT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'enrollment_history'
      AND policyname = 'sec007_enrollment_history_update' AND cmd = 'UPDATE'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'enrollment_history'
      AND policyname = 'sec007_enrollment_history_delete' AND cmd = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'Politiques enrollment_history manquantes';
  END IF;

  -- roles : lecture seule, aucun DML client.
  IF has_table_privilege('authenticated', 'public.roles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.roles', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.roles', 'DELETE')
     OR has_table_privilege('authenticated', 'public.roles', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated possède encore un privilège DML sur roles';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.roles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated ne peut pas lire roles';
  END IF;

  -- anon ne doit plus pouvoir lire les données métier ni exécuter les helpers.
  IF has_table_privilege('anon', 'public.students', 'SELECT')
     OR has_table_privilege('anon', 'public.licenses', 'SELECT')
     OR has_table_privilege('anon', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'anon possède encore un privilège de lecture métier';
  END IF;

  -- Helpers SECURITY DEFINER : propriétaire, search_path, exécution.
  FOREACH v_func IN ARRAY v_funcs LOOP
    IF to_regprocedure(v_func) IS NULL THEN
      RAISE EXCEPTION 'Fonction absente : %', v_func;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_func)) THEN
      RAISE EXCEPTION 'Fonction non SECURITY DEFINER : %', v_func;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(v_func)
        AND p.proconfig IS NOT NULL
        AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION 'search_path non figé : %', v_func;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(v_func)
        AND pg_get_userbyid(p.proowner) IN ('anon', 'authenticated')
    ) THEN
      RAISE EXCEPTION 'Fonction détenue par un rôle client : %', v_func;
    END IF;
    IF has_function_privilege('anon', v_func, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon peut exécuter : %', v_func;
    END IF;
    IF NOT has_function_privilege('authenticated', v_func, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated ne peut pas exécuter : %', v_func;
    END IF;
  END LOOP;

  -- La surcharge uuid dangereuse de delete_school_cascade ne doit plus exister.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'delete_school_cascade'
      AND pg_get_function_identity_arguments(p.oid) = 'p_school_id uuid'
  ) THEN
    RAISE EXCEPTION 'Ancienne surcharge delete_school_cascade(uuid) encore présente';
  END IF;

  -- La fonction de suppression doit contenir le contrôle SUPER_ADMIN.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.delete_school_cascade(text)')
      AND pg_get_functiondef(p.oid) LIKE '%is_super_admin%'
  ) THEN
    RAISE EXCEPTION 'delete_school_cascade ne vérifie pas is_super_admin()';
  END IF;

  -- Storage : écritures limitées au dossier school_id.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'staff_photos_auth_insert', 'staff_photos_auth_update',
        'staff_photos_auth_delete', 'student_photos_auth_insert',
        'student_photos_auth_update', 'student_photos_auth_delete'
      );
    IF v_count <> 6 THEN
      RAISE EXCEPTION 'Politiques Storage manquantes (%/6)', v_count;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN (
          'staff_photos_auth_insert', 'staff_photos_auth_update',
          'staff_photos_auth_delete', 'student_photos_auth_insert',
          'student_photos_auth_update', 'student_photos_auth_delete'
        )
        AND coalesce(qual, with_check, '') NOT LIKE '%user_school_ids%'
    ) THEN
      RAISE EXCEPTION 'Politique Storage non limitée à user_school_ids()';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 2. FIXTURES — 2 ÉTABLISSEMENTS, RÔLES ET UTILISATEURS
-- ============================================================

-- Identifiants fixes pour rendre les assertions lisibles.
-- Établissements : A = ...1111, B = ...2222.
-- Utilisateurs :
--   dirA      a111...  DIRECTION   école A
--   profA     a222...  PROFESSEUR  école A
--   softA     a333...  DIRECTION   profil soft-deleted, rôle encore présent
--   inactiveA a444...  DIRECTION   users.status = INACTIVE
--   secA      a555...  SECRETAIRE  école A
--   dirB      b111...  DIRECTION   école B
--   super     c111...  SUPER_ADMIN global (user_roles.school_id NULL)

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'ori.sec007.dir.a@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'ori.sec007.prof.a@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'ori.sec007.soft.a@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'a4444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'ori.sec007.inactive.a@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'a5555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'ori.sec007.sec.a@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'ori.sec007.dir.b@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text),
  ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'ori.sec007.super@example.invalid', 'not-used',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text);

INSERT INTO public.schools (id, name, short_name, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'ORI SEC007 École A', 'SEC007-A', 'ACTIVE'),
  ('22222222-2222-4222-8222-222222222222', 'ORI SEC007 École B', 'SEC007-B', 'ACTIVE');

INSERT INTO public.users (id, email, status) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'ori.sec007.dir.a@example.invalid', 'ACTIVE'),
  ('a2222222-2222-4222-8222-222222222222', 'ori.sec007.prof.a@example.invalid', 'ACTIVE'),
  ('a3333333-3333-4333-8333-333333333333', 'ori.sec007.soft.a@example.invalid', 'ACTIVE'),
  ('a4444444-4444-4444-8444-444444444444', 'ori.sec007.inactive.a@example.invalid', 'INACTIVE'),
  ('a5555555-5555-4555-8555-555555555555', 'ori.sec007.sec.a@example.invalid', 'ACTIVE'),
  ('b1111111-1111-4111-8111-111111111111', 'ori.sec007.dir.b@example.invalid', 'ACTIVE'),
  ('c1111111-1111-4111-8111-111111111111', 'ori.sec007.super@example.invalid', 'ACTIVE');

INSERT INTO public.profiles (user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Direction', 'A', NULL),
  ('a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Professeur', 'A', NULL),
  ('a3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Soft', 'A', now()),
  ('a4444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Inactive', 'A', NULL),
  ('a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Secrétaire', 'A', NULL),
  ('b1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Direction', 'B', NULL),
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Super', 'Admin', NULL);

INSERT INTO public.user_roles (user_id, school_id, role_id) VALUES
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   (SELECT id FROM public.roles WHERE name = 'PROFESSEUR')),
  ('a3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('a4444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
   (SELECT id FROM public.roles WHERE name = 'SECRETAIRE')),
  ('b1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('c1111111-1111-4111-8111-111111111111', NULL,
   (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN'));

INSERT INTO public.students (id, school_id, first_name, last_name, matricule) VALUES
  ('a0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Élève', 'A', 'SEC007-A-001'),
  ('b0000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Élève', 'B', 'SEC007-B-001');

INSERT INTO public.academic_years (id, school_id, name, status) VALUES
  ('a0000010-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', '2025-2026 A', 'PLANNED'),
  ('b0000010-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', '2025-2026 B', 'PLANNED');

INSERT INTO public.classes (id, school_id, academic_year_id, name) VALUES
  ('a0000020-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'Classe A'),
  ('b0000020-0000-4000-8000-000000000020', '22222222-2222-4222-8222-222222222222',
   'b0000010-0000-4000-8000-000000000010', 'Classe B');

INSERT INTO public.enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type) VALUES
  ('a0000030-0000-4000-8000-000000000030', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'a0000001-0000-4000-8000-000000000001',
   'a0000020-0000-4000-8000-000000000020', 'NOUVELLE'),
  ('b0000030-0000-4000-8000-000000000030', '22222222-2222-4222-8222-222222222222',
   'b0000010-0000-4000-8000-000000000010', 'b0000001-0000-4000-8000-000000000001',
   'b0000020-0000-4000-8000-000000000020', 'NOUVELLE');

INSERT INTO public.enrollment_history (
  id, enrollment_id, student_id, academic_year_id, reason, changed_by
) VALUES
  ('a0000040-0000-4000-8000-000000000040', 'a0000030-0000-4000-8000-000000000030',
   'a0000001-0000-4000-8000-000000000001', 'a0000010-0000-4000-8000-000000000010',
   'Inscription A', 'a1111111-1111-4111-8111-111111111111'),
  ('b0000040-0000-4000-8000-000000000040', 'b0000030-0000-4000-8000-000000000030',
   'b0000001-0000-4000-8000-000000000001', 'b0000010-0000-4000-8000-000000000010',
   'Inscription B', 'b1111111-1111-4111-8111-111111111111');

INSERT INTO public.subjects (id, school_id, name, code) VALUES
  ('a0000050-0000-4000-8000-000000000050', '11111111-1111-4111-8111-111111111111', 'Maths A', 'MATH-A'),
  ('b0000050-0000-4000-8000-000000000050', '22222222-2222-4222-8222-222222222222', 'Maths B', 'MATH-B');

INSERT INTO public.grade_types (id, school_id, name, weight, max_score) VALUES
  ('a0000060-0000-4000-8000-000000000060', '11111111-1111-4111-8111-111111111111', 'Devoir A', 1, 20);

INSERT INTO public.grading_periods (
  id, school_id, academic_year_id, name, period_order, is_active
) VALUES
  ('a0000061-0000-4000-8000-000000000061', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'Trimestre A', 1, true);

INSERT INTO public.class_subjects (
  id, school_id, academic_year_id, class_id, subject_id, coefficient
) VALUES
  ('a0000062-0000-4000-8000-000000000062', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'a0000020-0000-4000-8000-000000000020',
   'a0000050-0000-4000-8000-000000000050', 1);

INSERT INTO public.teacher_assignments (
  id, school_id, academic_year_id, teacher_id, class_subject_id
) VALUES
  ('a0000063-0000-4000-8000-000000000063', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'a2222222-2222-4222-8222-222222222222',
   'a0000062-0000-4000-8000-000000000062');

INSERT INTO public.grades (
  id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id,
  grading_period_id, grade_type_id, score, recorded_by
) VALUES
  ('a0000064-0000-4000-8000-000000000064', '11111111-1111-4111-8111-111111111111',
   'a0000010-0000-4000-8000-000000000010', 'a0000030-0000-4000-8000-000000000030',
   'a0000001-0000-4000-8000-000000000001', 'a0000062-0000-4000-8000-000000000062',
   'a0000061-0000-4000-8000-000000000061', 'a0000060-0000-4000-8000-000000000060',
   12, 'a2222222-2222-4222-8222-222222222222');

INSERT INTO public.licenses (id, school_id, license_key, status) VALUES
  ('a0000070-0000-4000-8000-000000000070', '11111111-1111-4111-8111-111111111111', 'ORION-SEC0-07AA-0001', 'ACTIVE'),
  ('b0000070-0000-4000-8000-000000000070', '22222222-2222-4222-8222-222222222222', 'ORION-SEC0-07BB-0002', 'ACTIVE');

-- ============================================================
-- 3. SANS SESSION : anon ne doit plus rien lire
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.students LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'anon peut lire public.students';
  END IF;

  IF has_function_privilege(current_user, 'public.is_super_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut exécuter is_super_admin()';
  END IF;

  RAISE NOTICE 'OK 1/8 — anon sans accès';
END $$;

RESET ROLE;

-- ============================================================
-- 4. DIRECTION ÉCOLE A : périmètre, CRUD, refus inter-écoles
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_rows integer;
  v_denied boolean;
BEGIN
  SELECT count(*) INTO v_count FROM public.schools;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.schools WHERE id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit % établissement(s) au lieu de 1', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.students;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.students WHERE id = 'b0000001-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit les élèves de B';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = 'b1111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit le profil de B';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = 'b1111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit les rôles de B';
  END IF;

  SELECT count(*) INTO v_count FROM public.licenses;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.licenses WHERE id = 'b0000070-0000-4000-8000-000000000070'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit les licences de B';
  END IF;

  SELECT count(*) INTO v_count FROM public.enrollment_history;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.enrollment_history
    WHERE id = 'b0000040-0000-4000-8000-000000000040'
  ) THEN
    RAISE EXCEPTION 'DIRECTION A voit l''historique de B';
  END IF;

  -- CRUD autorisé dans l'école A.
  INSERT INTO public.students (id, school_id, first_name, last_name, matricule)
  VALUES ('a0000080-0000-4000-8000-000000000080',
          '11111111-1111-4111-8111-111111111111', 'Créé', 'A', 'SEC007-A-080');

  UPDATE public.students
  SET first_name = 'Modifié'
  WHERE id = 'a0000080-0000-4000-8000-000000000080';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIRECTION A ne peut pas modifier son élève (% lignes)', v_rows;
  END IF;

  DELETE FROM public.students
  WHERE id = 'a0000080-0000-4000-8000-000000000080';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIRECTION A ne peut pas supprimer son élève (% lignes)', v_rows;
  END IF;

  INSERT INTO public.subjects (id, school_id, name, code)
  VALUES ('a0000081-0000-4000-8000-000000000081',
          '11111111-1111-4111-8111-111111111111', 'SVT A', 'SVT-A');
  DELETE FROM public.subjects WHERE id = 'a0000081-0000-4000-8000-000000000081';

  INSERT INTO public.enrollment_history (
    id, enrollment_id, student_id, academic_year_id, reason, changed_by
  ) VALUES (
    'a0000082-0000-4000-8000-000000000082', 'a0000030-0000-4000-8000-000000000030',
    'a0000001-0000-4000-8000-000000000001', 'a0000010-0000-4000-8000-000000000010',
    'Test A', 'a1111111-1111-4111-8111-111111111111'
  );
  DELETE FROM public.enrollment_history WHERE id = 'a0000082-0000-4000-8000-000000000082';

  -- Insertion inter-écoles : refusée par le WITH CHECK.
  v_denied := false;
  BEGIN
    INSERT INTO public.students (id, school_id, first_name, last_name)
    VALUES ('a0000083-0000-4000-8000-000000000083',
            '22222222-2222-4222-8222-222222222222', 'Intrus', 'B');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION A peut créer un élève dans B';
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.enrollment_history (
      id, enrollment_id, student_id, academic_year_id, reason, changed_by
    ) VALUES (
      'a0000084-0000-4000-8000-000000000084', 'b0000030-0000-4000-8000-000000000030',
      'b0000001-0000-4000-8000-000000000001', 'b0000010-0000-4000-8000-000000000010',
      'Intrusion B', 'a1111111-1111-4111-8111-111111111111'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION A peut insérer un historique dans B';
  END IF;

  -- Update/delete inter-écoles : 0 ligne, pas d'effet.
  UPDATE public.students SET first_name = 'Intrus'
  WHERE id = 'b0000001-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION A peut modifier un élève de B';
  END IF;

  DELETE FROM public.students
  WHERE id = 'b0000001-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION A peut supprimer un élève de B';
  END IF;

  -- Escalade via public.roles : nom du rôle inchangé.
  v_rows := 0;
  BEGIN
    UPDATE public.roles SET name = 'SUPER_ADMIN_ESCALADE' WHERE name = 'DIRECTION';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION A peut modifier public.roles';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.roles WHERE name = 'DIRECTION'
  ) THEN
    RAISE EXCEPTION 'Le rôle DIRECTION a été altéré';
  END IF;

  -- Auto-attribution SUPER_ADMIN refusée.
  v_denied := false;
  BEGIN
    INSERT INTO public.user_roles (user_id, school_id, role_id)
    VALUES ('a1111111-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111',
            (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN'));
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION A peut s''attribuer SUPER_ADMIN';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = 'a1111111-1111-4111-8111-111111111111'
      AND r.name = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'SUPER_ADMIN a été attribué à DIRECTION A';
  END IF;

  -- Suppression d'école réservée au SUPER_ADMIN.
  v_denied := false;
  BEGIN
    PERFORM public.delete_school_cascade('11111111-1111-4111-8111-111111111111');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION A peut supprimer une école';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.schools WHERE id = '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'École A supprimée par un non SUPER_ADMIN';
  END IF;

  -- Pas d'écriture licence depuis le client.
  v_rows := 0;
  BEGIN
    UPDATE public.licenses SET status = 'REVOKED'
    WHERE id = 'a0000070-0000-4000-8000-000000000070';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION A peut modifier sa licence';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.licenses
    WHERE id = 'a0000070-0000-4000-8000-000000000070' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Licence A modifiée par DIRECTION';
  END IF;

  RAISE NOTICE 'OK 2/8 — DIRECTION A : périmètre et CRUD';
END $$;

RESET ROLE;

-- ============================================================
-- 5. SECRÉTAIRE ÉCOLE A : écriture métier autorisée
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.students (id, school_id, first_name, last_name)
    VALUES ('a0000085-0000-4000-8000-000000000085',
            '11111111-1111-4111-8111-111111111111', 'Secrétaire', 'A');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF v_denied THEN
    RAISE EXCEPTION 'SECRETAIRE A ne peut pas créer un élève';
  END IF;
  DELETE FROM public.students WHERE id = 'a0000085-0000-4000-8000-000000000085';

  RAISE NOTICE 'OK 3/8 — SECRETAIRE A autorisé sur son école';
END $$;

RESET ROLE;

-- ============================================================
-- 6. PROFESSEUR ÉCOLE A : lecture école, écriture limitée, pas d'admin
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
BEGIN
  SELECT count(*) INTO v_count FROM public.students;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.students WHERE id = 'b0000001-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'PROFESSEUR A voit les données de B';
  END IF;

  SELECT count(*) INTO v_count FROM public.grades;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.grades WHERE id = 'b0000064-0000-4000-8000-000000000064'
  ) THEN
    RAISE EXCEPTION 'PROFESSEUR A voit les notes de B';
  END IF;

  IF public.can_manage_school(
    '11111111-1111-4111-8111-111111111111',
    ARRAY['DIRECTION','SECRETAIRE']::text[]
  ) THEN
    RAISE EXCEPTION 'PROFESSEUR A obtient des droits réservés DIRECTION/SECRETAIRE';
  END IF;

  -- Écriture notes autorisée dans A.
  INSERT INTO public.grades (
    id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id,
    grading_period_id, grade_type_id, score, recorded_by
  ) VALUES (
    'a0000086-0000-4000-8000-000000000086', '11111111-1111-4111-8111-111111111111',
    'a0000010-0000-4000-8000-000000000010', 'a0000030-0000-4000-8000-000000000030',
    'a0000001-0000-4000-8000-000000000001', 'a0000062-0000-4000-8000-000000000062',
    'a0000061-0000-4000-8000-000000000061', 'a0000060-0000-4000-8000-000000000060',
    15, 'a2222222-2222-4222-8222-222222222222'
  );
  DELETE FROM public.grades WHERE id = 'a0000086-0000-4000-8000-000000000086';

  -- Création élève interdite au PROFESSEUR.
  v_denied := false;
  BEGIN
    INSERT INTO public.students (id, school_id, first_name, last_name)
    VALUES ('a0000087-0000-4000-8000-000000000087',
            '11111111-1111-4111-8111-111111111111', 'Prof', 'Interdit');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'PROFESSEUR A peut créer un élève';
  END IF;

  -- Grade inter-écoles refusé.
  v_denied := false;
  BEGIN
    INSERT INTO public.grades (
      id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id,
      grading_period_id, grade_type_id, score, recorded_by
    ) VALUES (
      'a0000088-0000-4000-8000-000000000088', '22222222-2222-4222-8222-222222222222',
      'a0000010-0000-4000-8000-000000000010', 'a0000030-0000-4000-8000-000000000030',
      'a0000001-0000-4000-8000-000000000001', 'a0000062-0000-4000-8000-000000000062',
      'a0000061-0000-4000-8000-000000000061', 'a0000060-0000-4000-8000-000000000060',
      16, 'a2222222-2222-4222-8222-222222222222'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'PROFESSEUR A peut écrire une note dans B';
  END IF;

  RAISE NOTICE 'OK 4/8 — PROFESSEUR A : lecture école et notes';
END $$;

RESET ROLE;

-- ============================================================
-- 7. DIRECTION ÉCOLE B : isolation symétrique
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_rows integer;
  v_denied boolean;
BEGIN
  SELECT count(*) INTO v_count FROM public.schools;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.schools WHERE id = '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'DIRECTION B voit % établissement(s) au lieu de 1', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.students;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.students WHERE id = 'a0000001-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'DIRECTION B voit les élèves de A';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = 'a1111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'DIRECTION B voit le profil de A';
  END IF;

  SELECT count(*) INTO v_count FROM public.licenses;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.licenses WHERE id = 'a0000070-0000-4000-8000-000000000070'
  ) THEN
    RAISE EXCEPTION 'DIRECTION B voit les licences de A';
  END IF;

  SELECT count(*) INTO v_count FROM public.enrollment_history;
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.enrollment_history
    WHERE id = 'a0000040-0000-4000-8000-000000000040'
  ) THEN
    RAISE EXCEPTION 'DIRECTION B voit l''historique de A';
  END IF;

  INSERT INTO public.students (id, school_id, first_name, last_name)
  VALUES ('b0000080-0000-4000-8000-000000000080',
          '22222222-2222-4222-8222-222222222222', 'Créé', 'B');
  DELETE FROM public.students WHERE id = 'b0000080-0000-4000-8000-000000000080';

  v_denied := false;
  BEGIN
    INSERT INTO public.students (id, school_id, first_name, last_name)
    VALUES ('b0000081-0000-4000-8000-000000000081',
            '11111111-1111-4111-8111-111111111111', 'Intrus', 'A');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION B peut créer un élève dans A';
  END IF;

  UPDATE public.students SET first_name = 'Intrus'
  WHERE id = 'a0000001-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION B peut modifier un élève de A';
  END IF;

  DELETE FROM public.students
  WHERE id = 'a0000001-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DIRECTION B peut supprimer un élève de A';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.delete_school_cascade('11111111-1111-4111-8111-111111111111');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'DIRECTION B peut supprimer l''école A';
  END IF;

  RAISE NOTICE 'OK 5/8 — DIRECTION B : isolation symétrique';
END $$;

RESET ROLE;

-- ============================================================
-- 8. PROFIL SOFT-DELETED ET UTILISATEUR INACTIF
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.user_school_ids();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Profil soft-deleted conserve % école(s) via user_roles', v_count;
  END IF;

  IF public.has_school_role(
       '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
     ) THEN
    RAISE EXCEPTION 'Profil soft-deleted conserve has_school_role()';
  END IF;

  SELECT count(*) INTO v_count FROM public.schools;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Profil soft-deleted voit encore son établissement';
  END IF;

  RAISE NOTICE 'OK 6/8 — profil soft-deleted sans accès';
END $$;

RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.user_school_ids();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Utilisateur INACTIVE conserve % école(s)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.schools;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Utilisateur INACTIVE voit encore son établissement';
  END IF;

  RAISE NOTICE 'OK 7/8 — utilisateur INACTIVE sans accès';
END $$;

RESET ROLE;

-- ============================================================
-- 9. SUPER_ADMIN : accès global et suppression contrôlée
-- ============================================================

SELECT set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Compte SUPER_ADMIN non reconnu';
  END IF;

  SELECT count(*) INTO v_count FROM public.schools;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'SUPER_ADMIN voit % établissement(s) au lieu de 2', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.licenses;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'SUPER_ADMIN voit % licence(s) au lieu de 2', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = 'b1111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'SUPER_ADMIN ne voit pas le profil de B';
  END IF;

  PERFORM public.delete_school_cascade('22222222-2222-4222-8222-222222222222');

  IF EXISTS (
    SELECT 1 FROM public.schools WHERE id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'SUPER_ADMIN n''a pas supprimé l''école B';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.students WHERE school_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'Données de B restantes après suppression';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE school_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'Rôles de B restants après suppression';
  END IF;

  RAISE NOTICE 'OK 8/8 — SUPER_ADMIN global et suppression contrôlée';
END $$;

RESET ROLE;

-- Aucune fixture ne doit rester en base.
ROLLBACK;

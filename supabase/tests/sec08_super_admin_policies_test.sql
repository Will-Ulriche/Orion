-- ============================================================
-- SEC08 — Tests du durcissement des politiques SUPER_ADMIN
-- À exécuter sur une base Supabase de TEST, après 20261118000000.
-- Le script termine par ROLLBACK.
-- ============================================================

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('1a111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-active@test.local', '', NOW(), NOW(), NOW()),
  ('1a222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-softdel@test.local', '', NOW(), NOW(), NOW()),
  ('1a333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-inactive@test.local', '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'École Alpha')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name) VALUES
  ('role_admin', 'SUPER_ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('1a111111-1111-4111-8111-111111111111', 'sa-active@test.local', 'ACTIVE'),
  ('1a222222-2222-4222-8222-222222222222', 'sa-softdel@test.local', 'ACTIVE'),
  ('1a333333-3333-4333-8333-333333333333', 'sa-inactive@test.local', 'INACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('1b111111-1111-4111-8111-111111111111', '1a111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Sa', 'Active', NULL),
  ('1b222222-2222-4222-8222-222222222222', '1a222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Sa', 'SoftDeleted', NOW()),
  ('1b333333-3333-4333-8333-333333333333', '1a333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Sa', 'Inactive', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('1c111111-1111-4111-8111-111111111111', '1a111111-1111-4111-8111-111111111111', NULL, 'role_admin'),
  ('1c222222-2222-4222-8222-222222222222', '1a222222-2222-4222-8222-222222222222', NULL, 'role_admin'),
  ('1c333333-3333-4333-8333-333333333333', '1a333333-3333-4333-8333-333333333333', NULL, 'role_admin')
ON CONFLICT (id) DO NOTHING;

DO $sec08$
DECLARE
  v_table text;
  v_cmd text;
  v_policy text;
  v_tables text[] := ARRAY['schools', 'licenses', 'devices', 'profiles', 'users', 'user_roles'];
BEGIN
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'is_super_admin() absente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.is_super_admin()')
      AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%p.deleted_at IS NULL%'
      AND array_to_string(coalesce(proconfig, ARRAY[]::text[]), ',') LIKE '%search_path=public, pg_temp%'
  ) THEN
    RAISE EXCEPTION 'is_super_admin() non durcie';
  END IF;
  IF has_function_privilege('anon', 'public.is_super_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut exécuter is_super_admin()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'super_admin_schools_all', 'super_admin_licenses_all', 'super_admin_devices_all',
        'super_admin_profiles_all', 'super_admin_users_all', 'super_admin_user_roles_all'
      )
  ) THEN
    RAISE EXCEPTION 'Ancienne politique super_admin_*_all encore présente';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'anon possède encore un privilège sur public.%', v_table;
    END IF;
    FOREACH v_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      v_policy := 'sec08_' || v_table || '_' || lower(v_cmd);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = v_table
          AND policyname = v_policy
          AND cmd = v_cmd
          AND 'authenticated' = ANY(roles)
      ) THEN
        RAISE EXCEPTION 'Politique manquante : public.% (%)', v_policy, v_cmd;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'OK — catalogue SEC08 conforme';
END
$sec08$;

SELECT set_config('request.jwt.claim.sub', '1a111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '1a111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $sec08$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_result;
  IF NOT v_result THEN
    RAISE EXCEPTION 'ÉCHEC : SUPER_ADMIN actif non reconnu';
  END IF;
  RAISE NOTICE 'OK — SUPER_ADMIN actif reconnu';
END
$sec08$;

SELECT set_config('request.jwt.claim.sub', '1a222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '1a222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

DO $sec08$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'ÉCHEC : SUPER_ADMIN au profil soft-deleté reconnu';
  END IF;
  RAISE NOTICE 'OK — SUPER_ADMIN soft-deleté refusé';
END
$sec08$;

SELECT set_config('request.jwt.claim.sub', '1a333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '1a333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

DO $sec08$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'ÉCHEC : SUPER_ADMIN inactif reconnu';
  END IF;
  RAISE NOTICE 'OK — SUPER_ADMIN inactif refusé';
END
$sec08$;

ROLLBACK;

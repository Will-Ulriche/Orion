-- ============================================================
-- SEC05 — Tests de public.check_user_has_role — vérification du profil actif
-- ============================================================
-- À exécuter sur une base Supabase de TEST (jamais en production),
-- après application de la migration 20261104000000_sec05_check_user_has_role_profile_check.sql.
--
-- Le script crée ses fixtures puis termine par ROLLBACK.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. FIXTURES
-- ============================================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'active@test.local', '', NOW(), NOW(), NOW()),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'softdel@test.local', '', NOW(), NOW(), NOW()),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noprofile@test.local', '', NOW(), NOW(), NOW()),
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wrongschool@test.local', '', NOW(), NOW(), NOW()),
  ('a5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive@test.local', '', NOW(), NOW(), NOW()),
  ('a6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'comptable@test.local', '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'École Alpha'),
  ('22222222-2222-4222-8222-222222222222', 'École Bêta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name) VALUES
  ('role_dir', 'DIRECTION'),
  ('role_sec', 'SECRETAIRE'),
  ('role_compta', 'COMPTABLE'),
  ('role_prof', 'PROFESSEUR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'active@test.local', 'ACTIVE'),
  ('a2222222-2222-4222-8222-222222222222', 'softdel@test.local', 'ACTIVE'),
  ('a3333333-3333-4333-8333-333333333333', 'noprofile@test.local', 'ACTIVE'),
  ('a4444444-4444-4444-8444-444444444444', 'wrongschool@test.local', 'ACTIVE'),
  ('a5555555-5555-4555-8555-555555555555', 'inactive@test.local', 'INACTIVE'),
  ('a6666666-6666-4666-8666-666666666666', 'comptable@test.local', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Active', 'One', NULL),
  ('b2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Soft', 'Deleted', NOW()),
  ('b4444444-4444-4444-8444-444444444444', 'a4444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Wrong', 'School', NULL),
  ('b5555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Inactive', 'One', NULL),
  ('b6666666-6666-4666-8666-666666666666', 'a6666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Comptable', 'One', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c3333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c4444444-4444-4444-8444-444444444444', 'a4444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'role_dir'),
  ('c5555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c6666666-6666-4666-8666-666666666666', 'a6666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'role_compta')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. TESTS
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]) INTO v_result;
  IF NOT v_result THEN
    RAISE EXCEPTION 'TEST 1 ÉCHEC : profil actif + DIRECTION devrait être autorisé';
  END IF;
  RAISE NOTICE 'OK 1/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a6666666-6666-4666-8666-666666666666', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['COMPTABLE']::text[]) INTO v_result;
  IF NOT v_result THEN
    RAISE EXCEPTION 'TEST 2 ÉCHEC : profil actif + COMPTABLE devrait être autorisé';
  END IF;
  RAISE NOTICE 'OK 2/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 3 ÉCHEC : profil soft-deleté + DIRECTION devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 3/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 4 ÉCHEC : aucun profil + DIRECTION devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 4/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 5 ÉCHEC : profil école Bêta + accès Alpha devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 5/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 6 ÉCHEC : compte INACTIVE devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 6/7';
END
$sec05$;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

DO $sec05$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role('11111111-1111-4111-8111-111111111111', ARRAY['COMPTABLE']::text[]) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 7 ÉCHEC : rôle DIRECTION + demande COMPTABLE devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 7/7';
END
$sec05$;

-- ============================================================
-- 3. VÉRIFICATION DES POLITIQUES RLS EXISTANTES
-- ============================================================

DO $sec05$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('fee_structures', 'payments')
    AND (qual LIKE '%check_user_has_role%' OR with_check LIKE '%check_user_has_role%');
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'ÉCHEC : % politique(s) RLS utilisent check_user_has_role (attendu 8)', v_count;
  END IF;
  RAISE NOTICE 'OK — 8 politiques RLS utilisent check_user_has_role';
END
$sec05$;

ROLLBACK;

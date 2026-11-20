-- ============================================================
-- Tests — durcissement global du statut public.users
-- ============================================================
-- À exécuter sur une base Supabase de TEST (jamais en production),
-- après application de 20261120000000_users_status_not_null_hardening.sql.
-- Le script crée ses fixtures puis termine par ROLLBACK.
--
-- Cas couverts : ACTIVE, INACTIVE, SUSPENDED, NULL (ligne héritée simulée),
-- profil supprimé logiquement, absence de profil actif, SUPER_ADMIN inactif
-- ou avec statut NULL. Tous les cas non ACTIVE doivent être refusés par
-- is_super_admin(), user_school_ids(), has_school_role(),
-- check_user_has_role() et can_manage_school().
-- ============================================================

BEGIN;

-- ============================================================
-- 1. VÉRIFICATION DU SCHÉMA ET DES DÉFINITIONS
-- ============================================================

DO $status_schema$
DECLARE
  v_null_rows integer;
  v_permissive_functions integer;
  v_hardened_functions integer;
BEGIN
  SELECT count(*) INTO v_null_rows FROM public.users WHERE status IS NULL;
  IF v_null_rows <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : % ligne(s) public.users ont encore status NULL', v_null_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'status'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : public.users.status doit être NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_status_allowed'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : contrainte CHECK users_status_allowed absente';
  END IF;

  WITH function_defs AS MATERIALIZED (
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  )
  SELECT count(*) INTO v_permissive_functions
  FROM function_defs
  WHERE definition LIKE '%public.users u%'
    AND definition LIKE '%status <> %ACTIVE%';
  IF v_permissive_functions <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : % fonction(s) conservent NOT EXISTS(... status <> ACTIVE)', v_permissive_functions;
  END IF;

  WITH function_defs AS MATERIALIZED (
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  )
  SELECT count(DISTINCT oid) INTO v_hardened_functions
  FROM function_defs
  WHERE proname IN ('is_super_admin', 'user_school_ids', 'has_school_role', 'check_user_has_role')
    AND definition LIKE '%u.status = %ACTIVE%';
  IF v_hardened_functions <> 4 THEN
    RAISE EXCEPTION 'ÉCHEC : seulement % helper(s) exigent explicitement un compte ACTIVE (attendu 4)', v_hardened_functions;
  END IF;

  RAISE NOTICE 'OK — schéma et helpers durcis';
END
$status_schema$;

-- ============================================================
-- 2. CONTRAINTES : NULL ET STATUT ARBITRAIRE SONT REFUSÉS
-- ============================================================

DO $status_constraints$
DECLARE
  v_id uuid := 'b0000010-0000-4000-8000-000000000010';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
    (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-constraint@test.local', '', NOW(), NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, email, status) VALUES
    (v_id, 'status-constraint@test.local', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

  BEGIN
    UPDATE public.users SET status = NULL WHERE id = v_id;
    RAISE EXCEPTION 'ÉCHEC : public.users.status accepte NULL';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'OK — NULL refusé par NOT NULL';
  END;

  BEGIN
    UPDATE public.users SET status = 'UNKNOWN' WHERE id = v_id;
    RAISE EXCEPTION 'ÉCHEC : public.users.status accepte un statut arbitraire';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK — statut hors domaine refusé par CHECK';
  END;
END
$status_constraints$;

-- ============================================================
-- 3. FIXTURES
-- ============================================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('b0000001-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-active@test.local', '', NOW(), NOW(), NOW()),
  ('b0000002-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-inactive@test.local', '', NOW(), NOW(), NOW()),
  ('b0000003-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-suspended@test.local', '', NOW(), NOW(), NOW()),
  ('b0000004-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-null@test.local', '', NOW(), NOW(), NOW()),
  ('b0000005-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-softdel@test.local', '', NOW(), NOW(), NOW()),
  ('b0000006-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-noprofile@test.local', '', NOW(), NOW(), NOW()),
  ('b0000007-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-sa-active@test.local', '', NOW(), NOW(), NOW()),
  ('b0000008-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-sa-inactive@test.local', '', NOW(), NOW(), NOW()),
  ('b0000009-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-sa-null@test.local', '', NOW(), NOW(), NOW()),
  ('b0000011-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'status-orphan@test.local', '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'École statut')
ON CONFLICT (id) DO NOTHING;

-- Le statut NULL est introduit ci-dessous, après levée temporaire de NOT NULL,
-- afin de simuler une ligne héritée d'une base antérieure à la migration.
-- La contrainte est restaurée par le ROLLBACK final.
INSERT INTO public.users (id, email, status) VALUES
  ('b0000001-0000-4000-8000-000000000001', 'status-active@test.local', 'ACTIVE'),
  ('b0000002-0000-4000-8000-000000000002', 'status-inactive@test.local', 'INACTIVE'),
  ('b0000003-0000-4000-8000-000000000003', 'status-suspended@test.local', 'SUSPENDED'),
  ('b0000004-0000-4000-8000-000000000004', 'status-null@test.local', 'ACTIVE'),
  ('b0000005-0000-4000-8000-000000000005', 'status-softdel@test.local', 'ACTIVE'),
  ('b0000006-0000-4000-8000-000000000006', 'status-noprofile@test.local', 'ACTIVE'),
  ('b0000007-0000-4000-8000-000000000007', 'status-sa-active@test.local', 'ACTIVE'),
  ('b0000008-0000-4000-8000-000000000008', 'status-sa-inactive@test.local', 'INACTIVE'),
  ('b0000009-0000-4000-8000-000000000009', 'status-sa-null@test.local', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

ALTER TABLE public.users ALTER COLUMN status DROP NOT NULL;

UPDATE public.users SET status = NULL
 WHERE id IN (
   'b0000004-0000-4000-8000-000000000004',
   'b0000009-0000-4000-8000-000000000009'
 );

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('d0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Active', 'Dir', NULL),
  ('d0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Inactive', 'Dir', NULL),
  ('d0000003-0000-4000-8000-000000000003', 'b0000003-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Suspended', 'Dir', NULL),
  ('d0000004-0000-4000-8000-000000000004', 'b0000004-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'Null', 'Dir', NULL),
  ('d0000005-0000-4000-8000-000000000005', 'b0000005-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'Soft', 'Deleted', NOW()),
  ('d0000007-0000-4000-8000-000000000007', 'b0000007-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'Active', 'SA', NULL),
  ('d0000008-0000-4000-8000-000000000008', 'b0000008-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'Inactive', 'SA', NULL),
  ('d0000009-0000-4000-8000-000000000009', 'b0000009-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'Null', 'SA', NULL)
ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('e0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000003-0000-4000-8000-000000000003', 'b0000003-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000004-0000-4000-8000-000000000004', 'b0000004-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000005-0000-4000-8000-000000000005', 'b0000005-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000006-0000-4000-8000-000000000006', 'b0000006-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('e0000007-0000-4000-8000-000000000007', 'b0000007-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN')),
  ('e0000008-0000-4000-8000-000000000008', 'b0000008-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN')),
  ('e0000009-0000-4000-8000-000000000009', 'b0000009-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN'))
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. ASSERTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.status_hardening_test_assert(
  p_user_id uuid,
  p_school_id uuid,
  p_expect_sa boolean,
  p_expect_role boolean,
  p_expect_manage boolean,
  p_expect_school_count integer,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sa boolean;
  v_has_role boolean;
  v_check_role boolean;
  v_manage boolean;
  v_school_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);

  SELECT public.is_super_admin() INTO v_sa;
  SELECT public.has_school_role(p_school_id::text, ARRAY['DIRECTION']::text[]) INTO v_has_role;
  SELECT public.check_user_has_role(p_school_id::text, ARRAY['DIRECTION']::text[]) INTO v_check_role;
  SELECT public.can_manage_school(p_school_id::text, ARRAY['DIRECTION']::text[]) INTO v_manage;
  SELECT count(*) INTO v_school_count FROM public.user_school_ids();

  IF v_sa IS DISTINCT FROM p_expect_sa
     OR v_has_role IS DISTINCT FROM p_expect_role
     OR v_check_role IS DISTINCT FROM p_expect_role
     OR v_manage IS DISTINCT FROM p_expect_manage
     OR v_school_count <> p_expect_school_count THEN
    RAISE EXCEPTION
      'ÉCHEC % : is_super_admin=%, has_school_role=%, check_user_has_role=%, can_manage_school=%, user_school_ids=% (attendu %, %, %, %, %)',
      p_label, v_sa, v_has_role, v_check_role, v_manage, v_school_count,
      p_expect_sa, p_expect_role, p_expect_role, p_expect_manage, p_expect_school_count;
  END IF;

  RAISE NOTICE 'OK — %', p_label;
END $$;

SET LOCAL ROLE authenticated;

-- Seul le compte ACTIVE avec profil actif est autorisé.
SELECT public.status_hardening_test_assert(
  'b0000001-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  false, true, true, 1, 'utilisateur ACTIVE autorisé');

-- Tous les états non ACTIVE sont refusés, y compris avec rôle et profil valides.
SELECT public.status_hardening_test_assert(
  'b0000002-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'utilisateur INACTIVE refusé');

SELECT public.status_hardening_test_assert(
  'b0000003-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'utilisateur SUSPENDED refusé');

SELECT public.status_hardening_test_assert(
  'b0000004-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'utilisateur avec status NULL refusé');

SELECT public.status_hardening_test_assert(
  'b0000005-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'profil supprimé logiquement refusé');

SELECT public.status_hardening_test_assert(
  'b0000006-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'utilisateur sans profil actif refusé');

-- Le SUPER_ADMIN actif conserve son autorité globale.
SELECT public.status_hardening_test_assert(
  'b0000007-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001',
  true, false, true, 1, 'SUPER_ADMIN ACTIVE autorisé');

-- Un SUPER_ADMIN inactif ou sans statut perd immédiatement ses privilèges.
SELECT public.status_hardening_test_assert(
  'b0000008-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'SUPER_ADMIN INACTIVE refusé');

SELECT public.status_hardening_test_assert(
  'b0000009-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'SUPER_ADMIN avec status NULL refusé');

SELECT public.status_hardening_test_assert(
  'b0000011-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001',
  false, false, false, 0, 'compte sans enregistrement public.users refusé');

-- ============================================================
-- 5. NON-RÉGRESSION DES POLITIQUES RLS
-- ============================================================

DO $status_policies$
DECLARE
  v_sec08_count integer;
  v_financial_count integer;
  v_permissive_policies integer;
BEGIN
  SELECT count(*) INTO v_sec08_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'sec08_schools_select', 'sec08_schools_insert', 'sec08_schools_update', 'sec08_schools_delete',
      'sec08_licenses_select', 'sec08_licenses_insert', 'sec08_licenses_update', 'sec08_licenses_delete',
      'sec08_devices_select', 'sec08_devices_insert', 'sec08_devices_update', 'sec08_devices_delete',
      'sec08_profiles_select', 'sec08_profiles_insert', 'sec08_profiles_update', 'sec08_profiles_delete',
      'sec08_users_select', 'sec08_users_insert', 'sec08_users_update', 'sec08_users_delete',
      'sec08_user_roles_select', 'sec08_user_roles_insert', 'sec08_user_roles_update', 'sec08_user_roles_delete'
    );
  IF v_sec08_count <> 24 THEN
    RAISE EXCEPTION 'ÉCHEC : % politique(s) SEC08 présentes (attendu 24)', v_sec08_count;
  END IF;

  SELECT count(*) INTO v_financial_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('fee_structures', 'payments')
    AND (qual LIKE '%check_user_has_role%' OR with_check LIKE '%check_user_has_role%');
  IF v_financial_count <> 8 THEN
    RAISE EXCEPTION 'ÉCHEC : % politique(s) financières utilisent check_user_has_role (attendu 8)', v_financial_count;
  END IF;

  SELECT count(*) INTO v_permissive_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') LIKE '%status <> %ACTIVE%'
      OR coalesce(with_check, '') LIKE '%status <> %ACTIVE%');
  IF v_permissive_policies <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : % politique(s) RLS utilisent encore un contrôle permissif sur status', v_permissive_policies;
  END IF;

  RAISE NOTICE 'OK — politiques RLS préservées';
END
$status_policies$;

RESET ROLE;
ROLLBACK;
